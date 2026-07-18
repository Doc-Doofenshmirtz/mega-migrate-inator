import { NextResponse } from "next/server";
import { listProjectsPage } from "@glab2gh/core";
import { gitlabApiFromSettings } from "@/server/clients";
import { errorResponse } from "@/server/apiError";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const groupId = params.get("groupId") ?? undefined;
  const search = params.get("search") ?? undefined;
  const page = params.get("page") ? Number(params.get("page")) : undefined;
  const includeArchived = params.get("includeArchived") === "true";

  try {
    const api = gitlabApiFromSettings();
    const result = await listProjectsPage(api, { groupId: groupId ?? undefined, search, page, includeArchived });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "gitlab.projects");
  }
}
