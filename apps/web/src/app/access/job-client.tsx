"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAccessJobEvents } from "@/lib/useAccessJobEvents";

interface InitialTask {
  repoRef: string;
  repoLabel: string;
  memberRef: string;
  memberLabel: string;
  status: string;
  error: string | null;
  result: { invitationUrl?: string } | null;
}

interface JobInfo {
  action: "add" | "remove";
  role: string | null;
  concurrency: number;
  status: string;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "neutral",
  running: "accent",
  success: "success",
  invited: "warning",
  failed: "danger",
  cancelled: "warning",
  interrupted: "danger",
  cancelling: "warning",
  completed: "success",
};

const TERMINAL = new Set(["success", "invited", "failed", "cancelled", "interrupted"]);

/**
 * Shared job progress/results view for both GitHub and GitLab access jobs —
 * unlike the pickers/wizards (which differ per provider's vocabulary), the
 * underlying access_jobs/access_tasks schema and status set is identical
 * across providers, so one component covers both.
 */
export function JobClient({ jobId, backHref, title }: { jobId: string; backHref: string; title: string }) {
  const [job, setJob] = useState<JobInfo | null>(null);
  const [initialTasks, setInitialTasks] = useState<InitialTask[] | null>(null);
  const [acting, setActing] = useState(false);
  const { jobStatus, tasks: liveTasks, connected } = useAccessJobEvents(jobId);

  useEffect(() => {
    fetch(`/api/access/jobs/${jobId}`)
      .then((r) => r.json())
      .then((data) => {
        setJob(data.job);
        setInitialTasks(data.tasks ?? []);
      });
  }, [jobId]);

  const merged = useMemo(() => {
    if (!initialTasks) return [];
    return initialTasks.map((t) => {
      const live = liveTasks.get(`${t.repoRef}::${t.memberRef}`);
      if (!live) return t;
      return {
        ...t,
        status: live.status,
        error: live.error,
        result: live.resultJson ? JSON.parse(live.resultJson) : null,
      };
    });
  }, [initialTasks, liveTasks]);

  const status = jobStatus !== "pending" ? jobStatus : (job?.status ?? "pending");
  const doneCount = merged.filter((t) => TERMINAL.has(t.status)).length;
  const failedCount = merged.filter((t) => t.status === "failed").length;
  const progressPct = merged.length > 0 ? Math.round((doneCount / merged.length) * 100) : 0;
  const isActive = status === "running" || status === "cancelling";

  async function cancel() {
    setActing(true);
    try {
      await fetch(`/api/access/jobs/${jobId}`, { method: "DELETE" });
    } finally {
      setActing(false);
    }
  }

  async function retryFailed() {
    setActing(true);
    try {
      const res = await fetch(`/api/access/jobs/${jobId}/retry`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.jobId) {
        window.location.href = `${backHref}/${data.jobId}`;
      }
    } finally {
      setActing(false);
    }
  }

  if (!job || !initialTasks) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-muted)" }}>
        <Spinner /> Loading job…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
            {job.action === "add" ? "Add" : "Remove"} access{job.role ? ` · ${job.role}` : ""} · {merged.length} task(s) · concurrency{" "}
            {job.concurrency} · {connected ? "live" : "reconnecting…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status}</Badge>
          {isActive && (
            <Button variant="danger" size="sm" onClick={cancel} disabled={acting || status === "cancelling"}>
              {status === "cancelling" ? "Cancelling…" : "Cancel job"}
            </Button>
          )}
          {!isActive && failedCount > 0 && (
            <Button variant="secondary" size="sm" onClick={retryFailed} disabled={acting}>
              {acting && <Spinner />}
              Retry {failedCount} failed
            </Button>
          )}
        </div>
      </div>

      <div>
        <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
          <div className="h-full bg-[var(--color-accent)] transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
          {doneCount}/{merged.length} finished{failedCount > 0 ? ` · ${failedCount} failed` : ""}
        </div>
      </div>

      <Card>
        <CardHeader className="py-3 text-xs font-medium" style={{ color: "var(--color-muted)" }}>
          Repository → user
        </CardHeader>
        <CardContent className="p-0">
          {merged.map((t) => (
            <div key={`${t.repoRef}::${t.memberRef}`} className="flex items-center gap-3 px-4 py-2.5 text-sm border-b last:border-b-0">
              <div className="flex-1 min-w-0">
                <div className="truncate">
                  {t.repoLabel} <span style={{ color: "var(--color-muted)" }}>→</span> {t.memberLabel}
                </div>
                {t.error && (
                  <div
                    className="text-xs text-[var(--color-danger)] mt-0.5 break-words whitespace-pre-wrap rounded px-1.5 py-1"
                    style={{ background: "color-mix(in srgb, var(--color-danger) 8%, transparent)" }}
                  >
                    {t.error}
                  </div>
                )}
                {t.status === "invited" && (t.result?.invitationUrl ? (
                  <a href={t.result.invitationUrl} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "var(--color-muted)" }}>
                    pending invitation — not yet accepted
                  </a>
                ) : (
                  <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                    pending invitation — not yet accepted
                  </div>
                ))}
              </div>
              <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-start">
        <a href={backHref} className="text-sm underline" style={{ color: "var(--color-muted)" }}>
          ← Back to job history
        </a>
      </div>
    </div>
  );
}
