import { Octokit } from "octokit";
import type { Config } from "../config.js";
import { globalRedactor } from "../util/redact.js";
import { logger } from "../util/logger.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class DryRunViolationError extends Error {
  constructor(method: string, url: string) {
    super(
      `Refusing to issue ${method} ${url}: dry-run mode is active. This is a bug if you see it during ` +
        `a real migration — please report it.`,
    );
    this.name = "DryRunViolationError";
  }
}

export interface GithubClientOptions {
  dryRun: boolean;
}

export function createGithubClient(cfg: Config, token: string, opts: GithubClientOptions): Octokit {
  globalRedactor.add(token);

  const octokit = new Octokit({
    auth: token,
    baseUrl: cfg.github.api_url,
    throttle: {
      onRateLimit: (retryAfter: number, options: any, _octokit: any, retryCount: number) => {
        logger.warn({ retryAfter, method: options.method, url: options.url, retryCount }, "GitHub rate limit hit");
        return retryCount < 5;
      },
      onSecondaryRateLimit: (retryAfter: number, options: any, _octokit: any, retryCount: number) => {
        logger.warn(
          { retryAfter, method: options.method, url: options.url, retryCount },
          "GitHub secondary rate limit hit",
        );
        return retryCount < 5;
      },
    },
    retry: {
      doNotRetry: [400, 401, 403, 404, 422],
    },
  });

  if (opts.dryRun) {
    octokit.hook.before("request", (options) => {
      const method = String(options.method ?? "GET").toUpperCase();
      if (MUTATING_METHODS.has(method)) {
        throw new DryRunViolationError(method, String(options.url ?? ""));
      }
    });
  }

  return octokit;
}

export async function detectOwnerType(octokit: Octokit, owner: string): Promise<"User" | "Organization"> {
  const { data } = await octokit.rest.users.getByUsername({ username: owner });
  return data.type as "User" | "Organization";
}
