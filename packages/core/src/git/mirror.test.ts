import { describe, it, expect } from "vitest";
import { diffRefMaps, isPrunedRef } from "./mirror.js";

describe("isPrunedRef", () => {
  it("flags GitLab-internal ref namespaces", () => {
    expect(isPrunedRef("refs/merge-requests/1/head")).toBe(true);
    expect(isPrunedRef("refs/keep-around/abc123")).toBe(true);
    expect(isPrunedRef("refs/pipelines/42")).toBe(true);
    expect(isPrunedRef("refs/environments/prod")).toBe(true);
  });

  it("does not flag normal branches or tags", () => {
    expect(isPrunedRef("refs/heads/main")).toBe(false);
    expect(isPrunedRef("refs/tags/v1.0.0")).toBe(false);
  });
});

describe("diffRefMaps", () => {
  it("matches when target has identical refs (after filtering pruned namespaces)", () => {
    const source = {
      "refs/heads/main": "sha1",
      "refs/tags/v1": "sha2",
      "refs/merge-requests/1/head": "sha3",
    };
    const target = {
      "refs/heads/main": "sha1",
      "refs/tags/v1": "sha2",
    };
    const diff = diffRefMaps(source, target);
    expect(diff.matches).toBe(true);
    expect(diff.missingOnTarget).toEqual([]);
    expect(diff.shaMismatch).toEqual([]);
  });

  it("flags a ref missing on the target", () => {
    const source = { "refs/heads/main": "sha1", "refs/heads/dev": "sha2" };
    const target = { "refs/heads/main": "sha1" };
    const diff = diffRefMaps(source, target);
    expect(diff.matches).toBe(false);
    expect(diff.missingOnTarget).toEqual(["refs/heads/dev"]);
  });

  it("flags a sha mismatch on a shared ref", () => {
    const source = { "refs/heads/main": "sha1" };
    const target = { "refs/heads/main": "sha-different" };
    const diff = diffRefMaps(source, target);
    expect(diff.matches).toBe(false);
    expect(diff.shaMismatch).toEqual(["refs/heads/main"]);
  });

  it("reports extra refs on target without failing the match", () => {
    const source = { "refs/heads/main": "sha1" };
    const target = { "refs/heads/main": "sha1", "refs/heads/extra": "sha2" };
    const diff = diffRefMaps(source, target);
    expect(diff.matches).toBe(true);
    expect(diff.extraOnTarget).toEqual(["refs/heads/extra"]);
  });
});
