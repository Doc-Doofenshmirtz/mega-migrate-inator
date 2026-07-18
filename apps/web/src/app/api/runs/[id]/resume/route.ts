import { NextResponse } from "next/server";
import path from "node:path";
import { discoverProjects, getExistingGithubRepoNames, createGitlabClient, createGithubClient } from "@glab2gh/core";
import { getDb, DATA_DIR } from "@/server/db";
import { getGitlabConnection, getGithubConnection } from "@/server/settings";
import { buildConfig } from "@/server/buildConfig";
import { buildRepoPlans } from "@/server/planning";
import { getEngine } from "@/server/engine";
import { errorResponse } from "@/server/apiError";
import type { MigrationOptions } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  const run = db.prepare("SELECT status, options_json FROM runs WHERE id = ?").get(id) as { status: string; options_json: string } | undefined;
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  if (run.status === "running" || getEngine().isActive(id)) {
    return NextResponse.json({ error: "run is already active" }, { status: 400 });
  }

  const gitlabConn = getGitlabConnection();
  const githubConn = getGithubConnection();
  if (!gitlabConn || !githubConn) {
    return NextResponse.json({ error: "GitLab/GitHub connections are not configured — visit /setup first." }, { status: 400 });
  }

  try {
    const options = JSON.parse(run.options_json) as MigrationOptions;
    const taskRows = db.prepare("SELECT repo_path FROM repo_tasks WHERE run_id = ?").all(id) as unknown as Array<{ repo_path: string }>;
    const selectedRepoPaths = taskRows.map((r) => r.repo_path);

    const cfg = buildConfig(options, gitlabConn, githubConn, selectedRepoPaths, path.join(DATA_DIR, "work"));
    const gitlabApi = createGitlabClient(cfg, gitlabConn.token);
    const githubOctokit = createGithubClient(cfg, githubConn.token, { dryRun: true });

    const projects = await discoverProjects(gitlabApi, cfg);
    const existingNames = await getExistingGithubRepoNames(githubOctokit, cfg.target.owner);
    const { plans } = buildRepoPlans(projects, options, existingNames);

    const engine = getEngine();
    engine.resumeRun(id, cfg, gitlabConn.token, githubConn.token, plans).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[glab2gh] resume of run ${id} crashed:`, err);
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
