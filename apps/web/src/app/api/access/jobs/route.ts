import { NextResponse } from "next/server";
import { listAccessJobs } from "@/server/accessJobs";
import type { AccessProvider } from "@/server/accessEngine";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const provider = new URL(req.url).searchParams.get("provider") as AccessProvider | null;
  return NextResponse.json({ jobs: listAccessJobs(provider ?? undefined) });
}
