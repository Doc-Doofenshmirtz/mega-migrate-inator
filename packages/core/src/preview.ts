import type { GitlabApi } from "./gitlab/client.js";
import type { RepoPlan } from "./planning.js";
import { fetchAllVariables, collectAncestorGroupIds } from "./gitlab/variables.js";
import { logger } from "./util/logger.js";

export interface PlanPreviewRow {
  sourcePath: string;
  targetFullName: string;
  visibility: string;
  sizeBytes: number;
  lfsLikely: boolean;
  ciVariableCount: number;
  skip: boolean;
  skipReason?: string;
}

async function detectLfsViaApi(api: GitlabApi, projectId: number | string, ref: string | null): Promise<boolean> {
  if (!ref) return false;
  try {
    const file: any = await api.RepositoryFiles.show(projectId, ".gitattributes", ref);
    const content = Buffer.from(file.content, file.encoding ?? "base64").toString("utf-8");
    return /filter=lfs/.test(content);
  } catch {
    return false;
  }
}

/**
 * Build a read-only preview of what a migration would do, using only
 * GitLab API metadata (no git clone). Used by `plan` and `migrate --dry-run`.
 */
export async function buildPlanPreview(
  api: GitlabApi,
  plans: RepoPlan[],
  includeGroupVariables: boolean,
): Promise<PlanPreviewRow[]> {
  const rows: PlanPreviewRow[] = [];

  for (const plan of plans) {
    if (plan.skip) {
      rows.push({
        sourcePath: plan.sourcePath,
        targetFullName: `${plan.targetOwner}/${plan.targetName}`,
        visibility: plan.private ? "private" : "public",
        sizeBytes: 0,
        lfsLikely: false,
        ciVariableCount: 0,
        skip: true,
        skipReason: plan.skipReason,
      });
      continue;
    }

    let sizeBytes = 0;
    try {
      const details: any = await api.Projects.show(plan.project.id, { statistics: true } as any);
      sizeBytes = details.statistics?.repository_size ?? 0;
    } catch (err) {
      logger.debug({ project: plan.sourcePath }, "could not fetch project statistics for preview");
    }

    const lfsLikely = await detectLfsViaApi(api, plan.project.id, plan.project.defaultBranch);

    let ciVariableCount = 0;
    try {
      const groupIds =
        plan.project.namespaceKind === "group" && plan.project.namespaceId !== null
          ? await collectAncestorGroupIds(api, plan.project.namespaceId)
          : [];
      const vars = await fetchAllVariables(api, plan.project.id, groupIds, includeGroupVariables);
      ciVariableCount = vars.length;
    } catch {
      // fetchAllVariables already swallows 403s; anything else we just show as 0
    }

    rows.push({
      sourcePath: plan.sourcePath,
      targetFullName: `${plan.targetOwner}/${plan.targetName}`,
      visibility: plan.private ? "private" : "public",
      sizeBytes,
      lfsLikely,
      ciVariableCount,
      skip: false,
    });
  }

  return rows;
}

export function renderPlanTable(rows: PlanPreviewRow[]): string {
  const lines: string[] = [];
  const header = ["Source", "Target", "Visibility", "Size", "LFS", "CI Vars", "Note"];
  lines.push(header.join(" | "));
  lines.push(header.map(() => "---").join(" | "));
  for (const r of rows) {
    const size = r.sizeBytes > 0 ? `${(r.sizeBytes / 1e6).toFixed(1)} MB` : "?";
    const note = r.skip ? `SKIP: ${r.skipReason}` : "";
    lines.push(
      [r.sourcePath, r.targetFullName, r.visibility, size, r.lfsLikely ? "yes" : "no", String(r.ciVariableCount), note].join(
        " | ",
      ),
    );
  }
  return lines.join("\n");
}
