import type { Octokit } from "octokit";
import { AccessLevel } from "@gitbeaker/rest";
import { redact } from "@glab2gh/core";
import type { GitlabApi } from "./clients";

export interface ExecTask {
  repoRef: string;
  memberRef: string;
}

export interface ExecResult {
  status: "success" | "invited" | "failed";
  error?: string;
  resultJson?: string;
}

function splitRepoRef(repoRef: string): { owner: string; repo: string } {
  const idx = repoRef.indexOf("/");
  return { owner: repoRef.slice(0, idx), repo: repoRef.slice(idx + 1) };
}

/**
 * GitHub's addCollaborator returns 201 (pending invitation, needs acceptance)
 * when inviting an outside collaborator, or 204 (access granted immediately)
 * for an existing org member/collaborator — callers must surface these
 * differently, so the distinction is preserved in the returned status.
 */
export async function runGithubAccessTask(
  octokit: Octokit,
  action: "add" | "remove",
  role: string | null,
  task: ExecTask,
): Promise<ExecResult> {
  const { owner, repo } = splitRepoRef(task.repoRef);
  const username = task.memberRef;
  try {
    if (action === "remove") {
      await octokit.rest.repos.removeCollaborator({ owner, repo, username });
      return { status: "success" };
    }

    const permission = (role ?? "pull") as "pull" | "triage" | "push" | "maintain" | "admin";
    const res = await octokit.rest.repos.addCollaborator({ owner, repo, username, permission });
    if (res.status === 201) {
      const invitation = res.data as { id?: number; html_url?: string } | undefined;
      return {
        status: "invited",
        resultJson: JSON.stringify({ invitationId: invitation?.id, invitationUrl: invitation?.html_url }),
      };
    }
    return { status: "success" };
  } catch (err) {
    return { status: "failed", error: redact(err instanceof Error ? err.message : String(err)) };
  }
}

/**
 * GitLab's ProjectMembers.add() 409s if the user is already a (direct)
 * member — falling back to edit() covers "bulk-add" runs that mix brand-new
 * members with role changes for existing ones, without a separate pre-check
 * round trip per task.
 */
export async function runGitlabAccessTask(
  api: GitlabApi,
  action: "add" | "remove",
  role: string | null,
  task: ExecTask,
  expiresAt?: string | null,
): Promise<ExecResult> {
  const projectId = task.repoRef;
  const userId = Number(task.memberRef);
  try {
    if (action === "remove") {
      await api.ProjectMembers.remove(projectId, userId);
      return { status: "success" };
    }

    const accessLevel = Number(role ?? AccessLevel.DEVELOPER) as Exclude<
      import("@gitbeaker/core").AccessLevel,
      import("@gitbeaker/core").AccessLevel.ADMIN
    >;
    try {
      await api.ProjectMembers.add(projectId, accessLevel, { userId, expiresAt: expiresAt ?? undefined });
    } catch (err) {
      const alreadyMember = err instanceof Error && /already exists|already a member/i.test(err.message);
      if (!alreadyMember) throw err;
      await api.ProjectMembers.edit(projectId, userId, accessLevel, { expiresAt: expiresAt ?? undefined });
    }
    return { status: "success" };
  } catch (err) {
    return { status: "failed", error: redact(err instanceof Error ? err.message : String(err)) };
  }
}
