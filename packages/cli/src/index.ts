#!/usr/bin/env node
import path from "node:path";
import { existsSync } from "node:fs";
import { Command } from "commander";
import {
  loadConfig,
  loadEnv,
  logger,
  commandExists,
  createGitlabClient,
  discoverProjects,
  createGithubClient,
  computeRepoPlans,
  CollisionError,
  buildPlanPreview,
  renderPlanTable,
  FileStateStore,
  migrateRepo,
  getExistingGithubRepoNames,
  runPool,
  type RunContext,
  writeReport,
  mirrorClone,
  pruneInternalRefs,
  listRefs,
  lsRemoteRefs,
  diffRefMaps,
  buildGitlabRemoteUrl,
  buildGithubRemoteUrl,
  globalRedactor,
} from "@glab2gh/core";
import { rm } from "node:fs/promises";

const program = new Command();

program
  .name("glab2gh")
  .description("Bulk migration CLI: self-hosted GitLab -> GitHub")
  .option("-c, --config <path>", "path to config file", "glab2gh.config.yaml")
  .option("--state <path>", "path to state file", ".glab2gh-state.json");

async function preflightChecks(): Promise<void> {
  const gitOk = await commandExists("git");
  if (!gitOk) {
    logger.error("git is required on PATH but was not found");
    process.exit(1);
  }
  const lfsOk = await commandExists("git-lfs");
  if (!lfsOk) {
    logger.warn("git-lfs not found on PATH — LFS objects will be skipped with a warning if any repos use LFS");
  }
}

function filterByOnly<T>(items: T[], keyOf: (item: T) => string, only?: string[]): T[] {
  if (!only || only.length === 0) return items;
  const set = new Set(only);
  return items.filter((i) => set.has(keyOf(i)));
}

async function setup(configPath: string) {
  const cfg = loadConfig(configPath);
  const env = loadEnv();
  globalRedactor.add(env.gitlabToken);
  globalRedactor.add(env.githubToken);
  const gitlabApi = createGitlabClient(cfg, env.gitlabToken);
  return { cfg, env, gitlabApi };
}

program
  .command("plan")
  .description("Discover projects and print a dry-run migration plan (no mutations)")
  .action(async () => {
    const opts = program.opts();
    await preflightChecks();
    const { cfg, env, gitlabApi } = await setup(opts.config);
    const githubOctokit = createGithubClient(cfg, env.githubToken, { dryRun: true });

    logger.info("discovering GitLab projects...");
    const projects = await discoverProjects(gitlabApi, cfg);
    logger.info({ count: projects.length }, "discovered projects");

    const existingNames = await getExistingGithubRepoNames(githubOctokit, cfg.target.owner);

    let plans;
    try {
      plans = computeRepoPlans(projects, cfg, existingNames);
    } catch (err) {
      if (err instanceof CollisionError) {
        logger.error(err.message);
        process.exit(1);
      }
      throw err;
    }

    const rows = await buildPlanPreview(gitlabApi, plans, cfg.migrate.group_variables);
    console.log("\n" + renderPlanTable(rows) + "\n");
    console.log(`${rows.length} project(s) planned, ${rows.filter((r) => r.skip).length} skipped due to collision.`);
  });

program
  .command("migrate")
  .description("Migrate repositories from GitLab to GitHub")
  .option("--dry-run", "print the plan without mutating anything", false)
  .option("--concurrency <n>", "override configured concurrency", (v) => parseInt(v, 10))
  .option("--only <path...>", "only migrate specific GitLab project path(s)")
  .option("--force", "redo steps even if already marked complete in state", false)
  .option("--keep", "keep the local mirror workdir after a successful run", false)
  .option("--deep-size-check", "scan full history (not just HEAD) for files >100MB", false)
  .action(async (cmdOpts) => {
    const opts = program.opts();
    await preflightChecks();
    const { cfg, env, gitlabApi } = await setup(opts.config);
    const dryRun = Boolean(cmdOpts.dryRun);
    const githubOctokit = createGithubClient(cfg, env.githubToken, { dryRun });

    logger.info("discovering GitLab projects...");
    let projects = await discoverProjects(gitlabApi, cfg);
    projects = filterByOnly(projects, (p) => p.pathWithNamespace, cmdOpts.only);
    logger.info({ count: projects.length }, "discovered projects");

    const existingNames = await getExistingGithubRepoNames(githubOctokit, cfg.target.owner);

    let plans;
    try {
      plans = computeRepoPlans(projects, cfg, existingNames);
    } catch (err) {
      if (err instanceof CollisionError) {
        logger.error(err.message);
        process.exit(1);
      }
      throw err;
    }

    if (dryRun) {
      const rows = await buildPlanPreview(gitlabApi, plans, cfg.migrate.group_variables);
      console.log("\n" + renderPlanTable(rows) + "\n");
      console.log(`DRY RUN: ${rows.length} project(s) would be processed. No changes were made.`);
      return;
    }

    const concurrency = cmdOpts.concurrency ?? cfg.run.concurrency;
    const state = new FileStateStore(opts.state);
    const ctx: RunContext = {
      cfg,
      gitlabToken: env.gitlabToken,
      githubToken: env.githubToken,
      gitlabApi,
      githubOctokit,
      state,
      force: Boolean(cmdOpts.force),
      keepWorkdir: Boolean(cmdOpts.keep),
      deepSizeCheck: Boolean(cmdOpts.deepSizeCheck),
    };

    logger.info({ concurrency, repos: plans.length }, "starting migration");
    const results = await runPool(plans, concurrency, (plan) => migrateRepo(ctx, plan));

    writeReport(results, state.getState().runStartedAt);
    const failed = results.filter((r) => r.status === "failed" || r.status === "verify_failed");
    logger.info(
      { succeeded: results.length - failed.length, failed: failed.length },
      "migration run complete; see migration-report.md",
    );
    if (failed.length > 0) {
      process.exitCode = 1;
    }
  });

program
  .command("resume")
  .description("Continue a migration from the state file")
  .option("--concurrency <n>", "override configured concurrency", (v) => parseInt(v, 10))
  .option("--only <path...>", "only resume specific GitLab project path(s)")
  .option("--keep", "keep the local mirror workdir after a successful run", false)
  .option("--deep-size-check", "scan full history for files >100MB", false)
  .action(async (cmdOpts) => {
    const opts = program.opts();
    if (!existsSync(opts.state)) {
      logger.error(`No state file found at ${opts.state}. Run 'glab2gh migrate' first.`);
      process.exit(1);
    }
    await preflightChecks();
    const { cfg, env, gitlabApi } = await setup(opts.config);
    const githubOctokit = createGithubClient(cfg, env.githubToken, { dryRun: false });

    logger.info("discovering GitLab projects...");
    let projects = await discoverProjects(gitlabApi, cfg);
    projects = filterByOnly(projects, (p) => p.pathWithNamespace, cmdOpts.only);

    const existingNames = await getExistingGithubRepoNames(githubOctokit, cfg.target.owner);
    let plans;
    try {
      plans = computeRepoPlans(projects, cfg, existingNames);
    } catch (err) {
      if (err instanceof CollisionError) {
        logger.error(err.message);
        process.exit(1);
      }
      throw err;
    }

    const concurrency = cmdOpts.concurrency ?? cfg.run.concurrency;
    const state = new FileStateStore(opts.state);
    const ctx: RunContext = {
      cfg,
      gitlabToken: env.gitlabToken,
      githubToken: env.githubToken,
      gitlabApi,
      githubOctokit,
      state,
      force: false,
      keepWorkdir: Boolean(cmdOpts.keep),
      deepSizeCheck: Boolean(cmdOpts.deepSizeCheck),
    };

    logger.info({ concurrency, repos: plans.length }, "resuming migration");
    const results = await runPool(plans, concurrency, (plan) => migrateRepo(ctx, plan));

    writeReport(results, state.getState().runStartedAt);
    const failed = results.filter((r) => r.status === "failed" || r.status === "verify_failed");
    logger.info(
      { succeeded: results.length - failed.length, failed: failed.length },
      "resume complete; see migration-report.md",
    );
    if (failed.length > 0) {
      process.exitCode = 1;
    }
  });

program
  .command("verify")
  .description("Re-verify that target refs match source refs for already-migrated repos")
  .option("--only <path...>", "only verify specific GitLab project path(s)")
  .option("--concurrency <n>", "override configured concurrency", (v) => parseInt(v, 10))
  .action(async (cmdOpts) => {
    const opts = program.opts();
    if (!existsSync(opts.state)) {
      logger.error(`No state file found at ${opts.state}. Run 'glab2gh migrate' first.`);
      process.exit(1);
    }
    await preflightChecks();
    const { cfg, env } = await setup(opts.config);
    const state = new FileStateStore(opts.state);

    let repos = state.allRepos();
    if (cmdOpts.only && cmdOpts.only.length > 0) {
      const set = new Set<string>(cmdOpts.only);
      repos = repos.filter((r) => set.has(r.sourcePath));
    }

    const concurrency = cmdOpts.concurrency ?? cfg.run.concurrency;
    let anyFailed = false;

    await runPool(repos, concurrency, async (repo) => {
      const log = logger.child({ repo: repo.sourcePath });
      const tmpDir = path.join(cfg.run.workdir, `verify__${repo.sourcePath.replace(/\//g, "__")}`);
      const gitlabRemoteUrl = buildGitlabRemoteUrl(cfg.gitlab.url, env.gitlabToken, repo.sourcePath);
      const githubRemoteUrl = buildGithubRemoteUrl(cfg.github.api_url, env.githubToken, repo.targetOwner, repo.targetName);

      try {
        await mirrorClone(gitlabRemoteUrl, tmpDir, cfg.gitlab.insecure_tls);
        await pruneInternalRefs(tmpDir);
        const sourceRefs = await listRefs(tmpDir);
        const targetRefs = await lsRemoteRefs(githubRemoteUrl, false);
        const diff = diffRefMaps(sourceRefs, targetRefs);

        if (diff.matches) {
          log.info("verify OK — source and target refs match");
          state.finishStep(repo.sourcePath, "verify", "success");
        } else {
          anyFailed = true;
          log.error(
            { missing: diff.missingOnTarget.length, mismatched: diff.shaMismatch.length },
            "verify FAILED",
          );
          state.finishStep(repo.sourcePath, "verify", "failed", diff as any);
          state.setOverallStatus(repo.sourcePath, "verify_failed");
        }
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    if (anyFailed) process.exitCode = 1;
  });

program.parseAsync(process.argv).catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
