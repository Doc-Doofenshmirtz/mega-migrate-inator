import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { githubApiFromSettings, gitlabApiFromSettings } from "@/server/clients";
import { createAndStartAccessJob } from "@/server/accessJobs";
import type { AccessProvider, AccessAction } from "@/server/accessEngine";
import { errorResponse } from "@/server/apiError";

export const runtime = "nodejs";

interface AccessJobRow {
  provider: AccessProvider;
  action: AccessAction;
  role: string | null;
  expires_at: string | null;
  concurrency: number;
}

/** Creates a brand-new job scoped to just this job's failed tasks, reusing its original provider/action/role. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  const job = db.prepare("SELECT provider, action, role, expires_at, concurrency FROM access_jobs WHERE id = ?").get(id) as
    | AccessJobRow
    | undefined;
  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  const failedRows = db
    .prepare("SELECT repo_ref, repo_label, member_ref, member_label FROM access_tasks WHERE job_id = ? AND status = 'failed'")
    .all(id) as unknown as Array<{ repo_ref: string; repo_label: string; member_ref: string; member_label: string }>;
  if (failedRows.length === 0) {
    return NextResponse.json({ error: "No failed tasks to retry." }, { status: 400 });
  }

  try {
    const client = job.provider === "github" ? githubApiFromSettings() : gitlabApiFromSettings();
    const { jobId } = createAndStartAccessJob({
      provider: job.provider,
      action: job.action,
      role: job.role,
      expiresAt: job.expires_at,
      concurrency: job.concurrency,
      client,
      tasks: failedRows.map((r) => ({
        repoRef: r.repo_ref,
        repoLabel: r.repo_label,
        memberRef: r.member_ref,
        memberLabel: r.member_label,
      })),
    });
    return NextResponse.json({ jobId });
  } catch (err) {
    return errorResponse(err, "access.jobs.retry");
  }
}
