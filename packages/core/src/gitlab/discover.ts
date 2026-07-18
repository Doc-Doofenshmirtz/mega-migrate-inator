import micromatch from "micromatch";
import type { GitlabApi } from "./client.js";
import type { Config } from "../config.js";
import { logger } from "../util/logger.js";

export interface GitlabProject {
  id: number;
  name: string;
  pathWithNamespace: string;
  namespaceFullPath: string;
  namespaceId: number | null;
  namespaceKind: "group" | "user" | null;
  description: string | null;
  defaultBranch: string | null;
  visibility: "private" | "internal" | "public";
  archived: boolean;
  topics: string[];
  httpUrlToRepo: string;
  forkedFromProject: boolean;
  emptyRepo: boolean;
  hasWiki: boolean;
  hasIssuesEnabled: boolean;
  /** Only populated when the caller requested `statistics: true` (listProjectsPage does; discoverProjects doesn't need it). */
  sizeBytes: number | null;
  lastActivityAt: string | null;
}

export function mapGitlabProject(raw: any): GitlabProject {
  return {
    id: raw.id,
    name: raw.name,
    pathWithNamespace: raw.path_with_namespace,
    namespaceFullPath: raw.namespace?.full_path ?? raw.path_with_namespace.split("/").slice(0, -1).join("/"),
    namespaceId: raw.namespace?.id ?? null,
    namespaceKind: raw.namespace?.kind === "group" ? "group" : raw.namespace?.kind === "user" ? "user" : null,
    description: raw.description ?? null,
    defaultBranch: raw.default_branch ?? null,
    visibility: raw.visibility,
    archived: Boolean(raw.archived),
    topics: raw.topics ?? raw.tag_list ?? [],
    httpUrlToRepo: raw.http_url_to_repo,
    forkedFromProject: Boolean(raw.forked_from_project),
    emptyRepo: raw.empty_repo ?? false,
    hasWiki: raw.wiki_enabled ?? true,
    hasIssuesEnabled: raw.issues_enabled ?? true,
    sizeBytes: raw.statistics?.repository_size ?? null,
    lastActivityAt: raw.last_activity_at ?? null,
  };
}

export async function discoverProjects(api: GitlabApi, cfg: Config): Promise<GitlabProject[]> {
  let raw: any[] = [];

  if (cfg.source.mode === "group") {
    const group = cfg.source.group!;
    raw = await api.Groups.allProjects(group, {
      includeSubgroups: true,
      perPage: 100,
      archived: cfg.source.include_archived ? undefined : false,
    });
  } else if (cfg.source.mode === "list") {
    raw = await Promise.all(
      cfg.source.projects.map((p) => api.Projects.show(p)),
    );
  } else {
    raw = await api.Projects.all({ membership: true, perPage: 100 });
  }

  let projects = raw.map(mapGitlabProject);

  if (!cfg.source.include_archived) {
    projects = projects.filter((p) => !p.archived);
  }
  if (cfg.source.skip_forks) {
    projects = projects.filter((p) => !p.forkedFromProject);
  }
  if (cfg.source.exclude.length > 0) {
    const before = projects.length;
    projects = projects.filter((p) => !micromatch.isMatch(p.pathWithNamespace, cfg.source.exclude));
    logger.debug({ excluded: before - projects.length }, "applied exclude patterns");
  }

  return projects;
}

export interface GitlabGroupRef {
  id: number;
  name: string;
  fullPath: string;
  parentId: number | null;
}

function mapGroup(raw: any): GitlabGroupRef {
  return { id: raw.id, name: raw.name, fullPath: raw.full_path, parentId: raw.parent_id ?? null };
}

/** Top-level groups the token can see — the root of the lazy-loaded group tree in /select. */
export async function listTopLevelGroups(api: GitlabApi): Promise<GitlabGroupRef[]> {
  const raw = await api.Groups.all({ topLevelOnly: true, perPage: 100 });
  return (raw as any[]).map(mapGroup);
}

/** Direct subgroups of `parentId` — fetched lazily as the tree is expanded. */
export async function listSubgroups(api: GitlabApi, parentId: number | string): Promise<GitlabGroupRef[]> {
  const raw = await api.Groups.allSubgroups(parentId, { perPage: 100 });
  return (raw as any[]).map(mapGroup);
}

export interface ListProjectsPageOptions {
  /** Restrict to a group (and its subgroups); omit to browse everything the token is a member of. */
  groupId?: number | string;
  search?: string;
  page?: number;
  perPage?: number;
  includeArchived?: boolean;
}

export interface ProjectPage {
  projects: GitlabProject[];
  page: number;
  totalPages: number | null;
}

/**
 * Paginated/searchable project listing for the /select picker — distinct from
 * discoverProjects(), which eagerly fetches everything for an actual run's plan.
 */
export async function listProjectsPage(api: GitlabApi, opts: ListProjectsPageOptions = {}): Promise<ProjectPage> {
  const page = opts.page ?? 1;
  const perPage = opts.perPage ?? 50;
  const common = {
    search: opts.search || undefined,
    page,
    perPage,
    archived: opts.includeArchived ? undefined : false,
    statistics: true,
    showExpanded: true as const,
  };

  const result: any = opts.groupId
    ? await api.Groups.allProjects(opts.groupId, { ...common, includeSubgroups: true })
    : await api.Projects.all({ ...common, membership: true });

  const raw: any[] = Array.isArray(result) ? result : result.data;
  const totalPages: number | null = Array.isArray(result)
    ? null
    : (result.paginationInfo?.totalPages ?? null);

  return { projects: raw.map(mapGitlabProject), page, totalPages };
}
