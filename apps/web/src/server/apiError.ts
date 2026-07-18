import { NextResponse } from "next/server";
import { redact } from "@glab2gh/core";
import { ConnectionNotConfiguredError } from "./clients";

/**
 * Every route that talks to GitLab/GitHub funnels its catch block through
 * here: redact() is the same choke point core's logger/exec use, so an SDK
 * error that happens to echo a token back never reaches the browser.
 */
export function errorResponse(err: unknown, fallbackStatus = 502): NextResponse {
  if (err instanceof ConnectionNotConfiguredError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  const message = redact(err instanceof Error ? err.message : String(err));
  return NextResponse.json({ error: message }, { status: fallbackStatus });
}
