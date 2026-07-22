import { renderNameTemplate, isCaseInsensitiveCollision, suffixedName, resolveVisibility } from "@glab2gh/core";
import type { GitlabProject, RepoPlan } from "@glab2gh/core";
import type { MigrationOptions } from "@/lib/types";

export interface BuildPlansResult {
  plans: RepoPlan[];
  blockingErrors: string[];
}

/**
 * core's computeRepoPlans() has no concept of per-repo overrides (a web-only
 * feature — the CLI's YAML config is uniform across a run), so it can't be
 * reused as-is here. This reimplements the same claim-as-you-go collision
 * algorithm (via the same core primitives) with overrides folded in *before*
 * collision resolution, so the result always matches what the Options page's
 * client-side preview already showed the user.
 */
export function buildRepoPlans(projects: GitlabProject[], options: MigrationOptions, existingNames: Set<string>): BuildPlansResult {
  const claimed = new Set(Array.from(existingNames, (n) => n.toLowerCase()));
  const plans: RepoPlan[] = [];
  const blockingErrors: string[] = [];

  for (const project of projects) {
    const override = options.overrides[project.pathWithNamespace];
    const manuallyNamed = Boolean(override?.targetName?.trim());
    const baseName = manuallyNamed
      ? override!.targetName!.trim()
      : renderNameTemplate(options.nameTemplate, {
          name: project.name,
          pathWithNamespace: project.pathWithNamespace,
          namespaceFullPath: project.namespaceFullPath,
        });

    let targetName = baseName;
    let skip = false;
    let skipReason: string | undefined;
    let syncTarget = false;
    const collidesBase = isCaseInsensitiveCollision(baseName, claimed);

    if (collidesBase && !manuallyNamed) {
      // "sync" only makes sense against a repo that pre-dated this run — colliding with
      // another selected repo claimed earlier in *this* loop has no existing target to
      // sync against, so that case still falls through to suffix.
      const preExisting = isCaseInsensitiveCollision(baseName, existingNames);
      if (options.collision === "sync" && preExisting) {
        syncTarget = true;
      } else if (options.collision === "skip") {
        skip = true;
        skipReason = `target name '${baseName}' collides with an existing repo or another selected repo`;
      } else if (options.collision === "suffix" || options.collision === "sync") {
        targetName = suffixedName(baseName, claimed);
      }
      // "fail": leave targetName === baseName; the still-colliding check below reports it.
    }

    const finalCollides = !skip && !syncTarget && claimed.has(targetName.toLowerCase());
    if (finalCollides) {
      blockingErrors.push(
        `Target name collision: '${targetName}' (from GitLab project '${project.pathWithNamespace}') already exists or was claimed by another selected repo.`,
      );
    }
    if (!skip) claimed.add(targetName.toLowerCase());

    plans.push({
      project,
      sourcePath: project.pathWithNamespace,
      targetOwner: options.targetOwner,
      targetName,
      private: resolveVisibility(project.visibility, override?.visibility ?? options.visibility),
      topics: options.topicsFromGitlabTopics ? project.topics : [],
      skip,
      skipReason,
      collision: finalCollides || syncTarget,
      syncTarget,
    });
  }

  return { plans, blockingErrors };
}
