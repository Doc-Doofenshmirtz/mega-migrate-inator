import { NextResponse, type NextRequest } from "next/server";
import { isAuthRequired, verifySessionToken, SESSION_COOKIE_NAME } from "@/server/auth";

// Proxy always runs on the Node.js runtime (Next 16+), which is what lets
// auth verification read the per-install signing secret out of SQLite via
// server/settings.ts directly here — no separate edge-safe code path needed.

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const AUTH_EXEMPT_PREFIXES = ["/login", "/api/auth/"];

function checkCsrf(req: NextRequest): NextResponse | null {
  if (!MUTATING.has(req.method)) return null;
  const origin = req.headers.get("origin");
  if (!origin) return null; // same-origin fetch() often omits Origin; host header + no-cors is the realistic threat model here
  const originHost = new URL(origin).host;
  if (originHost !== req.headers.get("host")) {
    return NextResponse.json({ error: "cross-origin request rejected" }, { status: 403 });
  }
  return null;
}

/**
 * Two independent guards on every request:
 * 1. CSRF — mutating requests must be same-origin (always active).
 * 2. Password session gate — only active once GLAB2GH_AUTH_PASSWORD is set,
 *    which server.js requires before it will bind to a non-loopback host.
 *    This app holds tokens that can read/write every repo it's pointed at.
 */
export function proxy(req: NextRequest) {
  const csrfRejection = checkCsrf(req);
  if (csrfRejection) return csrfRejection;

  if (!isAuthRequired()) return NextResponse.next();

  const pathname = req.nextUrl.pathname;
  if (AUTH_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (verifySessionToken(token)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
