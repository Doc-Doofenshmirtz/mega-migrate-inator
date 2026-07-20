import { subscribe } from "@/server/accessEvents";
import { getDb } from "@/server/db";

export const runtime = "nodejs";

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

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await ctx.params;
  const db = getDb();
  const job = db.prepare("SELECT status FROM access_jobs WHERE id = ?").get(jobId) as { status: string } | undefined;
  if (!job) {
    return new Response("job not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      function send(eventName: string, data: unknown) {
        if (closed) return;
        const chunk = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      }

      // access_tasks is a current-state snapshot table, not an append log — always resend in full on connect.
      send("access_job_status", { jobId, status: job.status });
      const tasks = db
        .prepare(
          "SELECT repo_ref, repo_label, member_ref, member_label, status, error, result_json, updated_at FROM access_tasks WHERE job_id = ?",
        )
        .all(jobId) as unknown as AccessTaskRow[];
      for (const t of tasks) {
        send("access_task", {
          jobId,
          repoRef: t.repo_ref,
          repoLabel: t.repo_label,
          memberRef: t.member_ref,
          memberLabel: t.member_label,
          status: t.status,
          error: t.error,
          resultJson: t.result_json,
          updatedAt: t.updated_at,
        });
      }

      unsubscribe = subscribe(jobId, (evt) => {
        if (evt.kind === "access_task") send("access_task", evt);
        else send("access_job_status", evt);
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
