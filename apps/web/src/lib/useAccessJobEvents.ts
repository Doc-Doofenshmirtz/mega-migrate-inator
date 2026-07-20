"use client";

import { useEffect, useState } from "react";

export interface LiveAccessTask {
  repoRef: string;
  repoLabel: string;
  memberRef: string;
  memberLabel: string;
  status: string;
  error: string | null;
  resultJson: string | null;
  updatedAt: string;
}

function taskKey(repoRef: string, memberRef: string): string {
  return `${repoRef}::${memberRef}`;
}

export function useAccessJobEvents(jobId: string) {
  const [jobStatus, setJobStatus] = useState<string>("pending");
  const [tasks, setTasks] = useState<Map<string, LiveAccessTask>>(new Map());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource(`/api/access/jobs/${jobId}/events`);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener("access_task", (e) => {
      const data: LiveAccessTask = JSON.parse((e as MessageEvent).data);
      setTasks((prev) => new Map(prev).set(taskKey(data.repoRef, data.memberRef), data));
    });

    es.addEventListener("access_job_status", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      if (data.status) setJobStatus(data.status);
    });

    return () => es.close();
  }, [jobId]);

  return { jobStatus, tasks, connected };
}
