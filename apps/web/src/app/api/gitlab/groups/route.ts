import { NextResponse } from "next/server";
import { listTopLevelGroups, listSubgroups } from "@glab2gh/core";
import { gitlabApiFromSettings } from "@/server/clients";
import { errorResponse } from "@/server/apiError";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const parentId = new URL(req.url).searchParams.get("parentId");

  try {
    const api = gitlabApiFromSettings();
    const groups = parentId ? await listSubgroups(api, parentId) : await listTopLevelGroups(api);
    return NextResponse.json({ groups });
  } catch (err) {
    return errorResponse(err);
  }
}
