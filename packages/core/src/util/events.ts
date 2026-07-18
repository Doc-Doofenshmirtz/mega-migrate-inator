import { AsyncLocalStorage } from "node:async_hooks";

// Step/warning/overall-status changes are already tracked authoritatively by
// whatever StateSink is in play (see state.ts) — a consumer that wants those
// (like the web app's SqliteStateStore) hooks its own onChange there instead
// of duplicating them through this bridge. This event type only carries what
// StateSink doesn't: raw log lines, emitted by logger.ts and exec.ts.
export type PipelineEvent = { type: "log"; level: "debug" | "info" | "warn" | "error"; line: string; repo?: string };

export interface EventContext {
  emit: (evt: PipelineEvent) => void;
}

const storage = new AsyncLocalStorage<EventContext>();

/** Runs `fn` with an active event context; nested calls to emitEvent() reach `emit`. */
export function runWithEmitter<T>(emit: (evt: PipelineEvent) => void, fn: () => T): T {
  return storage.run({ emit }, fn);
}

/** No-op outside of runWithEmitter() — safe to call unconditionally from anywhere in core. */
export function emitEvent(evt: PipelineEvent): void {
  storage.getStore()?.emit(evt);
}
