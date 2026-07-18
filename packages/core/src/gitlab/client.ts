import { Gitlab } from "@gitbeaker/rest";
import type { Config } from "../config.js";
import { globalRedactor } from "../util/redact.js";

export type GitlabApi = InstanceType<typeof Gitlab>;

export function createGitlabClient(cfg: Config, token: string): GitlabApi {
  globalRedactor.add(token);

  if (cfg.gitlab.insecure_tls) {
    // eslint-disable-next-line no-console
    console.warn(
      "[glab2gh] WARNING: gitlab.insecure_tls=true — TLS certificate verification is DISABLED for GitLab API calls.",
    );
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  return new Gitlab({
    host: cfg.gitlab.url,
    token,
  });
}
