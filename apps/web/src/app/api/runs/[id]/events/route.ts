import { subscribe, getLogLinesSince } from "@/server/events";
import { getDb } from "@/server/db";

export const runtime = "nodejs";

interface RepoTaskRow {
  repo_path: string;
  overall_status: string;
  steps_json: string;
  warnings_json: string;
  updated_at: string;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: runId } = await ctx.params;
  const db = getDb();
  const run = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string } | undefined;
  if (!run) {
    return new Response("run not found", { status: 404 });
  }

  const lastEventIdHeader = req.headers.get("last-event-id");
  const url = new URL(req.url);
  const lastEventId = Number(lastEventIdHeader ?? url.searchParams.get("lastEventId") ?? 0) || 0;

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      function send(eventName: string, data: unknown, id?: number) {
        if (closed) return;
        let chunk = `event: ${eventName}\n`;
        if (id !== undefined) chunk += `id: ${id}\n`;
        chunk += `data: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      }

      // Backfill: log lines the client missed while disconnected.
      for (const line of getLogLinesSince(runId, lastEventId)) {
        send("log", line, line.id);
      }

      // repo_task/run_status are current-state snapshots, not an append log — always resend in full on connect.
      send("run_status", { status: run.status });
      const tasks = db
        .prepare("SELECT repo_path, overall_status, steps_json, warnings_json, updated_at FROM repo_tasks WHERE run_id = ?")
        .all(runId) as unknown as RepoTaskRow[];
      for (const t of tasks) {
        send("repo_task", {
          repoPath: t.repo_path,
          overallStatus: t.overall_status,
          steps: JSON.parse(t.steps_json),
          warnings: JSON.parse(t.warnings_json),
          updatedAt: t.updated_at,
        });
      }

      unsubscribe = subscribe(runId, (evt) => {
        if (evt.kind === "log") send("log", evt, evt.id);
        else if (evt.kind === "repo_task") send("repo_task", evt);
        else send("run_status", evt);
      });

      // Keep intermediate proxies from timing out an idle connection.
      heartbeat = setInterval(() => send("ping", {}), 15000);

      const onAbort = () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", onAbort);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
