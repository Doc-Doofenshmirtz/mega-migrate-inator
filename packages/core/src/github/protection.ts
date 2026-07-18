import type { Octokit } from "octokit";
import type { GitlabApi } from "../gitlab/client.js";
import { logger } from "../util/logger.js";

export interface ProtectionMappingResult {
  pattern: string;
  applied: boolean;
  notes: string[];
}

/**
 * Best-effort mapping of GitLab protected branches to GitHub classic branch
 * protection. GitLab's Maintainer/Developer access-level model has no exact
 * GitHub equivalent, so we deliberately leave enforce_admins=false and record
 * that in the notes rather than guessing.
 */
export async function applyBranchProtection(
  gitlabApi: GitlabApi,
  githubOctokit: Octokit,
  projectId: number | string,
  owner: string,
  repo: string,
): Promise<ProtectionMappingResult[]> {
  const results: ProtectionMappingResult[] = [];

  let protectedBranches: any[];
  try {
    protectedBranches = await gitlabApi.ProtectedBranches.all(projectId);
  } catch (err) {
    logger.warn({ projectId }, "could not fetch protected branches from GitLab; skipping branch protection");
    return results;
  }

  for (const pb of protectedBranches) {
    const pattern: string = pb.name;
    const notes: string[] = [];
    const allowForcePush = Boolean(pb.allow_force_push);

    notes.push(
      "GitLab Maintainer/Developer access-level distinctions have no GitHub equivalent; " +
        "enforce_admins set to false — review manually if admin enforcement is required.",
    );

    try {
      await githubOctokit.rest.repos.updateBranchProtection({
        owner,
        repo,
        branch: pattern,
        required_status_checks: null,
        enforce_admins: false,
        required_pull_request_reviews: null,
        restrictions: null,
        allow_force_pushes: allowForcePush,
        allow_deletions: false,
      });
      results.push({ pattern, applied: true, notes });
    } catch (err: any) {
      const msg = err?.status === 404
        ? `branch '${pattern}' does not exist on target (pattern may be a wildcard not yet matched, or branch missing)`
        : `GitHub API error: ${err?.message ?? err}`;
      notes.push(`Failed to apply protection: ${msg}`);
      results.push({ pattern, applied: false, notes });
      logger.warn({ owner, repo, pattern }, `branch protection failed: ${msg}`);
    }
  }

  return results;
}
