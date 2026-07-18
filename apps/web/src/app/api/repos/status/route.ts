import { NextResponse } from "next/server";
import { getLatestRepoStatuses } from "@/server/repoStatus";
import { errorResponse } from "@/server/apiError";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ statuses: getLatestRepoStatuses() });
  } catch (err) {
    return errorResponse(err, "repos.status");
  }
}
