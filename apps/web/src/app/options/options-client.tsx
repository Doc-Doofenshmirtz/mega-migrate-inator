"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { GitlabProject } from "@glab2gh/core";
import { renderNameTemplate, isCaseInsensitiveCollision, suffixedName } from "@glab2gh/core/util/naming.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { getSelectedRepos, getDraftOptions, setDraftOptions } from "@/lib/wizardDraft";
import { DEFAULT_MIGRATION_OPTIONS, type MigrationOptions, type RepoOverride } from "@/lib/types";

interface GithubOwner {
  login: string;
  type: "user" | "org";
  canCreateRepos: boolean;
  reason?: string;
}

interface PreviewRow {
  repo: GitlabProject;
  targetName: string;
  visibility: "private" | "public" | "inherit";
  collision: boolean;
  skip: boolean;
  manuallyNamed: boolean;
}

function computePreviewRows(
  repos: GitlabProject[],
  template: string,
  existingNames: string[],
  collisionPolicy: MigrationOptions["collision"],
  defaultVisibility: MigrationOptions["visibility"],
  overrides: Record<string, RepoOverride>,
): PreviewRow[] {
  const claimed = new Set(existingNames.map((n) => n.toLowerCase()));
  const rows: PreviewRow[] = [];

  for (const repo of repos) {
    const override = overrides[repo.pathWithNamespace];
    const manuallyNamed = Boolean(override?.targetName?.trim());
    const baseName = manuallyNamed
      ? override!.targetName!.trim()
      : renderNameTemplate(template, {
          name: repo.name,
          pathWithNamespace: repo.pathWithNamespace,
          namespaceFullPath: repo.namespaceFullPath,
        });

    let targetName = baseName;
    let skip = false;

    if (!manuallyNamed && isCaseInsensitiveCollision(baseName, claimed)) {
      if (collisionPolicy === "skip") {
        skip = true;
      } else if (collisionPolicy === "suffix") {
        targetName = suffixedName(baseName, claimed);
      }
      // "fail": leave targetName = baseName; the still-colliding check below flags it.
    }

    const collision = !skip && claimed.has(targetName.toLowerCase());
    if (!skip) claimed.add(targetName.toLowerCase());

    rows.push({
      repo,
      targetName,
      visibility: override?.visibility ?? defaultVisibility,
      collision,
      skip,
      manuallyNamed,
    });
  }

  return rows;
}

export function OptionsClient() {
  const router = useRouter();
  const [repos] = useState<GitlabProject[]>(() => getSelectedRepos());
  const [hydrated, setHydrated] = useState(false);

  const [options, setOptions] = useState<MigrationOptions>(DEFAULT_MIGRATION_OPTIONS);
  const [owners, setOwners] = useState<GithubOwner[] | null>(null);
  const [ownersError, setOwnersError] = useState<string | null>(null);
  const [existingNames, setExistingNames] = useState<string[]>([]);

  useEffect(() => {
    if (repos.length === 0) {
      router.replace("/select");
      return;
    }
    setHydrated(true);

    (async () => {
      const [ownersRes, defaultsRes] = await Promise.all([
        fetch("/api/github/owners").then((r) => r.json()),
        fetch("/api/options/defaults").then((r) => r.json()),
      ]);

      if (ownersRes.error) {
        setOwnersError(ownersRes.error);
      } else {
        setOwners(ownersRes.owners);
      }

      const draft = getDraftOptions<Partial<MigrationOptions>>();
      const remembered = defaultsRes.defaults as Partial<MigrationOptions> | null;
      const firstOwner = ownersRes.owners?.[0]?.login ?? "";
      setOptions((prev) => ({
        ...prev,
        ...(remembered ?? {}),
        ...(draft ?? {}),
        targetOwner: draft?.targetOwner || remembered?.targetOwner || firstOwner,
        overrides: draft?.overrides ?? remembered?.overrides ?? {},
      }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setDraftOptions(options as unknown as Record<string, unknown>);
  }, [options, hydrated]);

  useEffect(() => {
    if (!options.targetOwner) return;
    fetch(`/api/github/existing-repos?owner=${encodeURIComponent(options.targetOwner)}`)
      .then((r) => r.json())
      .then((d) => setExistingNames(d.names ?? []))
      .catch(() => setExistingNames([]));
  }, [options.targetOwner]);

  const previewRows = useMemo(
    () => computePreviewRows(repos, options.nameTemplate, existingNames, options.collision, options.visibility, options.overrides),
    [repos, options.nameTemplate, existingNames, options.collision, options.visibility, options.overrides],
  );

  const hasBlockingCollisions = previewRows.some((r) => r.collision);

  function updateOverride(sourcePath: string, patch: Partial<RepoOverride>) {
    setOptions((prev) => {
      const nextOverrides = { ...prev.overrides };
      const merged = { ...nextOverrides[sourcePath], ...patch };
      const isEmpty = !merged.targetName?.trim() && (!merged.visibility || merged.visibility === prev.visibility);
      if (isEmpty) {
        delete nextOverrides[sourcePath];
      } else {
        nextOverrides[sourcePath] = merged;
      }
      return { ...prev, overrides: nextOverrides };
    });
  }

  async function goToPlan() {
    await fetch("/api/options/defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    router.push("/plan");
  }

  if (!hydrated) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Options</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          {repos.length} repositor{repos.length === 1 ? "y" : "ies"} selected. These settings become the default for
          next time.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Target</CardTitle>
            <CardDescription>Where repositories are created on GitHub.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="owner">Owner</Label>
              {ownersError ? (
                <div className="text-sm text-[var(--color-danger)]">{ownersError}</div>
              ) : owners === null ? (
                <Spinner />
              ) : (
                <Select
                  id="owner"
                  value={options.targetOwner}
                  onChange={(e) => setOptions((prev) => ({ ...prev, targetOwner: e.target.value }))}
                >
                  {owners.map((o) => (
                    <option key={o.login} value={o.login} disabled={!o.canCreateRepos} title={o.reason}>
                      {o.login} {o.type === "org" ? "(org)" : "(personal)"}
                      {!o.canCreateRepos ? " — cannot create repos" : ""}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <div>
              <Label>Visibility</Label>
              <div className="flex gap-4 text-sm">
                {(["private", "public", "inherit"] as const).map((v) => (
                  <label key={v} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="visibility"
                      checked={options.visibility === v}
                      onChange={() => setOptions((prev) => ({ ...prev, visibility: v }))}
                    />
                    {v === "inherit" ? "Match source" : v}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between">
              <span className="text-sm">Copy GitLab topics to GitHub</span>
              <Switch
                checked={options.topicsFromGitlabTopics}
                onCheckedChange={(v) => setOptions((prev) => ({ ...prev, topicsFromGitlabTopics: v }))}
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Naming</CardTitle>
            <CardDescription>Tokens: {"{name}"} {"{group_path}"} {"{namespace}"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="template">Name template</Label>
              <Input
                id="template"
                value={options.nameTemplate}
                onChange={(e) => setOptions((prev) => ({ ...prev, nameTemplate: e.target.value }))}
              />
            </div>
            <div>
              <Label>On name collision</Label>
              <div className="flex gap-4 text-sm">
                {(["fail", "skip", "suffix"] as const).map((c) => (
                  <label key={c} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="collision"
                      checked={options.collision === c}
                      onChange={() => setOptions((prev) => ({ ...prev, collision: c }))}
                    />
                    {c}
                  </label>
                ))}
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                fail: block the whole plan · skip: leave that repo out · suffix: append -migrated
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CI/CD</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center justify-between">
              <span className="text-sm">Migrate CI/CD variables</span>
              <Switch checked={options.ciVariables} onCheckedChange={(v) => setOptions((prev) => ({ ...prev, ciVariables: v }))} />
            </label>
            {options.ciVariables && (
              <>
                <div>
                  <Label>Migrate as</Label>
                  <div className="flex gap-4 text-sm">
                    {(["secrets", "variables", "auto"] as const).map((m) => (
                      <label key={m} className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="ciVariablesAs"
                          checked={options.ciVariablesAs === m}
                          onChange={() => setOptions((prev) => ({ ...prev, ciVariablesAs: m }))}
                        />
                        {m}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                    auto: masked/protected GitLab variables become GitHub secrets, everything else becomes a plain variable
                  </p>
                </div>
                <label className="flex items-center justify-between">
                  <span className="text-sm">Include group-level variables</span>
                  <Switch checked={options.groupVariables} onCheckedChange={(v) => setOptions((prev) => ({ ...prev, groupVariables: v }))} />
                </label>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Repository content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Git LFS</Label>
              <div className="flex gap-4 text-sm">
                {(["auto", "on", "off"] as const).map((l) => (
                  <label key={l} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="lfs"
                      checked={options.lfs === l}
                      onChange={() => setOptions((prev) => ({ ...prev, lfs: l }))}
                    />
                    {l}
                  </label>
                ))}
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                auto: migrate LFS objects only for repos that use them
              </p>
            </div>
            <div>
              <Label>Files over 100 MB</Label>
              <div className="flex gap-4 text-sm">
                {(["warn", "auto_lfs"] as const).map((l) => (
                  <label key={l} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="largeFiles"
                      checked={options.largeFiles === l}
                      onChange={() => setOptions((prev) => ({ ...prev, largeFiles: l }))}
                    />
                    {l === "auto_lfs" ? "auto-convert to LFS" : "warn only"}
                  </label>
                ))}
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                GitHub hard-rejects files over 100 MB. auto-convert to LFS rewrites just the local mirror copy
                (the GitLab source is never touched) before pushing to GitHub, so the push doesn&apos;t fail.
              </p>
            </div>
            <label className="flex items-center justify-between">
              <span className="text-sm">Apply branch protection (best-effort mapping from GitLab)</span>
              <Switch checked={options.branchProtection} onCheckedChange={(v) => setOptions((prev) => ({ ...prev, branchProtection: v }))} />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm">Archive the GitLab project after a successful migration</span>
              <Switch checked={options.archiveSource} onCheckedChange={(v) => setOptions((prev) => ({ ...prev, archiveSource: v }))} />
            </label>
            <div>
              <Label htmlFor="gl-desc">Set GitLab description after migration (optional)</Label>
              <Input
                id="gl-desc"
                placeholder="Migrated to {github_url}"
                value={options.setGitlabDescription}
                onChange={(e) => setOptions((prev) => ({ ...prev, setGitlabDescription: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="concurrency">Concurrency</Label>
              <Input
                id="concurrency"
                type="number"
                min={1}
                max={20}
                value={options.concurrency}
                onChange={(e) => setOptions((prev) => ({ ...prev, concurrency: Number(e.target.value) || 1 }))}
                className="max-w-[100px]"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preview &amp; per-repo overrides</CardTitle>
          <CardDescription>
            {hasBlockingCollisions
              ? "Some target names still collide — fix them below or change the collision policy."
              : "Target names computed from the template above. Click a name to override it for just that repo."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--color-surface)]">
                <tr className="text-left border-b" style={{ color: "var(--color-muted)" }}>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Target name</th>
                  <th className="px-3 py-2 font-medium">Visibility</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.repo.pathWithNamespace} className="border-b">
                    <td className="px-3 py-2 truncate max-w-[220px]" title={row.repo.pathWithNamespace}>
                      {row.repo.pathWithNamespace}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={row.targetName}
                        onChange={(e) => updateOverride(row.repo.pathWithNamespace, { targetName: e.target.value })}
                        className={cnCollision(row.collision)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={options.overrides[row.repo.pathWithNamespace]?.visibility ?? ""}
                        onChange={(e) =>
                          updateOverride(row.repo.pathWithNamespace, {
                            visibility: (e.target.value || undefined) as RepoOverride["visibility"],
                          })
                        }
                      >
                        <option value="">Default ({options.visibility})</option>
                        <option value="private">private</option>
                        <option value="public">public</option>
                        <option value="inherit">match source</option>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      {row.skip && <Badge tone="warning">skipped</Badge>}
                      {row.collision && <Badge tone="danger">name collision</Badge>}
                      {!row.skip && !row.collision && <Badge tone="success">ok</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 flex items-center justify-between rounded-lg border bg-[var(--color-surface)] px-4 py-3">
        <div className="text-sm" style={{ color: "var(--color-muted)" }}>
          {hasBlockingCollisions ? "Resolve name collisions to continue." : `Ready — ${repos.length} repo(s), owner ${options.targetOwner || "—"}.`}
        </div>
        <div className="flex gap-2">
          <Link href="/select">
            <Button variant="ghost">← Back</Button>
          </Link>
          <Button onClick={goToPlan} disabled={hasBlockingCollisions || !options.targetOwner}>
            Continue to plan →
          </Button>
        </div>
      </div>
    </div>
  );
}

function cnCollision(collision: boolean): string {
  return collision ? "border-[var(--color-danger)] ring-1 ring-[var(--color-danger)]" : "";
}
