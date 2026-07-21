"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import type { GithubContentsResponse, GithubTreeEntry } from "@/lib/types";

interface TreeNodeState {
  entries: GithubTreeEntry[];
  loading: boolean;
  error: string | null;
  expanded: boolean;
}

interface FileTreeProps {
  owner: string;
  repo: string;
  branch: string;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

async function fetchDir(owner: string, repo: string, branch: string, path: string): Promise<GithubTreeEntry[]> {
  const res = await fetch(
    `/api/github/repos/contents?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}&ref=${encodeURIComponent(branch)}`,
  );
  const data: GithubContentsResponse | { error: string } = await res.json();
  if ("error" in data) throw new Error(data.error);
  if (data.type !== "dir") throw new Error(`${path || "/"} is not a directory`);
  return data.entries;
}

/**
 * Lazily-expanding multi-level tree — not GitHub.com's single-level breadcrumb
 * drill-down, and not an eagerly-fetched recursive tree (would need the separate
 * git.getTree?recursive=1 endpoint). Directories fetch their children on first
 * expand and cache them; collapsing just hides, it never refetches.
 */
export function FileTree({ owner, repo, branch, selectedPath, onSelectFile }: FileTreeProps) {
  const [nodes, setNodes] = useState<Map<string, TreeNodeState>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setNodes(new Map([["", { entries: [], loading: true, error: null, expanded: true }]]));
    fetchDir(owner, repo, branch, "")
      .then((entries) => {
        if (cancelled) return;
        setNodes(new Map([["", { entries, loading: false, error: null, expanded: true }]]));
      })
      .catch((e) => {
        if (cancelled) return;
        setNodes(new Map([["", { entries: [], loading: false, error: e instanceof Error ? e.message : String(e), expanded: true }]]));
      });
    return () => {
      cancelled = true;
    };
  }, [owner, repo, branch]);

  function toggleDir(path: string) {
    const existing = nodes.get(path);
    if (existing && existing.entries.length > 0) {
      setNodes((prev) => new Map(prev).set(path, { ...existing, expanded: !existing.expanded }));
      return;
    }
    setNodes((prev) => new Map(prev).set(path, { entries: [], loading: true, error: null, expanded: true }));
    fetchDir(owner, repo, branch, path)
      .then((entries) => {
        setNodes((prev) => new Map(prev).set(path, { entries, loading: false, error: null, expanded: true }));
      })
      .catch((e) => {
        setNodes((prev) =>
          new Map(prev).set(path, { entries: [], loading: false, error: e instanceof Error ? e.message : String(e), expanded: true }),
        );
      });
  }

  const root = nodes.get("");
  if (!root || root.loading) {
    return (
      <div className="flex items-center gap-2 text-sm p-3" style={{ color: "var(--color-muted)" }}>
        <Spinner /> Loading files…
      </div>
    );
  }
  if (root.error) {
    return <div className="text-sm text-[var(--color-danger)] p-3">{root.error}</div>;
  }

  return (
    <div className="text-sm py-1">
      <TreeEntries entries={root.entries} depth={0} nodes={nodes} toggleDir={toggleDir} selectedPath={selectedPath} onSelectFile={onSelectFile} />
    </div>
  );
}

function TreeEntries({
  entries,
  depth,
  nodes,
  toggleDir,
  selectedPath,
  onSelectFile,
}: {
  entries: GithubTreeEntry[];
  depth: number;
  nodes: Map<string, TreeNodeState>;
  toggleDir: (path: string) => void;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="px-3 py-1 text-xs" style={{ color: "var(--color-muted)", paddingLeft: 12 + depth * 14 }}>
        Empty directory
      </div>
    );
  }

  return (
    <>
      {entries.map((entry) => {
        if (entry.type === "dir") {
          const node = nodes.get(entry.path);
          const expanded = node?.expanded ?? false;
          return (
            <div key={entry.path}>
              <button
                type="button"
                onClick={() => toggleDir(entry.path)}
                className="w-full flex items-center gap-1.5 px-3 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5"
                style={{ paddingLeft: 12 + depth * 14 }}
              >
                <span className="w-3 inline-block" style={{ color: "var(--color-muted)" }}>
                  {expanded ? "▾" : "▸"}
                </span>
                <span className="truncate font-medium">{entry.name}</span>
              </button>
              {expanded && node && (
                <>
                  {node.loading && (
                    <div className="flex items-center gap-2 px-3 py-1 text-xs" style={{ paddingLeft: 12 + (depth + 1) * 14, color: "var(--color-muted)" }}>
                      <Spinner />
                    </div>
                  )}
                  {node.error && (
                    <div className="px-3 py-1 text-xs text-[var(--color-danger)]" style={{ paddingLeft: 12 + (depth + 1) * 14 }}>
                      {node.error}
                    </div>
                  )}
                  {!node.loading && !node.error && (
                    <TreeEntries
                      entries={node.entries}
                      depth={depth + 1}
                      nodes={nodes}
                      toggleDir={toggleDir}
                      selectedPath={selectedPath}
                      onSelectFile={onSelectFile}
                    />
                  )}
                </>
              )}
            </div>
          );
        }

        const interactive = entry.type === "file";
        return (
          <button
            key={entry.path}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onSelectFile(entry.path)}
            className={cn(
              "w-full flex items-center gap-1.5 px-3 py-1 text-left",
              interactive ? "hover:bg-black/5 dark:hover:bg-white/5" : "cursor-default opacity-60",
              selectedPath === entry.path && "bg-[var(--color-accent)]/10",
            )}
            style={{ paddingLeft: 12 + depth * 14 + 18 }}
          >
            <span className="truncate">{entry.name}</span>
            {entry.type !== "file" && (
              <span className="text-[10px] uppercase shrink-0" style={{ color: "var(--color-muted)" }}>
                {entry.type}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}
