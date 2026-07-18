import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getEngine } from "@/server/engine";

export const runtime = "nodejs";

interface RunRow {
  id: string;
  created_at: string;
  status: string;
  options_json: string;
  concurrency: number;
}

interface RepoTaskRow {
  repo_path: string;
  target_owner: string;
  target_name: string;
  overall_status: string;
  steps_json: string;
  warnings_json: string;
  result_json: string | null;
  updated_at: string;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  const run = db.prepare("SELECT id, created_at, status, options_json, concurrency FROM runs WHERE id = ?").get(id) as RunRow | undefined;
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  const tasks = db
    .prepare(
      "SELECT repo_path, target_owner, target_name, overall_status, steps_json, warnings_json, result_json, updated_at FROM repo_tasks WHERE run_id = ? ORDER BY repo_path",
    )
    .all(id) as unknown as RepoTaskRow[];

  return NextResponse.json({
    run: {
      id: run.id,
      createdAt: run.created_at,
      status: run.status,
      options: JSON.parse(run.options_json),
      concurrency: run.concurrency,
    },
    repoTasks: tasks.map((t) => ({
      repoPath: t.repo_path,
      targetOwner: t.target_owner,
      targetName: t.target_name,
      overallStatus: t.overall_status,
      steps: JSON.parse(t.steps_json),
      warnings: JSON.parse(t.warnings_json),
      result: t.result_json ? JSON.parse(t.result_json) : null,
      updatedAt: t.updated_at,
    })),
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const cancelled = getEngine().cancelRun(id);
  if (!cancelled) {
    return NextResponse.json({ error: "run is not active" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
