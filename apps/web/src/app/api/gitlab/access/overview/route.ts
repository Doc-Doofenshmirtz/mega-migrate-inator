import { NextResponse } from "next/server";
import { gitlabApiFromSettings } from "@/server/clients";
import { errorResponse } from "@/server/apiError";

export const runtime = "nodejs";

const CONCURRENCY = 5;

interface RawProjectRef {
  id: number;
  path_with_namespace: string;
}

/**
 * Fans out across every project in one group (or, with no groupId, every
 * project the token is a member of) to compute a live total-members /
 * per-repo / per-user view — no local cache, so this is scoped rather than
 * fetching every project on the instance.
 */
export async function GET(req: Request) {
  const groupId = new URL(req.url).searchParams.get("groupId");

  try {
    const api = gitlabApiFromSettings();
    const raw: RawProjectRef[] = groupId
      ? ((await api.Groups.allProjects(groupId, { includeSubgroups: true, perPage: 100 })) as unknown as RawProjectRef[])
      : ((await api.Projects.all({ membership: true, perPage: 100 })) as unknown as RawProjectRef[]);
    const projects = raw.map((p) => ({ id: p.id, pathWithNamespace: p.path_with_namespace }));

    const perRepo: Array<{ repo: string; memberCount: number }> = [];
    const usersToRepos = new Map<string, Set<string>>();

    let index = 0;
    const worker = async () => {
      for (;;) {
        const i = index++;
        if (i >= projects.length) return;
        const project = projects[i]!;
        const members = (await api.ProjectMembers.all(project.id, { includeInherited: false })) as any[];
        for (const m of members) {
          if (!usersToRepos.has(m.username)) usersToRepos.set(m.username, new Set());
          usersToRepos.get(m.username)!.add(project.pathWithNamespace);
        }
        perRepo.push({ repo: project.pathWithNamespace, memberCount: members.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, projects.length || 1) }, () => worker()));

    const perUser = Array.from(usersToRepos.entries())
      .map(([username, repos]) => ({ username, repoCount: repos.size, repos: Array.from(repos).sort() }))
      .sort((a, b) => b.repoCount - a.repoCount);
    perRepo.sort((a, b) => a.repo.localeCompare(b.repo));

    return NextResponse.json({
      totalRepos: projects.length,
      totalUniqueUsers: usersToRepos.size,
      perRepo,
      perUser,
    });
  } catch (err) {
    return errorResponse(err, "gitlab.access.overview");
  }
}
