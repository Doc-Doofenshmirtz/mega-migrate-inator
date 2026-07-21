"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import type { GithubRepoRef } from "@/lib/types";
import { RepoDetailDialog } from "./repo-detail-dialog";

interface RepoTableProps {
  owner: string;
  selected: Map<string, GithubRepoRef>;
  onSelectionChange: (selected: Map<string, GithubRepoRef>) => void;
}

/**
 * GitHub analog of /select's repo-table — same Map-selection/virtualizer
 * pattern, but adapted to GitHub's `hasMore`-boolean pagination (no cheap
 * total-page-count like GitLab's listProjectsPage), so search filters what's
 * already loaded rather than re-querying the server.
 */
export function RepoTable({ owner, selected, onSelectionChange }: RepoTableProps) {
  const [search, setSearch] = useState("");
  const [repos, setRepos] = useState<GithubRepoRef[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailRepo, setDetailRepo] = useState<GithubRepoRef | null>(null);

  async function fetchPage(pageNum: number): Promise<{ repos: GithubRepoRef[]; hasMore: boolean }> {
    const res = await fetch(`/api/github/repos?owner=${encodeURIComponent(owner)}&page=${pageNum}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return { repos: data.repos, hasMore: data.hasMore };
  }

  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSearch("");

    fetchPage(1)
      .then(({ repos: fetched, hasMore: more }) => {
        if (cancelled) return;
        setRepos(fetched);
        setHasMore(more);
        setPage(1);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  async function loadMore() {
    setLoading(true);
    try {
      const { repos: fetched, hasMore: more } = await fetchPage(page + 1);
      setRepos((prev) => [...prev, ...fetched]);
      setPage(page + 1);
      setHasMore(more);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Keep fetching remaining pages until GitHub reports a partial page, then select everything.
  async function selectAllRemaining() {
    setSelectingAll(true);
    try {
      let currentPage = page;
      let all = repos;
      let more = hasMore;
      while (more) {
        const { repos: fetched, hasMore: newMore } = await fetchPage(currentPage + 1);
        all = [...all, ...fetched];
        currentPage += 1;
        more = newMore;
      }
      setRepos(all);
      setPage(currentPage);
      setHasMore(false);

      const next = new Map(selected);
      for (const r of all) next.set(r.fullName, r);
      onSelectionChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSelectingAll(false);
    }
  }

  const visibleRepos = useMemo(() => {
    if (!search) return repos;
    const q = search.toLowerCase();
    return repos.filter((r) => r.name.toLowerCase().includes(q));
  }, [repos, search]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: visibleRepos.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  function toggle(repo: GithubRepoRef) {
    const next = new Map(selected);
    if (next.has(repo.fullName)) {
      next.delete(repo.fullName);
    } else {
      next.set(repo.fullName, repo);
    }
    onSelectionChange(next);
  }

  const allLoadedSelected = visibleRepos.length > 0 && visibleRepos.every((r) => selected.has(r.fullName));

  function toggleSelectAllLoaded() {
    const next = new Map(selected);
    if (allLoadedSelected) {
      for (const r of visibleRepos) next.delete(r.fullName);
    } else {
      for (const r of visibleRepos) next.set(r.fullName, r);
    }
    onSelectionChange(next);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-3 pb-3">
        <Input placeholder="Filter loaded repos…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        {loading && <Spinner />}
      </div>

      {error && <div className="text-sm text-[var(--color-danger)] pb-2">{error}</div>}
      {search && hasMore && (
        <div className="text-xs pb-2" style={{ color: "var(--color-muted)" }}>
          Filtering only the {repos.length} repos loaded so far — load more to search further.
        </div>
      )}

      <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium border-b" style={{ color: "var(--color-muted)" }}>
        <Checkbox checked={allLoadedSelected} onChange={toggleSelectAllLoaded} disabled={selectingAll} aria-label="Select all loaded" />
        <div className="flex-1">Repository</div>
        <div className="w-20 text-right">Visibility</div>
        <div className="w-[62px] text-right">&nbsp;</div>
      </div>

      {allLoadedSelected && hasMore && (
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs border-b bg-[var(--color-accent)]/5">
          {selectingAll ? (
            <>
              <Spinner /> Selecting all repos…
            </>
          ) : (
            <>
              <span style={{ color: "var(--color-muted)" }}>All {visibleRepos.length} loaded repos are selected.</span>
              <button type="button" className="underline font-medium" onClick={selectAllRemaining}>
                Select all repos for this owner
              </button>
            </>
          )}
        </div>
      )}

      <div ref={parentRef} className="flex-1 overflow-auto min-h-[320px]">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((row) => {
            const r = visibleRepos[row.index]!;
            const isSelected = selected.has(r.fullName);
            return (
              <div
                key={r.id}
                className={cn("flex items-center gap-2 px-2 text-sm border-b cursor-pointer", isSelected && "bg-[var(--color-accent)]/10")}
                style={{ position: "absolute", top: 0, left: 0, right: 0, height: row.size, transform: `translateY(${row.start}px)` }}
                onClick={() => toggle(r)}
              >
                <Checkbox checked={isSelected} onChange={() => toggle(r)} onClick={(e) => e.stopPropagation()} />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{r.name}</div>
                </div>
                <div className="w-20 text-right">
                  <Badge tone={r.private ? "neutral" : "accent"}>{r.private ? "private" : "public"}</Badge>
                  {r.archived && (
                    <Badge tone="warning" className="ml-1">
                      archived
                    </Badge>
                  )}
                </div>
                <div className="w-[62px] text-right shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailRepo(r);
                    }}
                  >
                    Browse
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        {!loading && visibleRepos.length === 0 && !error && (
          <div className="text-center text-sm py-8" style={{ color: "var(--color-muted)" }}>
            {owner ? "No repos match." : "Choose an owner above."}
          </div>
        )}
      </div>

      {hasMore && (
        <div className="pt-2 text-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loading || selectingAll}>
            Load more
          </Button>
        </div>
      )}

      {detailRepo && (
        <RepoDetailDialog
          owner={owner}
          repo={detailRepo}
          onClose={() => setDetailRepo(null)}
          onDeleted={(fullName) => {
            setRepos((prev) => prev.filter((x) => x.fullName !== fullName));
            if (selected.has(fullName)) {
              const next = new Map(selected);
              next.delete(fullName);
              onSelectionChange(next);
            }
            setDetailRepo(null);
          }}
        />
      )}
    </div>
  );
}
