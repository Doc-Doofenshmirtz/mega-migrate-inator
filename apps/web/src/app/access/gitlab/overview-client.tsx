"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StatTile, StatTileRow, InlineMeter } from "@/components/ui/stat-tile";
import { cn } from "@/lib/cn";

interface GitlabGroupOption {
  id: number;
  name: string;
  fullPath: string;
}

interface OverviewData {
  totalRepos: number;
  totalUniqueUsers: number;
  perRepo: Array<{ repo: string; memberCount: number }>;
  perUser: Array<{ username: string; repoCount: number; repos: string[] }>;
}

const ALL_PROJECTS = "";

export function OverviewClient() {
  const [groups, setGroups] = useState<GitlabGroupOption[] | null>(null);
  const [groupId, setGroupId] = useState<string>(ALL_PROJECTS);
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedUser, setFocusedUser] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/gitlab/groups")
      .then((r) => r.json())
      .then((d) => setGroups(d.groups ?? []))
      .catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFocusedUser(null);
    const qs = groupId ? `?groupId=${encodeURIComponent(groupId)}` : "";
    fetch(`/api/gitlab/access/overview${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const maxRepoMembers = data ? Math.max(1, ...data.perRepo.map((r) => r.memberCount)) : 1;
  const maxUserRepos = data ? Math.max(1, ...data.perUser.map((u) => u.repoCount)) : 1;
  const avgMembersPerRepo = data && data.totalRepos > 0 ? data.perRepo.reduce((s, r) => s + r.memberCount, 0) / data.totalRepos : 0;
  const highlightedRepos = focusedUser ? new Set(data?.perUser.find((u) => u.username === focusedUser)?.repos ?? []) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">GitLab access overview</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
            Live member counts across every project in scope.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/access/gitlab/manage">
            <Button size="sm">Manage access</Button>
          </Link>
          <Link href="/access/gitlab/jobs">
            <Button variant="secondary" size="sm">
              Job history
            </Button>
          </Link>
        </div>
      </div>

      {groups === null ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-muted)" }}>
          <Spinner /> Loading groups…
        </div>
      ) : (
        <div className="max-w-xs">
          <Label>Scope</Label>
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value={ALL_PROJECTS}>All my projects</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.fullPath}
              </option>
            ))}
          </Select>
        </div>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
      {loading && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-muted)" }}>
          <Spinner /> Loading overview…
        </div>
      )}

      {data && !loading && (
        <>
          <StatTileRow>
            <StatTile label="Unique members" value={data.totalUniqueUsers} />
            <StatTile label="Projects" value={data.totalRepos} />
            <StatTile label="Avg members / project" value={avgMembersPerRepo.toFixed(1)} />
          </StatTileRow>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">By project</CardTitle>
              </CardHeader>
              <CardContent className="p-0 max-h-96 overflow-auto">
                {data.perRepo.map((r) => (
                  <div
                    key={r.repo}
                    className={cn("px-4 py-2 text-sm border-b last:border-b-0", highlightedRepos && !highlightedRepos.has(r.repo) && "opacity-40")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{r.repo}</span>
                      <span className="shrink-0" style={{ color: "var(--color-muted)" }}>
                        {r.memberCount}
                      </span>
                    </div>
                    <InlineMeter value={r.memberCount} max={maxRepoMembers} />
                  </div>
                ))}
                {data.perRepo.length === 0 && (
                  <div className="text-center text-sm py-8" style={{ color: "var(--color-muted)" }}>
                    No projects in scope.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">By user{focusedUser ? ` — showing ${focusedUser}'s projects` : ""}</CardTitle>
              </CardHeader>
              <CardContent className="p-0 max-h-96 overflow-auto">
                {data.perUser.map((u) => (
                  <button
                    key={u.username}
                    type="button"
                    onClick={() => setFocusedUser(focusedUser === u.username ? null : u.username)}
                    className={cn(
                      "w-full text-left px-4 py-2 text-sm border-b last:border-b-0 hover:bg-black/5 dark:hover:bg-white/5",
                      focusedUser === u.username && "bg-[var(--color-accent)]/10",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{u.username}</span>
                      <span className="shrink-0" style={{ color: "var(--color-muted)" }}>
                        {u.repoCount} project{u.repoCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <InlineMeter value={u.repoCount} max={maxUserRepos} />
                  </button>
                ))}
                {data.perUser.length === 0 && (
                  <div className="text-center text-sm py-8" style={{ color: "var(--color-muted)" }}>
                    No members.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
