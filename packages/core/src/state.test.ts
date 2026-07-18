import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FileStateStore } from "./state.js";

const dirsToClean: string[] = [];
afterEach(() => {
  while (dirsToClean.length) {
    rmSync(dirsToClean.pop()!, { recursive: true, force: true });
  }
});

function tempStatePath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "glab2gh-state-test-"));
  dirsToClean.push(dir);
  return path.join(dir, ".glab2gh-state.json");
}

describe("FileStateStore", () => {
  it("starts with no repos and creates the file on first save", () => {
    const p = tempStatePath();
    const store = new FileStateStore(p);
    expect(store.allRepos()).toEqual([]);
  });

  it("marks a step done after finishStep(success), enabling skip on rerun", () => {
    const p = tempStatePath();
    const store = new FileStateStore(p);
    store.ensureRepo("group/proj", "org", "group-proj");
    expect(store.isStepDone("group/proj", "mirror_clone")).toBe(false);

    store.startStep("group/proj", "mirror_clone");
    store.finishStep("group/proj", "mirror_clone", "success");
    expect(store.isStepDone("group/proj", "mirror_clone")).toBe(true);
  });

  it("treats a completed step as not-done when force=true", () => {
    const p = tempStatePath();
    const store = new FileStateStore(p);
    store.ensureRepo("group/proj", "org", "group-proj");
    store.startStep("group/proj", "mirror_clone");
    store.finishStep("group/proj", "mirror_clone", "success");
    expect(store.isStepDone("group/proj", "mirror_clone", true)).toBe(false);
  });

  it("persists state across FileStateStore instances (resumability)", () => {
    const p = tempStatePath();
    const store1 = new FileStateStore(p);
    store1.ensureRepo("group/proj", "org", "group-proj");
    store1.startStep("group/proj", "mirror_clone");
    store1.finishStep("group/proj", "mirror_clone", "success");

    const store2 = new FileStateStore(p);
    expect(store2.isStepDone("group/proj", "mirror_clone")).toBe(true);
  });

  it("records a failed step with a redacted error message", () => {
    const p = tempStatePath();
    const store = new FileStateStore(p);
    store.ensureRepo("group/proj", "org", "group-proj");
    store.failStep("group/proj", "mirror_push", "push failed for https://x-access-token:SECRETTOKEN@github.com/o/r.git");
    const repo = store.getRepo("group/proj")!;
    expect(repo.overallStatus).toBe("failed");
    expect(repo.steps.mirror_push?.error).not.toContain("SECRETTOKEN");
  });

  it("does not confuse 'skipped' steps with incomplete ones", () => {
    const p = tempStatePath();
    const store = new FileStateStore(p);
    store.ensureRepo("group/proj", "org", "group-proj");
    store.finishStep("group/proj", "lfs_fetch", "skipped");
    expect(store.isStepDone("group/proj", "lfs_fetch")).toBe(true);
  });
});
