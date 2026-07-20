import { NextResponse } from "next/server";
import { gitlabApiFromSettings } from "@/server/clients";
import { errorResponse } from "@/server/apiError";
import type { GitlabMemberRef } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const projectId = params.get("projectId");
  const includeInherited = params.get("includeInherited") === "true";
  if (!projectId) {
    return NextResponse.json({ error: "projectId query param is required" }, { status: 400 });
  }

  try {
    const api = gitlabApiFromSettings();
    const raw = (await api.ProjectMembers.all(projectId, { includeInherited })) as any[];
    const members: GitlabMemberRef[] = raw.map((m) => ({
      id: m.id,
      username: m.username,
      name: m.name,
      avatarUrl: m.avatar_url,
      accessLevel: m.access_level,
    }));
    return NextResponse.json({ members });
  } catch (err) {
    return errorResponse(err, "gitlab.projects.members");
  }
}
