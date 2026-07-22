import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const GitlabConfigSchema = z.object({
  url: z.string().url(),
  insecure_tls: z.boolean().default(false),
});

const GithubConfigSchema = z.object({
  api_url: z.string().url().default("https://api.github.com"),
});

const SourceConfigSchema = z.object({
  mode: z.enum(["group", "list", "all"]),
  group: z.string().optional(),
  include_archived: z.boolean().default(false),
  projects: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
  skip_forks: z.boolean().default(false),
});

const TargetConfigSchema = z.object({
  owner: z.string().min(1),
  visibility: z.enum(["private", "public", "inherit"]).default("private"),
  name_template: z.string().default("{group_path}-{name}"),
  topics_from_gitlab_topics: z.boolean().default(true),
  collision: z.enum(["fail", "skip", "suffix", "sync"]).default("fail"),
});

const MigrateConfigSchema = z.object({
  ci_variables: z.boolean().default(true),
  ci_variables_as: z.enum(["secrets", "variables", "auto"]).default("secrets"),
  group_variables: z.boolean().default(true),
  lfs: z.enum(["auto", "on", "off"]).default("auto"),
  large_files: z.enum(["warn", "auto_lfs"]).default("warn"),
  wiki: z.boolean().default(false),
  releases: z.boolean().default(false),
  branch_protection: z.boolean().default(true),
  webhooks: z.boolean().default(false),
  archive_source: z.boolean().default(false),
  set_gitlab_description: z.string().default(""),
});

const RunConfigSchema = z.object({
  concurrency: z.number().int().min(1).max(20).default(3),
  workdir: z.string().default("./.glab2gh-work"),
});

export const ConfigSchema = z
  .object({
    gitlab: GitlabConfigSchema,
    github: GithubConfigSchema,
    source: SourceConfigSchema,
    target: TargetConfigSchema,
    migrate: MigrateConfigSchema.default({}),
    run: RunConfigSchema.default({}),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.source.mode === "group" && !cfg.source.group) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source", "group"],
        message: "source.group is required when source.mode is 'group'",
      });
    }
    if (cfg.source.mode === "list" && cfg.source.projects.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source", "projects"],
        message: "source.projects must be non-empty when source.mode is 'list'",
      });
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

export interface Env {
  gitlabToken: string;
  githubToken: string;
}

export function loadEnv(): Env {
  const gitlabToken = process.env.GITLAB_TOKEN;
  const githubToken = process.env.GITHUB_TOKEN;
  const missing: string[] = [];
  if (!gitlabToken) missing.push("GITLAB_TOKEN");
  if (!githubToken) missing.push("GITHUB_TOKEN");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Set them before running glab2gh (never put tokens in the config file).`,
    );
  }
  return { gitlabToken: gitlabToken!, githubToken: githubToken! };
}

export function loadConfig(path: string): Config {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    throw new Error(`Could not read config file at ${path}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`Failed to parse YAML config at ${path}: ${(err as Error).message}`);
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration in ${path}:\n${issues}`);
  }

  // Defensive check: config files must never contain token-shaped fields.
  const rawStr = JSON.stringify(parsed);
  if (/glpat-|ghp_|github_pat_/i.test(rawStr)) {
    throw new Error(
      `Config file ${path} appears to contain a literal token. Tokens must be supplied via ` +
        `GITLAB_TOKEN / GITHUB_TOKEN environment variables, never in the config file.`,
    );
  }

  return result.data;
}
