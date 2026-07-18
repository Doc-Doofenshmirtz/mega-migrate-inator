import { describe, it, expect } from "vitest";
import { createRedactionRegistry, buildGitlabRemoteUrl, buildGithubRemoteUrl } from "./redact.js";

describe("RedactionRegistry", () => {
  it("scrubs a registered secret wherever it appears", () => {
    const reg = createRedactionRegistry();
    reg.add("glpat-super-secret-token-value");
    const input = "cloning https://oauth2:glpat-super-secret-token-value@gitlab.example.com/g/p.git failed";
    const out = reg.scrub(input);
    expect(out).not.toContain("glpat-super-secret-token-value");
    expect(out).toContain("***REDACTED***");
  });

  it("scrubs a secret repeated multiple times", () => {
    const reg = createRedactionRegistry();
    reg.add("mytoken1234");
    const input = "mytoken1234 appears twice: mytoken1234";
    const out = reg.scrub(input);
    expect(out).not.toContain("mytoken1234");
  });

  it("ignores empty/short values to avoid over-redacting", () => {
    const reg = createRedactionRegistry();
    reg.add("");
    reg.add(undefined);
    reg.add("ab");
    const out = reg.scrub("some normal log line with ab in it");
    expect(out).toBe("some normal log line with ab in it");
  });

  it("catches unregistered embedded credentials via the URL safety net", () => {
    const reg = createRedactionRegistry();
    const input = "remote: https://x-access-token:ghp_unregisteredtoken@github.com/o/r.git";
    const out = reg.scrub(input);
    expect(out).not.toContain("ghp_unregisteredtoken");
  });
});

describe("remote URL builders", () => {
  it("builds a GitLab clone URL with the token embedded", () => {
    const url = buildGitlabRemoteUrl("https://gitlab.example.com", "TOKEN123", "group/sub/proj");
    expect(url).toBe("https://oauth2:TOKEN123@gitlab.example.com/group/sub/proj.git");
  });

  it("builds a GitHub push URL, normalizing api.github.com to github.com", () => {
    const url = buildGithubRemoteUrl("https://api.github.com", "TOKEN456", "my-org", "my-repo");
    expect(url).toBe("https://x-access-token:TOKEN456@github.com/my-org/my-repo.git");
  });

  it("builds a GitHub Enterprise push URL from a custom API host", () => {
    const url = buildGithubRemoteUrl("https://ghe.internal/api/v3", "TOKEN789", "org", "repo");
    expect(url).toBe("https://x-access-token:TOKEN789@ghe.internal/org/repo.git");
  });
});
