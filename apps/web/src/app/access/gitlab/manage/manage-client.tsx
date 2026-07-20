"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GitlabGroupRef, GitlabProject } from "@glab2gh/core";
import { GroupTree } from "@/app/select/group-tree";
import { RepoTable } from "@/app/select/repo-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { GitlabUserPicker } from "./user-picker";
import { GITLAB_ACCESS_LEVELS } from "@/lib/types";

type Step = "repos" | "users" | "action" | "review";
type Action = "add" | "remove";

interface ResolvedUser {
  id: number;
  username: string;
}

const STEPS: { key: Step; label: string }[] = [
  { key: "repos", label: "Repositories" },
  { key: "users", label: "Users" },
  { key: "action", label: "Action" },
  { key: "review", label: "Review" },
];

export function ManageClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("repos");

  const [group, setGroup] = useState<GitlabGroupRef | null>(null);
  const [selectedRepos, setSelectedRepos] = useState<Map<string, GitlabProject>>(new Map());

  const [usernames, setUsernames] = useState<string[]>([]);
  const [resolvedUsers, setResolvedUsers] = useState<Map<string, ResolvedUser>>(new Map());
  const [invalidUsernames, setInvalidUsernames] = useState<Set<string>>(new Set());
  const [checkedUsernames, setCheckedUsernames] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState(false);

  const [action, setAction] = useState<Action>("add");
  const [accessLevel, setAccessLevel] = useState(30);
  const [expiresAt, setExpiresAt] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Resolve usernames -> numeric GitLab user ids as they're added; GitLab's
  // member write endpoints require an id, never a bare username.
  useEffect(() => {
    const toResolve = usernames.filter((u) => !checkedUsernames.has(u));
    if (toResolve.length === 0) return;
    let cancelled = false;
    setResolving(true);
    fetch("/api/gitlab/users/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: toResolve }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setCheckedUsernames((prev) => new Set([...prev, ...toResolve]));
        setResolvedUsers((prev) => {
          const next = new Map(prev);
          for (const u of d.resolved ?? []) next.set(u.username, { id: u.id, username: u.username });
          return next;
        });
        setInvalidUsernames((prev) => new Set([...prev, ...((d.notFound as string[] | undefined) ?? [])]));
      })
      .finally(() => !cancelled && setResolving(false));
    return () => {
      cancelled = true;
    };
  }, [usernames, checkedUsernames]);

  const validUsernames = usernames.filter((u) => !invalidUsernames.has(u));
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  function canAdvance(): boolean {
    if (step === "repos") return selectedRepos.size > 0;
    if (step === "users") return validUsernames.length > 0 && !resolving;
    return true;
  }

  function goNext() {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next.key);
  }
  function goBack() {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev.key);
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/gitlab/access/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          repos: Array.from(selectedRepos.values()).map((p) => ({ projectId: p.id, pathWithNamespace: p.pathWithNamespace })),
          userIds: validUsernames.map((u) => resolvedUsers.get(u)).filter((u): u is ResolvedUser => Boolean(u)),
          accessLevel: action === "add" ? accessLevel : undefined,
          expiresAt: action === "add" && expiresAt ? expiresAt : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Failed to start job");
        return;
      }
      router.push(`/access/gitlab/jobs/${data.jobId}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Manage GitLab access</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          Add or remove project members across one or many repositories at once.
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs font-medium">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-1"
              style={{
                background: i <= stepIndex ? "var(--color-accent)" : "transparent",
                color: i <= stepIndex ? "var(--color-accent-fg)" : "var(--color-muted)",
                border: i <= stepIndex ? "none" : "1px solid var(--color-border)",
              }}
            >
              {i + 1}. {s.label}
            </span>
            {i < STEPS.length - 1 && <span style={{ color: "var(--color-border)" }}>→</span>}
          </div>
        ))}
      </div>

      {step === "repos" && (
        <Card>
          <CardHeader>
            <CardTitle>Choose repositories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-[220px_1fr] gap-4 rounded-lg border" style={{ minHeight: 420 }}>
              <div className="border-r p-2 overflow-auto">
                <GroupTree selectedGroupId={group?.id ?? null} onSelectGroup={setGroup} />
              </div>
              <div className="p-3 flex flex-col">
                <RepoTable group={group} selected={selectedRepos} onSelectionChange={setSelectedRepos} repoStatus={{}} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "users" && (
        <Card>
          <CardHeader>
            <CardTitle>Choose users</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <GitlabUserPicker usernames={usernames} onChange={setUsernames} invalid={invalidUsernames} />
            {invalidUsernames.size > 0 && (
              <Alert tone="danger">
                {Array.from(invalidUsernames).join(", ")} — no matching GitLab {invalidUsernames.size === 1 ? "user" : "users"} found. Remove
                or fix before continuing.
              </Alert>
            )}
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              Press Enter or comma to add a username, or pick from the autocomplete list.
            </p>
          </CardContent>
        </Card>
      )}

      {step === "action" && (
        <Card>
          <CardHeader>
            <CardTitle>Choose action</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button variant={action === "add" ? "primary" : "outline"} onClick={() => setAction("add")}>
                Add access
              </Button>
              <Button variant={action === "remove" ? "danger" : "outline"} onClick={() => setAction("remove")}>
                Remove access
              </Button>
            </div>
            {action === "add" && (
              <>
                <div className="max-w-sm">
                  <Label>Access level</Label>
                  <Select value={accessLevel} onChange={(e) => setAccessLevel(Number(e.target.value))}>
                    {GITLAB_ACCESS_LEVELS.map((lvl) => (
                      <option key={lvl.value} value={lvl.value}>
                        {lvl.label} ({lvl.value})
                      </option>
                    ))}
                  </Select>
                  {accessLevel === 50 && (
                    <p className="text-xs mt-1" style={{ color: "var(--color-warning)" }}>
                      Owner is the most privileged project-level role — double-check this is intended.
                    </p>
                  )}
                </div>
                <div className="max-w-sm">
                  <Label>Access expires (optional)</Label>
                  <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === "review" && (
        <Card>
          <CardHeader>
            <CardTitle>Review &amp; start</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              {action === "add" ? "Add" : "Remove"} <strong>{validUsernames.length}</strong> user{validUsernames.length === 1 ? "" : "s"}{" "}
              {action === "add" ? "to" : "from"} <strong>{selectedRepos.size}</strong> repositor{selectedRepos.size === 1 ? "y" : "ies"}
              {action === "add" ? (
                <>
                  {" "}
                  as <strong>{GITLAB_ACCESS_LEVELS.find((l) => l.value === accessLevel)?.label}</strong>
                  {expiresAt ? ` (expires ${expiresAt})` : ""}
                </>
              ) : null}
              .
            </div>
            <div>
              <div className="font-medium mb-1">Users</div>
              <div style={{ color: "var(--color-muted)" }}>{validUsernames.join(", ")}</div>
            </div>
            <div>
              <div className="font-medium mb-1">Repositories</div>
              <div style={{ color: "var(--color-muted)" }}>{Array.from(selectedRepos.keys()).join(", ")}</div>
            </div>
            {submitError && <div className="text-[var(--color-danger)]">{submitError}</div>}
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-0 flex items-center justify-between rounded-lg border bg-[var(--color-surface)] px-4 py-3">
        <Button variant="ghost" onClick={goBack} disabled={stepIndex === 0}>
          ← Back
        </Button>
        {step === "review" ? (
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Spinner />}
            Start job
          </Button>
        ) : (
          <Button onClick={goNext} disabled={!canAdvance()}>
            Next →
          </Button>
        )}
      </div>
    </div>
  );
}
