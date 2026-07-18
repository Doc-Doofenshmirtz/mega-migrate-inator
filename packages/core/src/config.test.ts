import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "./config.js";

function writeTempConfig(yaml: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "glab2gh-test-"));
  const file = path.join(dir, "glab2gh.config.yaml");
  writeFileSync(file, yaml, "utf-8");
  return file;
}

const dirsToClean: string[] = [];
afterEach(() => {
  while (dirsToClean.length) {
    rmSync(dirsToClean.pop()!, { recursive: true, force: true });
  }
});

describe("loadConfig", () => {
  it("loads a minimal valid config and applies defaults", () => {
    const file = writeTempConfig(`
gitlab:
  url: https://gitlab.example.com
github:
  api_url: https://api.github.com
source:
  mode: group
  group: my-group
target:
  owner: my-org
`);
    dirsToClean.push(path.dirname(file));
    const cfg = loadConfig(file);
    expect(cfg.target.collision).toBe("fail");
    expect(cfg.run.concurrency).toBe(3);
    expect(cfg.migrate.ci_variables_as).toBe("secrets");
  });

  it("rejects mode=group without a group name", () => {
    const file = writeTempConfig(`
gitlab:
  url: https://gitlab.example.com
github:
  api_url: https://api.github.com
source:
  mode: group
target:
  owner: my-org
`);
    dirsToClean.push(path.dirname(file));
    expect(() => loadConfig(file)).toThrow(/source.group/);
  });

  it("rejects mode=list with an empty projects array", () => {
    const file = writeTempConfig(`
gitlab:
  url: https://gitlab.example.com
github:
  api_url: https://api.github.com
source:
  mode: list
  projects: []
target:
  owner: my-org
`);
    dirsToClean.push(path.dirname(file));
    expect(() => loadConfig(file)).toThrow(/source.projects/);
  });

  it("refuses a config file containing a literal token", () => {
    const file = writeTempConfig(`
gitlab:
  url: https://gitlab.example.com
  insecure_tls: false
github:
  api_url: https://api.github.com
source:
  mode: all
target:
  owner: my-org
# oops, someone hardcoded a token in a comment-adjacent field
notes: "glpat-abc123def456ghi789"
`);
    dirsToClean.push(path.dirname(file));
    expect(() => loadConfig(file)).toThrow(/literal token/);
  });

  it("throws a clear error for a missing file", () => {
    expect(() => loadConfig("/nonexistent/path/glab2gh.config.yaml")).toThrow(/Could not read config file/);
  });
});
