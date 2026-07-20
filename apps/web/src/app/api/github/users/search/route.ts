import { NextResponse } from "next/server";
import { githubApiFromSettings } from "@/server/clients";
import { errorResponse } from "@/server/apiError";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q");
  if (!q) {
    return NextResponse.json({ users: [] });
  }

  try {
    const octokit = githubApiFromSettings();
    const { data } = await octokit.rest.search.users({ q, per_page: 10 });
    return NextResponse.json({ users: data.items.map((u) => ({ login: u.login, avatarUrl: u.avatar_url })) });
  } catch (err) {
    return errorResponse(err, "github.users.search");
  }
}
