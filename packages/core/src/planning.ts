import type { Config } from "./config.js";
import type { GitlabProject } from "./gitlab/discover.js";
import { renderNameTemplate, isCaseInsensitiveCollision, suffixedName } from "./util/naming.js";
import { resolveVisibility } from "./github/repos.js";

export interface RepoPlan {
  project: GitlabProject;
  sourcePath: string;
  targetOwner: string;
  targetName: string;
  private: boolean;
  topics: string[];
  skip: boolean;
  skipReason?: string;
  collision: boolean;
}

export class CollisionError extends Error {}

/**
 * Compute target names for every discovered project up front, applying the
 * collision policy against both existing GitHub repos and names already
 * claimed earlier in this same run (two GitLab projects can flatten to the
 * same GitHub name).
 */
export function computeRepoPlans(
  projects: GitlabProject[],
  cfg: Config,
  existingGithubNames: Set<string>,
): RepoPlan[] {
  const claimedThisRun = new Set<string>(existingGithubNames);
  const plans: RepoPlan[] = [];

  for (const project of projects) {
    const baseName = renderNameTemplate(cfg.target.name_template, {
      name: project.name,
      pathWithNamespace: project.pathWithNamespace,
      namespaceFullPath: project.namespaceFullPath,
    } as any);

    let targetName = baseName;
    let skip = false;
    let skipReason: string | undefined;
    const collision = isCaseInsensitiveCollision(baseName, claimedThisRun);

    if (collision) {
      switch (cfg.target.collision) {
        case "fail":
          throw new CollisionError(
            `Target name collision: '${baseName}' (from GitLab project '${project.pathWithNamespace}') ` +
              `already exists or was already claimed by another project in this run. ` +
              `Set target.collision to 'skip' or 'suffix', or adjust target.name_template.`,
          );
        case "skip":
          skip = true;
          skipReason = `target name '${baseName}' collides with an existing repo`;
          break;
        case "suffix":
          targetName = suffixedName(baseName, claimedThisRun);
          break;
      }
    }

    if (!skip) claimedThisRun.add(targetName);

    plans.push({
      project,
      sourcePath: project.pathWithNamespace,
      targetOwner: cfg.target.owner,
      targetName,
      private: resolveVisibility(project.visibility, cfg.target.visibility),
      topics: cfg.target.topics_from_gitlab_topics ? project.topics : [],
      skip,
      skipReason,
      collision,
    });
  }

  return plans;
}
