import { NextResponse } from "next/server";
import { getGitlabConnection, getGithubConnection, forgetCredentials } from "@/server/settings";

export const runtime = "nodejs";

export async function GET() {
  const gitlab = getGitlabConnection();
  const github = getGithubConnection();
  return NextResponse.json({
    gitlab: gitlab ? { configured: true, url: gitlab.url, insecureTls: gitlab.insecureTls } : { configured: false },
    github: github ? { configured: true, apiUrl: github.apiUrl } : { configured: false },
  });
}

export async function DELETE() {
  forgetCredentials();
  return NextResponse.json({ ok: true });
}
