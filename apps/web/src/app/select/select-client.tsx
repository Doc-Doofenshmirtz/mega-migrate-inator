"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { GitlabGroupRef, GitlabProject } from "@glab2gh/core";
import { GroupTree } from "./group-tree";
import { RepoTable } from "./repo-table";
import { Button } from "@/components/ui/button";
import { getSelectedRepos, setSelectedRepos } from "@/lib/wizardDraft";
import type { RepoMigrationStatus } from "@/lib/types";

function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(0)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

export function SelectClient() {
  const [group, setGroup] = useState<GitlabGroupRef | null>(null);
  const [selected, setSelected] = useState<Map<string, GitlabProject>>(new Map());
  const [hydrated, setHydrated] = useState(false);
  const [repoStatus, setRepoStatus] = useState<Record<string, RepoMigrationStatus>>({});

  useEffect(() => {
    const initial = getSelectedRepos();
    setSelected(new Map(initial.map((p) => [p.pathWithNamespace, p])));
    setHydrated(true);
  }, []);

  useEffect(() => {
    fetch("/api/repos/status")
      .then((r) => r.json())
      .then((data) => setRepoStatus(data.statuses ?? {}))
      .catch(() => {}); // best-effort — the picker still works with no status info
  }, []);

  useEffect(() => {
    if (!hydrated) return; // don't clobber sessionStorage with an empty map before hydration runs
    setSelectedRepos(Array.from(selected.values()));
  }, [selected, hydrated]);

  const totalSize = Array.from(selected.values()).reduce((sum, p) => sum + (p.sizeBytes ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Select repositories</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          Browse by group or search across everything the token can see, then check the repos to migrate.
        </p>
      </div>

      <div className="grid grid-cols-[220px_1fr] gap-4 rounded-lg border" style={{ minHeight: 480 }}>
        <div className="border-r p-2 overflow-auto">
          <GroupTree selectedGroupId={group?.id ?? null} onSelectGroup={setGroup} />
        </div>
        <div className="p-3 flex flex-col">
          <RepoTable group={group} selected={selected} onSelectionChange={setSelected} repoStatus={repoStatus} />
        </div>
      </div>

      <div className="sticky bottom-0 flex items-center justify-between rounded-lg border bg-[var(--color-surface)] px-4 py-3">
        <div className="text-sm">
          <strong>{selected.size}</strong> repositor{selected.size === 1 ? "y" : "ies"} selected
          {selected.size > 0 && (
            <span style={{ color: "var(--color-muted)" }}> · ~{formatBytes(totalSize)} total (known sizes only)</span>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/setup">
            <Button variant="ghost">← Back</Button>
          </Link>
          {selected.size > 0 ? (
            <Link href="/options">
              <Button>Continue to options →</Button>
            </Link>
          ) : (
            <Button disabled>Continue to options →</Button>
          )}
        </div>
      </div>
    </div>
  );
}
