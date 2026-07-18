import pino from "pino";
import { redact } from "./redact.js";
import { emitEvent } from "./events.js";

const isTTY = process.stdout.isTTY;

const base = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: isTTY
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
    : undefined,
});

/**
 * Wrap pino so every string field/message is scrubbed for secrets before
 * it ever reaches a transport (stdout or a log file). This is the single
 * choke point that guarantees tokens/secret values never get logged.
 */
function scrubDeep<T>(value: T): T {
  if (typeof value === "string") {
    return redact(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrubDeep(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubDeep(v);
    }
    return out as unknown as T;
  }
  return value;
}

type LogFn = (obj: unknown, msg?: string, ...args: unknown[]) => void;
type Level = "debug" | "info" | "warn" | "error";

/**
 * Also emits every log call through util/events.ts's AsyncLocalStorage bridge
 * (a no-op unless something called runWithEmitter() up the call stack, e.g.
 * the web app's job engine) so log lines can be streamed live without any
 * changes at the ~100 call sites that use `logger`/`logger.child()`.
 */
function wrap(fn: LogFn, level: Level, repo?: string): LogFn {
  return (obj: unknown, msg?: string, ...args: unknown[]) => {
    if (typeof obj === "string") {
      const line = redact(obj);
      fn(line);
      emitEvent({ type: "log", level, line, repo });
      return;
    }
    const redactedMsg = msg ? redact(msg) : msg;
    fn(scrubDeep(obj), redactedMsg, ...args);
    emitEvent({ type: "log", level, line: redactedMsg ?? JSON.stringify(scrubDeep(obj)), repo });
  };
}

export const logger = {
  debug: wrap(base.debug.bind(base), "debug"),
  info: wrap(base.info.bind(base), "info"),
  warn: wrap(base.warn.bind(base), "warn"),
  error: wrap(base.error.bind(base), "error"),
  child: (bindings: Record<string, unknown>) => {
    const child = base.child(scrubDeep(bindings) as Record<string, unknown>);
    const repo = typeof bindings.repo === "string" ? bindings.repo : undefined;
    return {
      debug: wrap(child.debug.bind(child), "debug", repo),
      info: wrap(child.info.bind(child), "info", repo),
      warn: wrap(child.warn.bind(child), "warn", repo),
      error: wrap(child.error.bind(child), "error", repo),
    };
  },
};

export type Logger = typeof logger;
