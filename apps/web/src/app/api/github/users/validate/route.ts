import { NextResponse } from "next/server";
import { githubApiFromSettings } from "@/server/clients";
import { errorResponse } from "@/server/apiError";

export const runtime = "nodejs";

/** Confirms an exact username exists before it's allowed into the review step, so a typo doesn't become a wasted task. */
export async function GET(req: Request) {
  const username = new URL(req.url).searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "username query param is required" }, { status: 400 });
  }

  try {
    const octokit = githubApiFromSettings();
    const { data } = await octokit.rest.users.getByUsername({ username });
    return NextResponse.json({ found: true, login: data.login, avatarUrl: data.avatar_url });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 404) {
      return NextResponse.json({ found: false });
    }
    return errorResponse(err, "github.users.validate");
  }
}
