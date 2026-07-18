import { ConfigSchema } from "@glab2gh/core";
import type { Config } from "@glab2gh/core";
import type { MigrationOptions } from "@/lib/types";
import type { GitlabConnectionSettings, GithubConnectionSettings } from "./settings";

/** Builds the same Config shape the CLI reads from YAML, from wizard state instead — validated by the same zod schema. */
export function buildConfig(
  options: MigrationOptions,
  gitlab: GitlabConnectionSettings,
  github: GithubConnectionSettings,
  selectedRepoPaths: string[],
  workdir: string,
): Config {
  return ConfigSchema.parse({
    gitlab: { url: gitlab.url, insecure_tls: gitlab.insecureTls },
    github: { api_url: github.apiUrl },
    source: {
      mode: "list",
      projects: selectedRepoPaths,
      include_archived: true,
      exclude: [],
      skip_forks: false,
    },
    target: {
      owner: options.targetOwner,
      visibility: options.visibility,
      name_template: options.nameTemplate,
      topics_from_gitlab_topics: options.topicsFromGitlabTopics,
      collision: options.collision,
    },
    migrate: {
      ci_variables: options.ciVariables,
      ci_variables_as: options.ciVariablesAs,
      group_variables: options.groupVariables,
      lfs: options.lfs,
      wiki: false,
      releases: false,
      branch_protection: options.branchProtection,
      webhooks: false,
      archive_source: options.archiveSource,
      set_gitlab_description: options.setGitlabDescription,
    },
    run: {
      concurrency: options.concurrency,
      workdir,
    },
  } satisfies Record<string, unknown>);
}
