import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverProjects, getExistingGithubRepoNames, buildPlanPreview, createGitlabClient, createGithubClient } from "@glab2gh/core";
import { getGitlabConnection, getGithubConnection } from "@/server/settings";
import { buildConfig } from "@/server/buildConfig";
import { buildRepoPlans } from "@/server/planning";
import { createAndStartRun, listRuns, ConnectionsNotConfiguredError, BlockingCollisionsError } from "@/server/runs";
import { DATA_DIR } from "@/server/db";
import { errorResponse } from "@/server/apiError";
import path from "node:path";

export const runtime = "nodejs";

const RepoOverrideSchema = z.object({
  targetName: z.string().optional(),
  visibility: z.enum(["private", "public", "inherit"]).optional(),
});

export const OptionsSchema = z.object({
  targetOwner: z.string().min(1),
  visibility: z.enum(["private", "public", "inherit"]),
  nameTemplate: z.string().min(1),
  topicsFromGitlabTopics: z.boolean(),
  collision: z.enum(["fail", "skip", "suffix"]),
  ciVariables: z.boolean(),
  ciVariablesAs: z.enum(["secrets", "variables", "auto"]),
  groupVariables: z.boolean(),
  lfs: z.enum(["auto", "on", "off"]),
  branchProtection: z.boolean(),
  archiveSource: z.boolean(),
  setGitlabDescription: z.string(),
  concurrency: z.number().int().min(1).max(20),
  overrides: z.record(z.string(), RepoOverrideSchema),
});

const CreateRunSchema = z.object({
  dryRun: z.boolean(),
  selectedRepoPaths: z.array(z.string()).min(1),
  options: OptionsSchema,
});

export async function GET() {
  return NextResponse.json({ runs: listRuns() });
}

export async function POST(req: Request) {
  const parsed = CreateRunSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request: " + parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
  }
  const { dryRun, selectedRepoPaths, options } = parsed.data;

  if (dryRun) {
    const gitlabConn = getGitlabConnection();
    const githubConn = getGithubConnection();
    if (!gitlabConn || !githubConn) {
      return NextResponse.json({ error: "GitLab/GitHub connections are not configured — visit /setup first." }, { status: 400 });
    }
    try {
      const cfg = buildConfig(options, gitlabConn, githubConn, selectedRepoPaths, path.join(DATA_DIR, "work"));
      const gitlabApi = createGitlabClient(cfg, gitlabConn.token);
      const githubOctokit = createGithubClient(cfg, githubConn.token, { dryRun: true });

      const projects = await discoverProjects(gitlabApi, cfg);
      const existingNames = await getExistingGithubRepoNames(githubOctokit, cfg.target.owner);
      const { plans, blockingErrors } = buildRepoPlans(projects, options, existingNames);

      const rows = await buildPlanPreview(gitlabApi, plans, options.groupVariables);
      return NextResponse.json({ rows, blockingErrors });
    } catch (err) {
      return errorResponse(err);
    }
  }

  try {
    const { runId } = await createAndStartRun(options, selectedRepoPaths);
    return NextResponse.json({ runId });
  } catch (err) {
    if (err instanceof ConnectionsNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof BlockingCollisionsError) {
      return NextResponse.json({ error: err.message, blockingErrors: err.blockingErrors }, { status: 400 });
    }
    return errorResponse(err);
  }
}
