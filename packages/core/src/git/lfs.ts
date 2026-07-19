import { run, RedactedExecError } from "../util/exec.js";
import { commandExists } from "../util/exec.js";

let lfsAvailableCache: boolean | undefined;

export async function isGitLfsInstalled(): Promise<boolean> {
  if (lfsAvailableCache === undefined) {
    lfsAvailableCache = await commandExists("git-lfs");
  }
  return lfsAvailableCache;
}

/** Detect LFS usage by checking .gitattributes across all branches for `filter=lfs`. */
export async function detectLfs(dir: string): Promise<boolean> {
  try {
    const { stdout: branchesOut } = await run("git", ["for-each-ref", "--format=%(refname)", "refs/heads"], {
      cwd: dir,
      label: "git for-each-ref refs/heads",
    });
    const branches = branchesOut.split("\n").map((l) => l.trim()).filter(Boolean);

    for (const branch of branches) {
      try {
        const { stdout } = await run("git", ["show", `${branch}:.gitattributes`], {
          cwd: dir,
          label: "git show .gitattributes",
        });
        if (/filter=lfs/.test(stdout)) return true;
      } catch (err) {
        if (err instanceof RedactedExecError) continue; // no .gitattributes on this branch
        throw err;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function lfsFetchAll(dir: string, remoteUrl: string, insecureTls: boolean): Promise<void> {
  await run("git", ["lfs", "fetch", remoteUrl, "--all"], {
    cwd: dir,
    label: "git lfs fetch --all (source)",
    env: insecureTls ? { GIT_SSL_NO_VERIFY: "1" } : undefined,
  });
}

export async function lfsPushAll(dir: string, remoteUrl: string): Promise<void> {
  await run("git", ["lfs", "push", remoteUrl, "--all"], { cwd: dir, label: "git lfs push --all (target)" });
}

/**
 * Rewrites the given paths to Git LFS pointers across every ref (the clone is
 * a `--mirror`, so branches live at refs/heads/* directly — `--everything` is
 * what reaches all of them, not just HEAD). Runs against the local mirror
 * only; the GitLab source is never touched.
 */
export async function migrateLargeFilesToLfs(dir: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await run(
    "git",
    ["lfs", "migrate", "import", "--everything", "--skip-fetch", `--include=${paths.join(",")}`],
    { cwd: dir, label: "git lfs migrate import (large files -> LFS)" },
  );
}
