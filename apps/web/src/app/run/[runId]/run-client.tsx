"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PIPELINE_STEPS } from "@glab2gh/core/pipelineSteps.js";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRunEvents, type LiveRepoTask } from "@/lib/useRunEvents";
import { LogTail } from "./log-tail";

interface InitialRepoTask {
  repoPath: string;
  targetOwner: string;
  targetName: string;
  overallStatus: string;
  steps: LiveRepoTask["steps"];
  warnings: string[];
}

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "neutral",
  in_progress: "accent",
  success: "success",
  failed: "danger",
  verify_failed: "danger",
  empty: "neutral",
  skipped: "warning",
  cancelled: "warning",
  interrupted: "danger",
};

const STEP_LABEL: Record<string, string> = {
  preflight: "preflight",
  create_target: "create",
  mirror_clone: "clone",
  prune_refs: "prune",
  large_file_lfs_migrate: "large files",
  lfs_fetch: "lfs fetch",
  mirror_push: "push",
  lfs_push: "lfs push",
  default_branch: "branch",
  secrets: "secrets",
  protection: "protect",
  verify: "verify",
  cleanup: "cleanup",
};

function StepDot({ status }: { status: string | undefined }) {
  const color =
    status === "success"
      ? "var(--color-success)"
      : status === "failed"
        ? "var(--color-danger)"
        : status === "running"
          ? "var(--color-accent)"
          : status === "skipped"
            ? "var(--color-warning)"
            : "var(--color-border)";
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />;
}

export function RunClient({ runId }: { runId: string }) {
  const [initialTasks, setInitialTasks] = useState<InitialRepoTask[] | null>(null);
  const [concurrency, setConcurrency] = useState(3);
  const [acting, setActing] = useState(false);
  const { runStatus, repoTasks, logs, connected } = useRunEvents(runId);

  useEffect(() => {
    fetch(`/api/runs/${runId}`)
      .then((r) => r.json())
      .then((data) => {
        setInitialTasks(data.repoTasks ?? []);
        setConcurrency(data.run?.concurrency ?? 3);
      });
  }, [runId]);

  const merged = useMemo(() => {
    if (!initialTasks) return [];
    return initialTasks.map((t) => {
      const live = repoTasks.get(t.repoPath);
      return {
        ...t,
        overallStatus: live?.overallStatus ?? t.overallStatus,
        steps: live?.steps ?? t.steps,
        warnings: live?.warnings ?? t.warnings,
      };
    });
  }, [initialTasks, repoTasks]);

  const terminalStatuses = new Set(["success", "failed", "verify_failed", "empty", "skipped", "cancelled", "interrupted"]);
  const doneCount = merged.filter((t) => terminalStatuses.has(t.overallStatus)).length;
  const failedCount = merged.filter((t) => t.overallStatus === "failed" || t.overallStatus === "verify_failed").length;
  const progressPct = merged.length > 0 ? Math.round((doneCount / merged.length) * 100) : 0;

  async function cancelRun() {
    setActing(true);
    try {
      await fetch(`/api/runs/${runId}`, { method: "DELETE" });
    } finally {
      setActing(false);
    }
  }

  async function resumeRun() {
    setActing(true);
    try {
      await fetch(`/api/runs/${runId}/resume`, { method: "POST" });
    } finally {
      setActing(false);
    }
  }

  if (!initialTasks) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-muted)" }}>
        <Spinner /> Loading run…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Run</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
            {merged.length} repo(s) · concurrency {concurrency} · {connected ? "live" : "reconnecting…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[runStatus] ?? "neutral"}>{runStatus}</Badge>
          {runStatus === "running" || runStatus === "cancelling" ? (
            <Button variant="danger" size="sm" onClick={cancelRun} disabled={acting || runStatus === "cancelling"}>
              {runStatus === "cancelling" ? "Cancelling…" : "Cancel run"}
            </Button>
          ) : (
            (runStatus === "interrupted" || runStatus === "cancelled") && (
              <Button variant="secondary" size="sm" onClick={resumeRun} disabled={acting}>
                Resume run
              </Button>
            )
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

      <div className="space-y-3">
        {merged.map((task) => (
          <Card key={task.repoPath}>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{task.repoPath}</div>
                <div className="text-xs truncate" style={{ color: "var(--color-muted)" }}>
                  → {task.targetOwner}/{task.targetName}
                </div>
              </div>
              <Badge tone={STATUS_TONE[task.overallStatus] ?? "neutral"}>{task.overallStatus}</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-3">
                {PIPELINE_STEPS.map((step) => (
                  <div key={step} className="flex items-center gap-1.5 text-xs" title={task.steps[step]?.error ?? step}>
                    <StepDot status={task.steps[step]?.status} />
                    {STEP_LABEL[step] ?? step}
                  </div>
                ))}
              </div>
              {task.warnings.length > 0 && (
                <ul className="text-xs list-disc pl-5" style={{ color: "var(--color-warning)" }}>
                  {task.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              <LogTail lines={logs.filter((l) => l.repoPath === task.repoPath)} />
            </CardContent>
          </Card>
        ))}
      </div>

      {(runStatus === "completed" || runStatus === "cancelled") && (
        <div className="flex justify-end">
          <Link href={`/report/${runId}`}>
            <Button>View report →</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
