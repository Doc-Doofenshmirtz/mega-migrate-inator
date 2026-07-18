"use client";

import { useEffect, useRef, useState } from "react";

export interface StepRecord {
  status: "running" | "success" | "failed" | "skipped";
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface LiveRepoTask {
  repoPath: string;
  overallStatus: string;
  steps: Record<string, StepRecord>;
  warnings: string[];
  updatedAt: string;
}

export interface LogLine {
  id: number;
  repoPath: string | null;
  ts: string;
  level: string;
  line: string;
}

const MAX_LOG_LINES = 3000;

export function useRunEvents(runId: string) {
  const [runStatus, setRunStatus] = useState<string>("running");
  const [repoTasks, setRepoTasks] = useState<Map<string, LiveRepoTask>>(new Map());
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const lastEventId = useRef(0);

  useEffect(() => {
    const es = new EventSource(`/api/runs/${runId}/events`);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener("log", (e) => {
      const data: LogLine = JSON.parse((e as MessageEvent).data);
      lastEventId.current = Math.max(lastEventId.current, data.id);
      setLogs((prev) => {
        const next = [...prev, data];
        return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
      });
    });

    es.addEventListener("repo_task", (e) => {
      const data: LiveRepoTask = JSON.parse((e as MessageEvent).data);
      setRepoTasks((prev) => new Map(prev).set(data.repoPath, data));
    });

    es.addEventListener("run_status", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      if (data.status) setRunStatus(data.status);
    });

    return () => es.close();
  }, [runId]);

  return { runStatus, repoTasks, logs, connected };
}
