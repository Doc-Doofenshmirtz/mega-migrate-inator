import { NextResponse } from "next/server";
import { redact, logger } from "@glab2gh/core";
import { ConnectionNotConfiguredError } from "./clients";

/**
 * Every route that talks to GitLab/GitHub funnels its catch block through
 * here: redact() is the same choke point core's logger/exec use, so an SDK
 * error that happens to echo a token back never reaches the browser. It also
 * always logs server-side first — without that, a failure here was visible
 * only in the one browser tab that triggered it, never in `docker compose
 * logs`. `context` is a short label (e.g. "gitlab.projects") identifying
 * which route/operation failed, since the log line otherwise has no path info.
 */
export function errorResponse(err: unknown, context: string, fallbackStatus = 502): NextResponse {
  if (err instanceof ConnectionNotConfiguredError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  const message = redact(err instanceof Error ? err.message : String(err));
  logger.error({ context, stack: err instanceof Error ? err.stack : undefined }, `[api] ${context} failed: ${message}`);
  return NextResponse.json({ error: message }, { status: fallbackStatus });
}
