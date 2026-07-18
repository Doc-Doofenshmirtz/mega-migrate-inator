import { describe, it, expect } from "vitest";
import { computeRepoPlans, CollisionError } from "./planning.js";
import type { Config } from "./config.js";
import type { GitlabProject } from "./gitlab/discover.js";

function project(overrides: Partial<GitlabProject>): GitlabProject {
  return {
    id: 1,
    name: "proj-a",
    pathWithNamespace: "group/proj-a",
    namespaceFullPath: "group",
    namespaceId: 10,
    namespaceKind: "group",
    description: null,
    defaultBranch: "main",
    visibility: "private",
    archived: false,
    topics: [],
    httpUrlToRepo: "https://gitlab.example.com/group/proj-a.git",
    forkedFromProject: false,
    emptyRepo: false,
    hasWiki: true,
    hasIssuesEnabled: true,
    sizeBytes: null,
    lastActivityAt: null,
    ...overrides,
  };
}

function baseConfig(overrides: Partial<Config["target"]> = {}): Config {
  return {
    gitlab: { url: "https://gitlab.example.com", insecure_tls: false },
    github: { api_url: "https://api.github.com" },
    source: { mode: "group", group: "group", include_archived: false, projects: [], exclude: [], skip_forks: false },
    target: {
      owner: "my-org",
      visibility: "private",
      name_template: "{group_path}-{name}",
      topics_from_gitlab_topics: true,
      collision: "fail",
      ...overrides,
    },
    migrate: {
      ci_variables: true,
      ci_variables_as: "secrets",
      group_variables: true,
      lfs: "auto",
      wiki: false,
      releases: false,
      branch_protection: true,
      webhooks: false,
      archive_source: false,
      set_gitlab_description: "",
    },
    run: { concurrency: 3, workdir: "./.glab2gh-work" },
  } as Config;
}

describe("computeRepoPlans", () => {
  it("computes a flattened target name from the template", () => {
    const cfg = baseConfig();
    const plans = computeRepoPlans([project({})], cfg, new Set());
    expect(plans[0]!.targetName).toBe("group-proj-a");
    expect(plans[0]!.skip).toBe(false);
  });

  it("throws CollisionError when collision policy is 'fail'", () => {
    const cfg = baseConfig({ collision: "fail" });
    expect(() => computeRepoPlans([project({})], cfg, new Set(["group-proj-a"]))).toThrow(CollisionError);
  });

  it("marks the repo skipped when collision policy is 'skip'", () => {
    const cfg = baseConfig({ collision: "skip" });
    const plans = computeRepoPlans([project({})], cfg, new Set(["group-proj-a"]));
    expect(plans[0]!.skip).toBe(true);
    expect(plans[0]!.skipReason).toMatch(/collides/);
  });

  it("suffixes the name when collision policy is 'suffix'", () => {
    const cfg = baseConfig({ collision: "suffix" });
    const plans = computeRepoPlans([project({})], cfg, new Set(["group-proj-a"]));
    expect(plans[0]!.targetName).toBe("group-proj-a-migrated");
    expect(plans[0]!.skip).toBe(false);
  });

  it("detects collisions between two projects flattening to the same name within one run", () => {
    const cfg = baseConfig({ collision: "suffix" });
    const p1 = project({ id: 1, name: "proj-a", pathWithNamespace: "group/proj-a", namespaceFullPath: "group" });
    const p2 = project({ id: 2, name: "proj-a", pathWithNamespace: "group2/proj-a", namespaceFullPath: "group" });
    const plans = computeRepoPlans([p1, p2], cfg, new Set());
    expect(plans[0]!.targetName).toBe("group-proj-a");
    expect(plans[1]!.targetName).toBe("group-proj-a-migrated");
  });

  it("maps visibility per the 'inherit' policy", () => {
    const cfg = baseConfig({ visibility: "inherit" });
    const pub = project({ id: 1, name: "proj-pub", pathWithNamespace: "group/proj-pub", visibility: "public" });
    const priv = project({ id: 2, name: "proj-priv", pathWithNamespace: "group/proj-priv", visibility: "internal" });
    const plans = computeRepoPlans([pub, priv], cfg, new Set());
    expect(plans[0]!.private).toBe(false);
    expect(plans[1]!.private).toBe(true);
  });
});
