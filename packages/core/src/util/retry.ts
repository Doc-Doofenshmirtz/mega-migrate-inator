import { logger } from "./logger.js";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
  /** Return retry-after seconds if the error is retryable, or false if not. */
  isRetryable?: (err: unknown) => number | boolean;
}

function defaultIsRetryable(err: unknown): number | boolean {
  const status = (err as any)?.status ?? (err as any)?.response?.status;
  if (status === 403 || status === 429 || status === 502 || status === 503 || status === 504) {
    const headers = (err as any)?.response?.headers ?? {};
    const retryAfter = headers["retry-after"] ?? headers["Retry-After"];
    if (retryAfter) {
      const secs = Number(retryAfter);
      if (!Number.isNaN(secs)) return secs;
    }
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const maxDelayMs = opts.maxDelayMs ?? 60_000;
  const isRetryable = opts.isRetryable ?? defaultIsRetryable;
  const label = opts.label ?? "operation";

  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      return await fn();
    } catch (err) {
      const retryable = isRetryable(err);
      if (!retryable || attempt >= maxAttempts) {
        throw err;
      }
      const retryAfterSecs = typeof retryable === "number" ? retryable : 0;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delay = Math.max(retryAfterSecs * 1000, backoff);
      logger.warn(
        { attempt, maxAttempts, delayMs: delay },
        `${label} failed, retrying after backoff`,
      );
      await sleep(delay);
    }
  }
}
