import { describe, it, expect } from "vitest";
import {
  sanitizeRepoName,
  flattenGroupPath,
  renderNameTemplate,
  sanitizeSecretName,
  isCaseInsensitiveCollision,
  suffixedName,
  matchesAnyGlob,
} from "./naming.js";

describe("sanitizeRepoName", () => {
  it("replaces spaces with dashes", () => {
    expect(sanitizeRepoName("my repo name")).toBe("my-repo-name");
  });

  it("strips invalid characters", () => {
    expect(sanitizeRepoName("proj@#$%name!")).toBe("proj-name");
  });

  it("collapses repeated dashes", () => {
    expect(sanitizeRepoName("a---b")).toBe("a-b");
  });

  it("strips leading/trailing dashes and dots", () => {
    expect(sanitizeRepoName("-.foo.-")).toBe("foo");
  });

  it("falls back to a default for an all-invalid input", () => {
    expect(sanitizeRepoName("###")).toBe("repo");
  });

  it("falls back to a default for the reserved names . and ..", () => {
    expect(sanitizeRepoName(".")).toBe("repo");
    expect(sanitizeRepoName("..")).toBe("repo");
  });

  it("preserves already-valid names", () => {
    expect(sanitizeRepoName("valid-repo.name_1")).toBe("valid-repo.name_1");
  });
});

describe("flattenGroupPath", () => {
  it("joins nested group segments with dashes", () => {
    expect(flattenGroupPath("my-group/sub/subsub")).toBe("my-group-sub-subsub");
  });

  it("handles a single-segment group", () => {
    expect(flattenGroupPath("my-group")).toBe("my-group");
  });
});

describe("renderNameTemplate", () => {
  const project = {
    name: "proj-a",
    pathWithNamespace: "my-group/sub/proj-a",
    namespaceFullPath: "my-group/sub",
  };

  it("substitutes {name} and {group_path}", () => {
    expect(renderNameTemplate("{group_path}-{name}", project)).toBe("my-group-sub-proj-a");
  });

  it("substitutes {namespace} with the immediate parent segment", () => {
    expect(renderNameTemplate("{namespace}-{name}", project)).toBe("sub-proj-a");
  });

  it("sanitizes the rendered result", () => {
    const dirty = { name: "proj a!", pathWithNamespace: "g/proj a!", namespaceFullPath: "g" };
    expect(renderNameTemplate("{name}", dirty)).toBe("proj-a");
  });
});

describe("sanitizeSecretName", () => {
  it("uppercases and replaces invalid characters", () => {
    const { name, renamed } = sanitizeSecretName("db-password.prod");
    expect(name).toBe("DB_PASSWORD_PROD");
    expect(renamed).toBe(true);
  });

  it("prefixes names starting with a digit", () => {
    const { name } = sanitizeSecretName("123_key");
    expect(name).toBe("VAR_123_KEY");
  });

  it("prefixes reserved GITHUB_ prefix", () => {
    const { name } = sanitizeSecretName("GITHUB_TOKEN_OVERRIDE");
    expect(name).toBe("GL_GITHUB_TOKEN_OVERRIDE");
  });

  it("leaves already-valid names unchanged", () => {
    const { name, renamed } = sanitizeSecretName("MY_SECRET");
    expect(name).toBe("MY_SECRET");
    expect(renamed).toBe(false);
  });
});

describe("isCaseInsensitiveCollision", () => {
  it("detects collisions regardless of case", () => {
    expect(isCaseInsensitiveCollision("MyRepo", ["myrepo", "other"])).toBe(true);
  });

  it("returns false when no match exists", () => {
    expect(isCaseInsensitiveCollision("unique-repo", ["other", "another"])).toBe(false);
  });
});

describe("suffixedName", () => {
  it("returns the original name if no collision", () => {
    expect(suffixedName("repo", ["other"])).toBe("repo");
  });

  it("appends -migrated on first collision", () => {
    expect(suffixedName("repo", ["repo"])).toBe("repo-migrated");
  });

  it("increments suffix on repeated collisions", () => {
    expect(suffixedName("repo", ["repo", "repo-migrated"])).toBe("repo-migrated-2");
  });
});

describe("matchesAnyGlob", () => {
  it("matches a wildcard suffix pattern", () => {
    expect(matchesAnyGlob("group/legacy-foo", ["group/legacy-*"])).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(matchesAnyGlob("group/active-foo", ["group/legacy-*"])).toBe(false);
  });
});
