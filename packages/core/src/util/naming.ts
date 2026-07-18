export interface GitlabProjectRef {
  name: string; // project name, e.g. "proj-a"
  pathWithNamespace: string; // e.g. "my-group/sub/proj-a"
  namespaceFullPath: string; // e.g. "my-group/sub"
}

/** GitHub repo names may only contain alphanumerics, `.`, `_`, `-`. */
const INVALID_REPO_CHARS = /[^A-Za-z0-9._-]+/g;

export function sanitizeRepoName(input: string): string {
  let out = input
    .trim()
    .replace(/\s+/g, "-")
    .replace(INVALID_REPO_CHARS, "-")
    .replace(/-+/g, "-")
    // Also strips the reserved names "." and ".." down to "", which then
    // falls through to the "repo" fallback below.
    .replace(/^[.-]+|[.-]+$/g, "");
  if (out.length === 0) out = "repo";
  return out;
}

/** Flatten a GitLab namespace path ("group/sub") into a dash-joined token. */
export function flattenGroupPath(groupPath: string): string {
  return groupPath
    .split("/")
    .filter(Boolean)
    .join("-");
}

export function renderNameTemplate(template: string, project: GitlabProjectRef): string {
  const groupPath = flattenGroupPath(project.namespaceFullPath);
  const namespace = project.namespaceFullPath.split("/").filter(Boolean).pop() ?? project.namespaceFullPath;
  const rendered = template
    .replaceAll("{name}", project.name)
    .replaceAll("{group_path}", groupPath)
    .replaceAll("{namespace}", namespace);
  return sanitizeRepoName(rendered);
}

/**
 * GitHub secret/variable name rules: [A-Z0-9_], cannot start with a digit,
 * and (for Actions secrets) cannot start with the reserved prefix GITHUB_.
 * Returns the sanitized name plus whether it differs from the input, so
 * callers can record a rename mapping in the report.
 */
export function sanitizeSecretName(input: string): { name: string; renamed: boolean } {
  let out = input.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  if (/^[0-9]/.test(out)) out = `VAR_${out}`;
  if (out.startsWith("GITHUB_")) out = `GL_${out}`;
  if (out.length === 0) out = "VAR_UNNAMED";
  return { name: out, renamed: out !== input };
}

export function isCaseInsensitiveCollision(name: string, existing: Iterable<string>): boolean {
  const lower = name.toLowerCase();
  for (const e of existing) {
    if (e.toLowerCase() === lower) return true;
  }
  return false;
}

export function suffixedName(name: string, existing: Iterable<string>): string {
  const set = new Set(Array.from(existing, (e) => e.toLowerCase()));
  if (!set.has(name.toLowerCase())) return name;
  let candidate = `${name}-migrated`;
  let n = 2;
  while (set.has(candidate.toLowerCase())) {
    candidate = `${name}-migrated-${n}`;
    n++;
  }
  return candidate;
}

/** Glob-ish exclude match against full GitLab project paths (supports `*`). */
export function matchesAnyGlob(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}
