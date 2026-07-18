import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { createAndStartRun, ConnectionsNotConfiguredError, BlockingCollisionsError } from "@/server/runs";
import { errorResponse } from "@/server/apiError";
import type { MigrationOptions } from "@/lib/types";

export const runtime = "nodejs";

/** Creates a brand-new run scoped to just this run's failed/verify_failed repos, reusing its original options. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  const run = db.prepare("SELECT options_json FROM runs WHERE id = ?").get(id) as { options_json: string } | undefined;
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  const failedRows = db
    .prepare("SELECT repo_path FROM repo_tasks WHERE run_id = ? AND overall_status IN ('failed', 'verify_failed')")
    .all(id) as unknown as Array<{ repo_path: string }>;
  if (failedRows.length === 0) {
    return NextResponse.json({ error: "No failed repos to retry." }, { status: 400 });
  }

  const options = JSON.parse(run.options_json) as MigrationOptions;
  try {
    const result = await createAndStartRun(
      options,
      failedRows.map((r) => r.repo_path),
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ConnectionsNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof BlockingCollisionsError) {
      return NextResponse.json({ error: err.message, blockingErrors: err.blockingErrors }, { status: 400 });
    }
    return errorResponse(err, "runs.retry");
  }
}
