"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { GitlabGroupRef, GitlabProject } from "@glab2gh/core";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import type { RepoMigrationStatus } from "@/lib/types";

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(0)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

interface RepoTableProps {
  group: GitlabGroupRef | null;
  selected: Map<string, GitlabProject>;
  onSelectionChange: (selected: Map<string, GitlabProject>) => void;
  repoStatus: Record<string, RepoMigrationStatus>;
}

function MigrationStatusBadge({ status }: { status: RepoMigrationStatus | undefined }) {
  if (!status) return <span style={{ color: "var(--color-muted)" }}>—</span>;
  const date = new Date(status.updatedAt).toISOString().slice(0, 10);
  if (status.bucket === "done") {
    return (
      <Badge tone="success" title={`Migrated to ${status.targetOwner}/${status.targetName} on ${date}`}>
        migrated
      </Badge>
    );
  }
  return (
    <Badge tone="danger" title={`Last attempt on ${date} did not finish cleanly — safe to re-run`}>
      retry
    </Badge>
  );
}

export function RepoTable({ group, selected, onSelectionChange, repoStatus }: RepoTableProps) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [skipForks, setSkipForks] = useState(false);

  const [projects, setProjects] = useState<GitlabProject[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce free-text search.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset and refetch page 1 whenever the scope (group/search/archived) changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (group) params.set("groupId", String(group.id));
    if (search) params.set("search", search);
    if (includeArchived) params.set("includeArchived", "true");
    params.set("page", "1");

    fetch(`/api/gitlab/projects?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          setProjects([]);
          setTotalPages(null);
        } else {
          setProjects(data.projects);
          setTotalPages(data.totalPages);
          setPage(1);
        }
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [group, search, includeArchived]);

  async function loadMore() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (group) params.set("groupId", String(group.id));
      if (search) params.set("search", search);
      if (includeArchived) params.set("includeArchived", "true");
      params.set("page", String(page + 1));
      const res = await fetch(`/api/gitlab/projects?${params}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setProjects((prev) => [...prev, ...data.projects]);
        setPage(page + 1);
        setTotalPages(data.totalPages);
      }
    } finally {
      setLoading(false);
    }
  }

  const visibleProjects = useMemo(
    () => (skipForks ? projects.filter((p) => !p.forkedFromProject) : projects),
    [projects, skipForks],
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: visibleProjects.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  function toggle(project: GitlabProject) {
    const next = new Map(selected);
    if (next.has(project.pathWithNamespace)) {
      next.delete(project.pathWithNamespace);
    } else {
      next.set(project.pathWithNamespace, project);
    }
    onSelectionChange(next);
  }

  const allLoadedSelected = visibleProjects.length > 0 && visibleProjects.every((p) => selected.has(p.pathWithNamespace));

  function toggleSelectAllLoaded() {
    const next = new Map(selected);
    if (allLoadedSelected) {
      for (const p of visibleProjects) next.delete(p.pathWithNamespace);
    } else {
      for (const p of visibleProjects) next.set(p.pathWithNamespace, p);
    }
    onSelectionChange(next);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-3 pb-3">
        <Input
          placeholder="Search projects…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="max-w-xs"
        />
        <label className="flex items-center gap-1.5 text-sm">
          <Checkbox checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          Include archived
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <Checkbox checked={skipForks} onChange={(e) => setSkipForks(e.target.checked)} />
          Exclude forks
        </label>
        {loading && <Spinner />}
      </div>

      {error && <div className="text-sm text-[var(--color-danger)] pb-2">{error}</div>}

      <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium border-b" style={{ color: "var(--color-muted)" }}>
        <Checkbox checked={allLoadedSelected} onChange={toggleSelectAllLoaded} aria-label="Select all loaded" />
        <div className="flex-1">Project</div>
        <div className="w-20 text-right">Status</div>
        <div className="w-20 text-right">Visibility</div>
        <div className="w-20 text-right">Size</div>
        <div className="w-24 text-right">Last activity</div>
      </div>

      <div ref={parentRef} className="flex-1 overflow-auto min-h-[320px]">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((row) => {
            const p = visibleProjects[row.index]!;
            const isSelected = selected.has(p.pathWithNamespace);
            return (
              <div
                key={p.id}
                className={cn("flex items-center gap-2 px-2 text-sm border-b cursor-pointer", isSelected && "bg-[var(--color-accent)]/10")}
                style={{ position: "absolute", top: 0, left: 0, right: 0, height: row.size, transform: `translateY(${row.start}px)` }}
                onClick={() => toggle(p)}
              >
                <Checkbox checked={isSelected} onChange={() => toggle(p)} onClick={(e) => e.stopPropagation()} />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{p.pathWithNamespace}</div>
                </div>
                <div className="w-20 text-right">
                  <MigrationStatusBadge status={repoStatus[p.pathWithNamespace]} />
                </div>
                <div className="w-20 text-right">
                  <Badge tone={p.visibility === "public" ? "accent" : "neutral"}>{p.visibility}</Badge>
                  {p.archived && (
                    <Badge tone="warning" className="ml-1">
                      archived
                    </Badge>
                  )}
                </div>
                <div className="w-20 text-right" style={{ color: "var(--color-muted)" }}>
                  {formatBytes(p.sizeBytes)}
                </div>
                <div className="w-24 text-right" style={{ color: "var(--color-muted)" }}>
                  {formatDate(p.lastActivityAt)}
                </div>
              </div>
            );
          })}
        </div>
        {!loading && visibleProjects.length === 0 && !error && (
          <div className="text-center text-sm py-8" style={{ color: "var(--color-muted)" }}>
            No projects match.
          </div>
        )}
      </div>

      {totalPages !== null && page < totalPages && (
        <div className="pt-2 text-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
