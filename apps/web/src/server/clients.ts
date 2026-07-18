import { Gitlab } from "@gitbeaker/rest";
import { Octokit } from "octokit";
import { globalRedactor } from "@glab2gh/core";
import { getGitlabConnection, getGithubConnection } from "./settings";

export type GitlabApi = InstanceType<typeof Gitlab>;

export function createGitlabApi(url: string, token: string, insecureTls: boolean): GitlabApi {
  globalRedactor.add(token);
  if (insecureTls) {
    // eslint-disable-next-line no-console
    console.warn("[glab2gh] insecure_tls enabled — TLS certificate verification is DISABLED for GitLab API calls.");
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  return new Gitlab({ host: url, token });
}

export function createGithubApi(token: string, apiUrl: string): Octokit {
  globalRedactor.add(token);
  return new Octokit({
    auth: token,
    baseUrl: apiUrl,
    throttle: {
      onRateLimit: (_retryAfter: number, _options: unknown, _octokit: unknown, retryCount: number) => retryCount < 3,
      onSecondaryRateLimit: () => false,
    },
    retry: {
      doNotRetry: [400, 401, 403, 404, 422],
    },
  });
}

/** Throws if the connection hasn't been configured yet — routes should map this to a 400. */
export class ConnectionNotConfiguredError extends Error {
  constructor(kind: "gitlab" | "github") {
    super(`${kind} connection is not configured yet — visit /setup first.`);
    this.name = "ConnectionNotConfiguredError";
  }
}

export function gitlabApiFromSettings(): GitlabApi {
  const conn = getGitlabConnection();
  if (!conn) throw new ConnectionNotConfiguredError("gitlab");
  return createGitlabApi(conn.url, conn.token, conn.insecureTls);
}

export function githubApiFromSettings(): Octokit {
  const conn = getGithubConnection();
  if (!conn) throw new ConnectionNotConfiguredError("github");
  return createGithubApi(conn.token, conn.apiUrl);
}
