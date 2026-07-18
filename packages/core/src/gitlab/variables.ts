import type { GitlabApi } from "./client.js";
import { logger } from "../util/logger.js";

export interface GitlabVariable {
  key: string;
  value: string;
  variableType: "env_var" | "file";
  protected: boolean;
  masked: boolean;
  environmentScope: string; // "*" means all environments
  source: "project" | "group";
}

async function fetchProjectVariables(api: GitlabApi, projectId: number | string): Promise<GitlabVariable[]> {
  try {
    const raw = await api.ProjectVariables.all(projectId);
    return raw.map((v: any) => ({
      key: v.key,
      value: v.value,
      variableType: v.variable_type ?? "env_var",
      protected: Boolean(v.protected),
      masked: Boolean(v.masked),
      environmentScope: v.environment_scope ?? "*",
      source: "project" as const,
    }));
  } catch (err: any) {
    if (err?.cause?.response?.status === 403 || err?.response?.status === 403) {
      logger.warn(
        { projectId },
        "403 fetching project CI/CD variables — token needs Maintainer role on this project; skipping",
      );
      return [];
    }
    throw err;
  }
}

async function fetchGroupVariables(api: GitlabApi, groupId: number | string): Promise<GitlabVariable[]> {
  try {
    const raw = await api.GroupVariables.all(groupId);
    return raw.map((v: any) => ({
      key: v.key,
      value: v.value,
      variableType: v.variable_type ?? "env_var",
      protected: Boolean(v.protected),
      masked: Boolean(v.masked),
      environmentScope: v.environment_scope ?? "*",
      source: "group" as const,
    }));
  } catch (err: any) {
    if (err?.cause?.response?.status === 403 || err?.response?.status === 403) {
      logger.warn({ groupId }, "403 fetching group CI/CD variables — skipping group-level variables");
      return [];
    }
    throw err;
  }
}

/** Walk parent_id chain to collect a group and all of its ancestor groups. */
export async function collectAncestorGroupIds(api: GitlabApi, startGroupId: number | string): Promise<(number | string)[]> {
  const ids: (number | string)[] = [];
  let currentId: number | string | null = startGroupId;
  const seen = new Set<string>();

  while (currentId !== null && !seen.has(String(currentId))) {
    seen.add(String(currentId));
    ids.push(currentId);
    try {
      const group: any = await api.Groups.show(currentId);
      currentId = group.parent_id ?? null;
    } catch {
      break;
    }
  }
  return ids;
}

/**
 * Fetch project variables and (optionally) inherited group variables, then
 * de-duplicate by (key, environmentScope) with project-level values winning
 * over group-level, matching GitLab's own override semantics.
 */
export async function fetchAllVariables(
  api: GitlabApi,
  projectId: number | string,
  groupIds: (number | string)[],
  includeGroupVariables: boolean,
): Promise<GitlabVariable[]> {
  const projectVars = await fetchProjectVariables(api, projectId);

  let groupVars: GitlabVariable[] = [];
  if (includeGroupVariables) {
    for (const gid of groupIds) {
      const vars = await fetchGroupVariables(api, gid);
      groupVars.push(...vars);
    }
  }

  const merged = new Map<string, GitlabVariable>();
  // Group vars first (lowest precedence), then project vars overwrite.
  for (const v of groupVars) merged.set(`${v.key}::${v.environmentScope}`, v);
  for (const v of projectVars) merged.set(`${v.key}::${v.environmentScope}`, v);

  return Array.from(merged.values());
}
