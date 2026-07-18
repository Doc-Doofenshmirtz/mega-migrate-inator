import { NextResponse } from "next/server";
import { githubApiFromSettings } from "@/server/clients";
import { errorResponse } from "@/server/apiError";

export const runtime = "nodejs";

interface GithubOwner {
  login: string;
  type: "user" | "org";
  canCreateRepos: boolean;
  reason?: string;
}

export async function GET() {
  try {
    const octokit = githubApiFromSettings();
    const me = await octokit.request("GET /user");

    const owners: GithubOwner[] = [{ login: me.data.login, type: "user", canCreateRepos: true }];

    const memberships = await octokit.request("GET /user/memberships/orgs", { state: "active", per_page: 100 });

    for (const m of memberships.data) {
      const org = m.organization.login;
      if (m.role === "admin") {
        owners.push({ login: org, type: "org", canCreateRepos: true });
        continue;
      }
      // Non-admin member: only disable when we have positive evidence repo creation is restricted.
      // GitHub's own repo-create call is the real check anyway — this is a best-effort UI hint.
      try {
        const orgDetails = await octokit.request("GET /orgs/{org}", { org });
        const canCreate = orgDetails.data.members_can_create_repositories;
        if (canCreate === false) {
          owners.push({
            login: org,
            type: "org",
            canCreateRepos: false,
            reason: "Org settings restrict repository creation to admins, and this token's membership role is 'member'.",
          });
        } else {
          owners.push({ login: org, type: "org", canCreateRepos: true });
        }
      } catch {
        owners.push({ login: org, type: "org", canCreateRepos: true, reason: "Membership role is 'member' — permission will be validated when the run starts." });
      }
    }

    return NextResponse.json({ owners });
  } catch (err) {
    return errorResponse(err, "github.owners");
  }
}
