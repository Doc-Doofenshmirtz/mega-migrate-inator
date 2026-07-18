"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { GitlabGroupRef } from "@glab2gh/core";

interface GroupTreeProps {
  selectedGroupId: number | null;
  onSelectGroup: (group: GitlabGroupRef | null) => void;
}

export function GroupTree({ selectedGroupId, onSelectGroup }: GroupTreeProps) {
  const [roots, setRoots] = useState<GitlabGroupRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/gitlab/groups")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setRoots(d.groups)))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="text-sm">
      <button
        type="button"
        className={cn(
          "w-full text-left px-2 py-1 rounded",
          selectedGroupId === null && "bg-[var(--color-accent)]/15 text-[var(--color-accent)]",
        )}
        onClick={() => onSelectGroup(null)}
      >
        All projects
      </button>
      {error && <div className="text-[var(--color-danger)] px-2 py-1 text-xs">{error}</div>}
      {roots === null && !error && (
        <div className="px-2 py-1 text-xs" style={{ color: "var(--color-muted)" }}>
          Loading groups…
        </div>
      )}
      {roots?.map((g) => (
        <GroupNode key={g.id} group={g} depth={0} selectedGroupId={selectedGroupId} onSelectGroup={onSelectGroup} />
      ))}
    </div>
  );
}

function GroupNode({
  group,
  depth,
  selectedGroupId,
  onSelectGroup,
}: {
  group: GitlabGroupRef;
  depth: number;
  selectedGroupId: number | null;
  onSelectGroup: (group: GitlabGroupRef | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<GitlabGroupRef[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggleExpand() {
    if (!expanded && children === null) {
      setLoading(true);
      try {
        const res = await fetch(`/api/gitlab/groups?parentId=${group.id}`);
        const data = await res.json();
        setChildren(data.groups ?? []);
      } finally {
        setLoading(false);
      }
    }
    setExpanded((v) => !v);
  }

  return (
    <div>
      <div className="flex items-center" style={{ paddingLeft: depth * 14 }}>
        <button
          type="button"
          onClick={toggleExpand}
          className="w-4 shrink-0 text-xs"
          style={{ color: "var(--color-muted)" }}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {loading ? "…" : expanded ? "▾" : "▸"}
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 min-w-0 text-left px-1.5 py-1 rounded truncate",
            selectedGroupId === group.id && "bg-[var(--color-accent)]/15 text-[var(--color-accent)]",
          )}
          onClick={() => onSelectGroup(group)}
          title={group.fullPath}
        >
          {group.name}
        </button>
      </div>
      {expanded &&
        children?.map((c) => (
          <GroupNode key={c.id} group={c} depth={depth + 1} selectedGroupId={selectedGroupId} onSelectGroup={onSelectGroup} />
        ))}
      {expanded && children?.length === 0 && (
        <div className="text-xs px-2 py-0.5" style={{ paddingLeft: (depth + 1) * 14, color: "var(--color-muted)" }}>
          no subgroups
        </div>
      )}
    </div>
  );
}
