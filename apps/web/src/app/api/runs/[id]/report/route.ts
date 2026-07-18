import { NextResponse } from "next/server";
import { renderReport } from "@glab2gh/core";
import type { RepoMigrationResult } from "@glab2gh/core";
import { getDb } from "@/server/db";

export const runtime = "nodejs";

interface RunRow {
  created_at: string;
}
interface RepoTaskRow {
  repo_path: string;
  target_owner: string;
  target_name: string;
  overall_status: string;
  warnings_json: string;
  result_json: string | null;
}

function fallbackResult(row: RepoTaskRow): RepoMigrationResult {
  // A repo that never finished (interrupted/cancelled before its result was recorded) still needs a report row.
  return {
    sourcePath: row.repo_path,
    targetFullName: `${row.target_owner}/${row.target_name}`,
    targetUrl: "",
    status: (row.overall_status as RepoMigrationResult["status"]) ?? "failed",
    branches: 0,
    tags: 0,
    lfs: false,
    secretsCount: 0,
    secretMappings: [],
    prunedRefs: 0,
    protectionResults: [],
    sensitiveFiles: [],
    warnings: JSON.parse(row.warnings_json ?? "[]"),
  };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format");

  const db = getDb();
  const run = db.prepare("SELECT created_at FROM runs WHERE id = ?").get(id) as RunRow | undefined;
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  const taskRows = db
    .prepare("SELECT repo_path, target_owner, target_name, overall_status, warnings_json, result_json FROM repo_tasks WHERE run_id = ? ORDER BY repo_path")
    .all(id) as unknown as RepoTaskRow[];

  const results: RepoMigrationResult[] = taskRows.map((row) => (row.result_json ? JSON.parse(row.result_json) : fallbackResult(row)));

  if (format === "md") {
    const markdown = renderReport(results, run.created_at);
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="glab2gh-report-${id}.md"`,
      },
    });
  }

  return NextResponse.json({ runStartedAt: run.created_at, results });
}
