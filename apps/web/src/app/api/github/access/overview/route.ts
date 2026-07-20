import { NextResponse } from "next/server";
import { detectOwnerType } from "@glab2gh/core";
import { githubApiFromSettings } from "@/server/clients";
import { errorResponse } from "@/server/apiError";

export const runtime = "nodejs";

const CONCURRENCY = 5;

/**
 * Fans out across every repo under one owner/org to compute a live
 * total-members / per-repo / per-user view — no local cache, so this is
 * scoped to a single owner at a time to keep the fan-out (and GitHub rate
 * limit usage) bounded.
 */
export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get("owner");
  if (!owner) {
    return NextResponse.json({ error: "owner query param is required" }, { status: 400 });
  }

  try {
    const octokit = githubApiFromSettings();
    const ownerType = await detectOwnerType(octokit, owner);
    const iterator =
      ownerType === "Organization"
        ? octokit.paginate.iterator(octokit.rest.repos.listForOrg, { org: owner, per_page: 100 })
        : octokit.paginate.iterator(octokit.rest.repos.listForUser, { username: owner, per_page: 100 });

    const repoNames: string[] = [];
    for await (const { data } of iterator) {
      for (const r of data as Array<{ name: string }>) repoNames.push(r.name);
    }

    const perRepo: Array<{ repo: string; memberCount: number; pendingCount: number }> = [];
    const usersToRepos = new Map<string, Set<string>>();

    let index = 0;
    const worker = async () => {
      for (;;) {
        const i = index++;
        if (i >= repoNames.length) return;
        const repo = repoNames[i]!;
        const [collaborators, invitations] = await Promise.all([
          octokit.paginate(octokit.rest.repos.listCollaborators, { owner, repo, affiliation: "all", per_page: 100 }),
          octokit.paginate(octokit.rest.repos.listInvitations, { owner, repo, per_page: 100 }),
        ]);
        const logins = new Set<string>(collaborators.map((c) => c.login));
        for (const inv of invitations) {
          if (inv.invitee?.login) logins.add(inv.invitee.login);
        }
        for (const login of logins) {
          if (!usersToRepos.has(login)) usersToRepos.set(login, new Set());
          usersToRepos.get(login)!.add(repo);
        }
        perRepo.push({ repo, memberCount: logins.size, pendingCount: invitations.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, repoNames.length || 1) }, () => worker()));

    const perUser = Array.from(usersToRepos.entries())
      .map(([username, repos]) => ({ username, repoCount: repos.size, repos: Array.from(repos).sort() }))
      .sort((a, b) => b.repoCount - a.repoCount);
    perRepo.sort((a, b) => a.repo.localeCompare(b.repo));

    return NextResponse.json({
      totalRepos: repoNames.length,
      totalUniqueUsers: usersToRepos.size,
      perRepo,
      perUser,
    });
  } catch (err) {
    return errorResponse(err, "github.access.overview");
  }
}
