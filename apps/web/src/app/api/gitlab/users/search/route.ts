import { NextResponse } from "next/server";
import { gitlabApiFromSettings } from "@/server/clients";
import { errorResponse } from "@/server/apiError";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q");
  if (!q) {
    return NextResponse.json({ users: [] });
  }

  try {
    const api = gitlabApiFromSettings();
    const users = (await api.Users.all({ search: q, perPage: 10 })) as any[];
    return NextResponse.json({ users: users.map((u) => ({ username: u.username, name: u.name, avatarUrl: u.avatar_url })) });
  } catch (err) {
    return errorResponse(err, "gitlab.users.search");
  }
}
