import { NextResponse } from "next/server";
import { githubApiFromSettings } from "@/server/clients";
import { errorResponse } from "@/server/apiError";
import type { GithubCollaborator } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const owner = params.get("owner");
  const repo = params.get("repo");
  if (!owner || !repo) {
    return NextResponse.json({ error: "owner and repo query params are required" }, { status: 400 });
  }

  try {
    const octokit = githubApiFromSettings();
    const [collaborators, invitations] = await Promise.all([
      octokit.paginate(octokit.rest.repos.listCollaborators, { owner, repo, affiliation: "all", per_page: 100 }),
      octokit.paginate(octokit.rest.repos.listInvitations, { owner, repo, per_page: 100 }),
    ]);

    // Pending invitees don't appear in listCollaborators until accepted — merge them in
    // so the member count/list is accurate, tagged distinctly from active collaborators.
    const members: GithubCollaborator[] = collaborators.map((c) => ({
      login: c.login,
      avatarUrl: c.avatar_url,
      permission: c.role_name,
      pending: false,
    }));
    for (const inv of invitations) {
      const invitee = inv.invitee;
      if (invitee?.login) {
        members.push({ login: invitee.login, avatarUrl: invitee.avatar_url, permission: inv.permissions, pending: true });
      }
    }

    return NextResponse.json({ members });
  } catch (err) {
    return errorResponse(err, "github.repos.collaborators");
  }
}
