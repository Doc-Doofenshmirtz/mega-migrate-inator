import { NextResponse } from "next/server";
import { getLatestRepoStatuses } from "@/server/repoStatus";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ statuses: getLatestRepoStatuses() });
}
