import { createHmac, timingSafeEqual } from "node:crypto";
import { getOrCreateAuthSessionSecret } from "./settings";

export const SESSION_COOKIE_NAME = "glab2gh_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;

/** Password gate only applies once GLAB2GH_AUTH_PASSWORD is set — see server.js for why binding non-loopback requires it. */
export function isAuthRequired(): boolean {
  return Boolean(process.env.GLAB2GH_AUTH_PASSWORD);
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.GLAB2GH_AUTH_PASSWORD ?? "";
  if (!expected) return false;
  return safeEqual(candidate, expected);
}

/** Signed with a random per-install secret (never the password itself) so the cookie value reveals nothing. */
export function issueSessionToken(): string {
  const secret = getOrCreateAuthSessionSecret();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = String(expiresAt);
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const secret = getOrCreateAuthSessionSecret();
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  if (!safeEqual(sig, expected)) return false;
  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}
