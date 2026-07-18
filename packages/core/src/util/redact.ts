/**
 * Central place for scrubbing secrets out of anything that might be logged:
 * git remote URLs (embedded tokens), API error bodies, exec output.
 */

const REDACTED = "***REDACTED***";

export interface RedactionRegistry {
  add(secret: string | undefined | null): void;
  scrub(input: string): string;
}

export function createRedactionRegistry(): RedactionRegistry {
  const secrets = new Set<string>();

  return {
    add(secret) {
      if (secret && secret.length >= 4) {
        secrets.add(secret);
      }
    },
    scrub(input: string): string {
      let out = input;
      for (const secret of secrets) {
        if (!secret) continue;
        out = out.split(secret).join(REDACTED);
      }
      // Also catch common embedded-credential URL patterns as a safety net,
      // in case a token slipped through without being registered.
      out = out.replace(/(oauth2|x-access-token|[\w.-]+):[^@\s/]+@/gi, `$1:${REDACTED}@`);
      return out;
    },
  };
}

/** Process-wide singleton — tokens are registered once at startup. */
export const globalRedactor = createRedactionRegistry();

export function redact(input: string): string {
  return globalRedactor.scrub(input);
}

export function buildGitlabRemoteUrl(baseUrl: string, token: string, pathWithNamespace: string): string {
  const u = new URL(baseUrl);
  u.username = "";
  u.password = "";
  const host = u.host;
  const proto = u.protocol.replace(":", "");
  return `${proto}://oauth2:${token}@${host}/${pathWithNamespace}.git`;
}

export function buildGithubRemoteUrl(apiUrl: string, token: string, owner: string, repo: string): string {
  const u = new URL(apiUrl);
  const host = u.host === "api.github.com" ? "github.com" : u.host.replace(/^api\./, "");
  const proto = u.protocol.replace(":", "");
  return `${proto}://x-access-token:${token}@${host}/${owner}/${repo}.git`;
}
