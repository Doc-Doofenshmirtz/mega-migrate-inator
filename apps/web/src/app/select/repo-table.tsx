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
  const [selectingAll, setSelectingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce free-text search.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  function buildParams(pageNum: number): URLSearchParams {
    const params = new URLSearchParams();
    if (group) params.set("groupId", String(group.id));
    if (search) params.set("search", search);
    if (includeArchived) params.set("includeArchived", "true");
    params.set("page", String(pageNum));
    return params;
  }

  async function fetchProjectsPage(pageNum: number): Promise<{ projects: GitlabProject[]; totalPages: number | null }> {
    const res = await fetch(`/api/gitlab/projects?${buildParams(pageNum)}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return { projects: data.projects, totalPages: data.totalPages };
  }

  // Reset and refetch page 1 whenever the scope (group/search/archived) changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchProjectsPage(1)
      .then(({ projects: fetched, totalPages: tp }) => {
        if (cancelled) return;
        setProjects(fetched);
        setTotalPages(tp);
        setPage(1);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, search, includeArchived]);

  async function loadMore() {
    setLoading(true);
    try {
      const { projects: fetched, totalPages: tp } = await fetchProjectsPage(page + 1);
      setProjects((prev) => [...prev, ...fetched]);
      setPage(page + 1);
      setTotalPages(tp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Fetch every remaining page for the current filter and select it all, so
  // "select all" covers repos the user never manually paged through instead
  // of only whatever happens to be loaded/rendered so far.
  async function selectAllMatching() {
    setSelectingAll(true);
    try {
      let currentPage = page;
      let all = projects;
      let tp = totalPages;
      while (tp !== null && currentPage < tp) {
        const { projects: fetched, totalPages: newTp } = await fetchProjectsPage(currentPage + 1);
        all = [...all, ...fetched];
        currentPage += 1;
        tp = newTp;
      }
      setProjects(all);
      setPage(currentPage);
      setTotalPages(tp);

      const toSelect = skipForks ? all.filter((p) => !p.forkedFromProject) : all;
      const next = new Map(selected);
      for (const p of toSelect) next.set(p.pathWithNamespace, p);
      onSelectionChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSelectingAll(false);
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
  const hasMorePages = totalPages !== null && page < totalPages;

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
        <Checkbox
          checked={allLoadedSelected}
          onChange={toggleSelectAllLoaded}
          disabled={selectingAll}
          aria-label="Select all loaded"
        />
        <div className="flex-1">Project</div>
        <div className="w-20 text-right">Status</div>
        <div className="w-20 text-right">Visibility</div>
        <div className="w-20 text-right">Size</div>
        <div className="w-24 text-right">Last activity</div>
      </div>

      {allLoadedSelected && hasMorePages && (
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs border-b bg-[var(--color-accent)]/5">
          {selectingAll ? (
            <>
              <Spinner /> Selecting all matching repos…
            </>
          ) : (
            <>
              <span style={{ color: "var(--color-muted)" }}>
                All {visibleProjects.length} loaded repos are selected.
              </span>
              <button type="button" className="underline font-medium" onClick={selectAllMatching}>
                Select all repos matching this filter
              </button>
            </>
          )}
        </div>
      )}

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
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loading || selectingAll}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
