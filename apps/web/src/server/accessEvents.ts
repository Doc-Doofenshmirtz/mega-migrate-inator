import { EventEmitter } from "node:events";

export interface AccessTaskEvent {
  kind: "access_task";
  jobId: string;
  repoRef: string;
  repoLabel: string;
  memberRef: string;
  memberLabel: string;
  status: string;
  error: string | null;
  resultJson: string | null;
  updatedAt: string;
}

export interface AccessJobStatusEvent {
  kind: "access_job_status";
  jobId: string;
  status: string;
}

export type AccessEvent = AccessTaskEvent | AccessJobStatusEvent;

const emitters = new Map<string, EventEmitter>();

function emitterFor(jobId: string): EventEmitter {
  let e = emitters.get(jobId);
  if (!e) {
    e = new EventEmitter();
    e.setMaxListeners(100);
    emitters.set(jobId, e);
  }
  return e;
}

export function subscribe(jobId: string, listener: (evt: AccessEvent) => void): () => void {
  const e = emitterFor(jobId);
  e.on("event", listener);
  return () => e.off("event", listener);
}

export function publishAccessTask(evt: Omit<AccessTaskEvent, "kind">): void {
  emitterFor(evt.jobId).emit("event", { kind: "access_task", ...evt } satisfies AccessTaskEvent);
}

export function publishAccessJobStatus(jobId: string, status: string): void {
  emitterFor(jobId).emit("event", { kind: "access_job_status", jobId, status } satisfies AccessJobStatusEvent);
}

export function clearEmitter(jobId: string): void {
  emitters.delete(jobId);
}
