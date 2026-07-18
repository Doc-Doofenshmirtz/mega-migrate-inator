import { NextResponse } from "next/server";
import { getDefaultOptions, setDefaultOptions } from "@/server/settings";
import type { MigrationOptions } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const defaults = getDefaultOptions<MigrationOptions>();
  return NextResponse.json({ defaults: defaults ?? null });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  setDefaultOptions(body);
  return NextResponse.json({ ok: true });
}
