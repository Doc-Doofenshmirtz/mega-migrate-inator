import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { run, RedactedExecError } from "../util/exec.js";
import { logger } from "../util/logger.js";

export interface RefMap {
  [ref: string]: string; // ref name -> sha
}

const PRUNED_REF_PREFIXES = ["refs/merge-requests", "refs/keep-around", "refs/pipelines", "refs/environments"];

function gitEnv(insecureTls: boolean): Record<string, string> | undefined {
  return insecureTls ? { GIT_SSL_NO_VERIFY: "1" } : undefined;
}

export async function mirrorClone(remoteUrl: string, destDir: string, insecureTls: boolean): Promise<void> {
  if (existsSync(destDir)) {
    await rm(destDir, { recursive: true, force: true });
  }
  await run("git", ["clone", "--mirror", remoteUrl, destDir], {
    label: "git clone --mirror (source)",
    env: gitEnv(insecureTls),
  });
}

export async function listRefs(dir: string): Promise<RefMap> {
  const { stdout } = await run("git", ["for-each-ref", "--format=%(objectname) %(refname)"], {
    cwd: dir,
    label: "git for-each-ref",
  });
  const refs: RefMap = {};
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [sha, ref] = trimmed.split(" ");
    if (sha && ref) refs[ref] = sha;
  }
  return refs;
}

export function isPrunedRef(ref: string): boolean {
  return PRUNED_REF_PREFIXES.some((prefix) => ref.startsWith(prefix));
}

/** Delete GitLab-internal refs that GitHub rejects on push. Returns count pruned. */
export async function pruneInternalRefs(dir: string): Promise<number> {
  const refs = await listRefs(dir);
  const toDelete = Object.keys(refs).filter(isPrunedRef);
  for (const ref of toDelete) {
    await run("git", ["update-ref", "-d", ref], { cwd: dir, label: "git update-ref -d" });
  }
  logger.debug({ dir, count: toDelete.length }, "pruned internal refs");
  return toDelete.length;
}

export async function mirrorPush(dir: string, remoteUrl: string): Promise<void> {
  await run("git", ["push", "--mirror", remoteUrl], { cwd: dir, label: "git push --mirror (target)" });
}

/** Fetches a single ref from `remoteUrl` into `localRef` in `dir`, without touching any other ref. */
export async function fetchRef(dir: string, remoteUrl: string, ref: string, localRef: string): Promise<void> {
  await run("git", ["fetch", remoteUrl, `${ref}:${localRef}`], { cwd: dir, label: "git fetch (target ref, sync check)" });
}

/** True if `ancestorSha` is reachable from `descendantSha` (i.e. updating ancestor -> descendant is a fast-forward). Both objects must already exist in `dir`. */
export async function isAncestor(dir: string, ancestorSha: string, descendantSha: string): Promise<boolean> {
  try {
    await run("git", ["merge-base", "--is-ancestor", ancestorSha, descendantSha], {
      cwd: dir,
      label: "git merge-base --is-ancestor",
    });
    return true;
  } catch (err) {
    if (err instanceof RedactedExecError && err.exitCode === 1) return false;
    throw err;
  }
}

export async function lsRemoteRefs(remoteUrlOrDir: string, isLocalDir: boolean): Promise<RefMap> {
  if (isLocalDir) {
    return listRefs(remoteUrlOrDir);
  }
  const { stdout } = await run("git", ["ls-remote", "--refs", remoteUrlOrDir], { label: "git ls-remote (target)" });
  const refs: RefMap = {};
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [sha, ref] = trimmed.split(/\s+/);
    if (sha && ref) refs[ref] = sha;
  }
  return refs;
}

export interface RefDiff {
  matches: boolean;
  missingOnTarget: string[];
  extraOnTarget: string[];
  shaMismatch: string[];
}

export function diffRefMaps(sourceRefs: RefMap, targetRefs: RefMap): RefDiff {
  const sourceFiltered = Object.fromEntries(
    Object.entries(sourceRefs).filter(([ref]) => !isPrunedRef(ref)),
  );

  const missingOnTarget: string[] = [];
  const shaMismatch: string[] = [];
  for (const [ref, sha] of Object.entries(sourceFiltered)) {
    if (!(ref in targetRefs)) {
      missingOnTarget.push(ref);
    } else if (targetRefs[ref] !== sha) {
      shaMismatch.push(ref);
    }
  }
  const extraOnTarget = Object.keys(targetRefs).filter((ref) => !(ref in sourceFiltered));

  return {
    matches: missingOnTarget.length === 0 && shaMismatch.length === 0,
    missingOnTarget,
    extraOnTarget,
    shaMismatch,
  };
}

export async function isEmptyRepo(dir: string): Promise<boolean> {
  const refs = await listRefs(dir);
  return Object.keys(refs).length === 0;
}

export async function getDefaultBranch(dir: string): Promise<string | null> {
  try {
    const { stdout } = await run("git", ["symbolic-ref", "HEAD"], { cwd: dir, label: "git symbolic-ref HEAD" });
    return stdout.trim().replace(/^refs\/heads\//, "");
  } catch {
    return null;
  }
}

const DEFAULT_LARGE_FILE_BYTES = 100 * 1024 * 1024;
const DEFAULT_WARN_REPO_BYTES = 5 * 1024 * 1024 * 1024;

export interface LargeFile {
  path: string;
  sizeBytes: number;
}

/** Cheap check: scan blobs reachable from HEAD only (not full history). */
export async function checkHeadLargeFiles(dir: string, thresholdBytes = DEFAULT_LARGE_FILE_BYTES): Promise<LargeFile[]> {
  try {
    const { stdout } = await run("git", ["ls-tree", "-r", "-l", "HEAD"], { cwd: dir, label: "git ls-tree HEAD" });
    const large: LargeFile[] = [];
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      // format: <mode> <type> <sha> <size>\t<path>
      const match = line.match(/^\S+ \S+ \S+\s+(\d+)\t(.+)$/);
      if (!match) continue;
      const size = Number(match[1]);
      const filePath = match[2] ?? "(unknown)";
      if (size > thresholdBytes) {
        large.push({ path: filePath, sizeBytes: size });
      }
    }
    return large;
  } catch {
    return [];
  }
}

/** Expensive check across all history; only run with --deep-size-check. */
export async function checkFullHistoryLargeFiles(
  dir: string,
  thresholdBytes = DEFAULT_LARGE_FILE_BYTES,
): Promise<LargeFile[]> {
  const { stdout: objectsOut } = await run("git", ["rev-list", "--objects", "--all"], {
    cwd: dir,
    label: "git rev-list --objects --all",
  });
  const shaToPath = new Map<string, string>();
  for (const line of objectsOut.split("\n")) {
    const [sha, ...rest] = line.trim().split(" ");
    if (sha && rest.length > 0) shaToPath.set(sha, rest.join(" "));
  }
  if (shaToPath.size === 0) return [];

  const { stdout: batchOut } = await run(
    "git",
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    { cwd: dir, input: Array.from(shaToPath.keys()).join("\n"), label: "git cat-file --batch-check" },
  );

  const large: LargeFile[] = [];
  for (const line of batchOut.split("\n")) {
    const [sha, type, sizeStr] = line.trim().split(" ");
    if (!sha || type !== "blob") continue;
    const size = Number(sizeStr);
    if (size > thresholdBytes) {
      large.push({ path: shaToPath.get(sha) ?? sha, sizeBytes: size });
    }
  }
  return large.sort((a, b) => b.sizeBytes - a.sizeBytes);
}

export async function getMirrorSizeBytes(dir: string): Promise<number> {
  try {
    const { stdout } = await run("git", ["count-objects", "-v"], { cwd: dir, label: "git count-objects" });
    let sizeKb = 0;
    let sizePackKb = 0;
    for (const line of stdout.split("\n")) {
      const [key, value] = line.split(":").map((s) => s.trim());
      if (key === "size") sizeKb += Number(value) || 0;
      if (key === "size-pack") sizePackKb += Number(value) || 0;
    }
    return (sizeKb + sizePackKb) * 1024;
  } catch {
    return 0;
  }
}

export const SIZE_THRESHOLDS = {
  largeFileBytes: DEFAULT_LARGE_FILE_BYTES,
  warnRepoBytes: DEFAULT_WARN_REPO_BYTES,
};

const DEFAULT_SENSITIVE_GLOBS = [".env", ".env.*", "*.pem", "*credentials*", "*secret*"];

export async function scanCommittedSensitiveFiles(dir: string, globs: string[] = DEFAULT_SENSITIVE_GLOBS): Promise<string[]> {
  const micromatch = (await import("micromatch")).default;
  try {
    const { stdout } = await run("git", ["ls-tree", "-r", "--name-only", "HEAD"], {
      cwd: dir,
      label: "git ls-tree --name-only HEAD",
    });
    const files = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    return files.filter((f) => micromatch.isMatch(path.basename(f), globs) || micromatch.isMatch(f, globs));
  } catch (err) {
    if (err instanceof RedactedExecError) return [];
    throw err;
  }
}
