import type { Octokit } from "octokit";
import type { GitlabProject } from "../gitlab/discover.js";
import type { Config } from "../config.js";

export interface TargetRepoSpec {
  owner: string;
  name: string;
  description: string;
  private: boolean;
  topics: string[];
  hasWiki: boolean;
  hasIssues: boolean;
}

export function resolveVisibility(
  gitlabVisibility: GitlabProject["visibility"],
  policy: Config["target"]["visibility"],
): boolean {
  if (policy === "private") return true;
  if (policy === "public") return false;
  // inherit: GitLab private/internal -> GitHub private, public -> public
  return gitlabVisibility !== "public";
}

export async function listExistingRepoNames(octokit: Octokit, owner: string, ownerType: "User" | "Organization"): Promise<Set<string>> {
  const names = new Set<string>();
  // A "User" owner is always the token's own account here — createRepo's User branch
  // can only ever create under the authenticated user, never someone else's login — so
  // `listForUser` (public-repos-only, even for your own account) would silently miss
  // private repos. `listForAuthenticatedUser` sees them.
  const iterator =
    ownerType === "Organization"
      ? octokit.paginate.iterator(octokit.rest.repos.listForOrg, { org: owner, per_page: 100 })
      : octokit.paginate.iterator(octokit.rest.repos.listForAuthenticatedUser, { affiliation: "owner", per_page: 100 });

  for await (const { data } of iterator) {
    for (const repo of data as Array<{ name: string }>) {
      names.add(repo.name);
    }
  }
  return names;
}

export async function createRepo(
  octokit: Octokit,
  ownerType: "User" | "Organization",
  spec: TargetRepoSpec,
): Promise<{ id: number; fullName: string; htmlUrl: string; defaultBranch: string }> {
  const params = {
    name: spec.name,
    description: spec.description,
    private: spec.private,
    auto_init: false,
    has_wiki: spec.hasWiki,
    has_issues: spec.hasIssues,
  };

  const { data } =
    ownerType === "Organization"
      ? await octokit.rest.repos.createInOrg({ org: spec.owner, ...params })
      : await octokit.rest.repos.createForAuthenticatedUser(params);

  if (spec.topics.length > 0) {
    await octokit.rest.repos.replaceAllTopics({
      owner: spec.owner,
      repo: spec.name,
      names: spec.topics.map((t) => t.toLowerCase().replace(/[^a-z0-9-]/g, "-")).filter(Boolean),
    });
  }

  return {
    id: data.id,
    fullName: data.full_name,
    htmlUrl: data.html_url,
    defaultBranch: data.default_branch ?? "main",
  };
}

export async function setDefaultBranch(octokit: Octokit, owner: string, repo: string, branch: string): Promise<void> {
  await octokit.rest.repos.update({ owner, repo, default_branch: branch });
}

export async function getRepo(octokit: Octokit, owner: string, repo: string) {
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data;
}
