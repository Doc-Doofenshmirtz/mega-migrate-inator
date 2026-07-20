import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getAccessEngine } from "@/server/accessEngine";

export const runtime = "nodejs";

interface AccessJobRow {
  id: string;
  provider: string;
  action: string;
  role: string | null;
  expires_at: string | null;
  created_at: string;
  status: string;
  concurrency: number;
}

interface AccessTaskRow {
  repo_ref: string;
  repo_label: string;
  member_ref: string;
  member_label: string;
  status: string;
  error: string | null;
  result_json: string | null;
  updated_at: string;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  const job = db
    .prepare("SELECT id, provider, action, role, expires_at, created_at, status, concurrency FROM access_jobs WHERE id = ?")
    .get(id) as AccessJobRow | undefined;
  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }
  const tasks = db
    .prepare(
      "SELECT repo_ref, repo_label, member_ref, member_label, status, error, result_json, updated_at FROM access_tasks WHERE job_id = ? ORDER BY repo_label, member_label",
    )
    .all(id) as unknown as AccessTaskRow[];

  return NextResponse.json({
    job: {
      id: job.id,
      provider: job.provider,
      action: job.action,
      role: job.role,
      expiresAt: job.expires_at,
      createdAt: job.created_at,
      status: job.status,
      concurrency: job.concurrency,
    },
    tasks: tasks.map((t) => ({
      repoRef: t.repo_ref,
      repoLabel: t.repo_label,
      memberRef: t.member_ref,
      memberLabel: t.member_label,
      status: t.status,
      error: t.error,
      result: t.result_json ? JSON.parse(t.result_json) : null,
      updatedAt: t.updated_at,
    })),
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const cancelled = getAccessEngine().cancelJob(id);
  if (!cancelled) {
    return NextResponse.json({ error: "job is not active" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
