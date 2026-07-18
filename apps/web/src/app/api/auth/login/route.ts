import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPassword, issueSessionToken, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "@/server/auth";

export const runtime = "nodejs";

const BodySchema = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "password is required" }, { status: 400 });
  }

  if (!checkPassword(parsed.data.password)) {
    // Deliberately generic — don't help an attacker distinguish "wrong password" from "no password set".
    return NextResponse.json({ error: "incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, issueSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
  return res;
}
