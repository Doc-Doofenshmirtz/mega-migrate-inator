"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { RepoTable } from "./repo-table";
import { GithubUserPicker } from "./user-picker";
import type { GithubRepoRef, GithubPermission } from "@/lib/types";

type Step = "repos" | "users" | "action" | "review";
type Action = "add" | "remove";

interface GithubOwner {
  login: string;
  type: "user" | "org";
  canCreateRepos: boolean;
}

const STEPS: { key: Step; label: string }[] = [
  { key: "repos", label: "Repositories" },
  { key: "users", label: "Users" },
  { key: "action", label: "Action" },
  { key: "review", label: "Review" },
];

const PERMISSIONS: { value: GithubPermission; label: string }[] = [
  { value: "pull", label: "Pull — read-only" },
  { value: "triage", label: "Triage — read + manage issues/PRs" },
  { value: "push", label: "Push — read + write" },
  { value: "maintain", label: "Maintain — push + manage repo settings" },
  { value: "admin", label: "Admin — full control" },
];

export function ManageClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("repos");

  const [owners, setOwners] = useState<GithubOwner[] | null>(null);
  const [ownersError, setOwnersError] = useState<string | null>(null);
  const [owner, setOwner] = useState("");
  const [selectedRepos, setSelectedRepos] = useState<Map<string, GithubRepoRef>>(new Map());

  const [usernames, setUsernames] = useState<string[]>([]);
  const [invalidUsernames, setInvalidUsernames] = useState<Set<string>>(new Set());
  const [checkedUsernames, setCheckedUsernames] = useState<Set<string>>(new Set());
  const [validating, setValidating] = useState(false);

  const [action, setAction] = useState<Action>("add");
  const [permission, setPermission] = useState<GithubPermission>("push");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/github/owners")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setOwnersError(d.error);
          return;
        }
        setOwners(d.owners);
        if (d.owners?.[0]) setOwner((prev) => prev || d.owners[0].login);
      })
      .catch((e) => setOwnersError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    setSelectedRepos(new Map());
  }, [owner]);

  // Validate exact usernames against GitHub as they're added, so a typo doesn't become a wasted task later.
  useEffect(() => {
    const toCheck = usernames.filter((u) => !checkedUsernames.has(u));
    if (toCheck.length === 0) return;
    let cancelled = false;
    setValidating(true);
    Promise.all(
      toCheck.map((u) =>
        fetch(`/api/github/users/validate?username=${encodeURIComponent(u)}`)
          .then((r) => r.json())
          .then((d) => ({ username: u, found: Boolean(d.found) })),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        setCheckedUsernames((prev) => new Set([...prev, ...toCheck]));
        setInvalidUsernames((prev) => {
          const next = new Set(prev);
          for (const r of results) {
            if (r.found) next.delete(r.username);
            else next.add(r.username);
          }
          return next;
        });
      })
      .finally(() => !cancelled && setValidating(false));
    return () => {
      cancelled = true;
    };
  }, [usernames, checkedUsernames]);

  const validUsernames = usernames.filter((u) => !invalidUsernames.has(u));
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  function canAdvance(): boolean {
    if (step === "repos") return selectedRepos.size > 0 && Boolean(owner);
    if (step === "users") return validUsernames.length > 0 && !validating;
    if (step === "action") return action === "remove" || Boolean(permission);
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
      const res = await fetch("/api/github/access/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          repos: Array.from(selectedRepos.values()).map((r) => {
            const idx = r.fullName.indexOf("/");
            return { owner: r.fullName.slice(0, idx), repo: r.fullName.slice(idx + 1) };
          }),
          usernames: validUsernames,
          permission: action === "add" ? permission : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Failed to start job");
        return;
      }
      router.push(`/access/github/jobs/${data.jobId}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Manage GitHub access</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          Add or remove collaborators across one or many repositories at once.
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
            <CardTitle>Choose owner &amp; repositories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ownersError ? (
              <div className="text-sm text-[var(--color-danger)]">{ownersError}</div>
            ) : owners === null ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-muted)" }}>
                <Spinner /> Loading owners…
              </div>
            ) : (
              <div className="max-w-xs">
                <Label>Owner</Label>
                <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
                  {owners.map((o) => (
                    <option key={o.login} value={o.login}>
                      {o.login} {o.type === "org" ? "(org)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {owner && (
              <div className="rounded-lg border p-3" style={{ minHeight: 420 }}>
                <RepoTable owner={owner} selected={selectedRepos} onSelectionChange={setSelectedRepos} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === "users" && (
        <Card>
          <CardHeader>
            <CardTitle>Choose users</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <GithubUserPicker usernames={usernames} onChange={setUsernames} invalid={invalidUsernames} />
            {invalidUsernames.size > 0 && (
              <Alert tone="danger">
                {Array.from(invalidUsernames).join(", ")} — no matching GitHub {invalidUsernames.size === 1 ? "user" : "users"} found. Remove
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
              <div className="max-w-sm">
                <Label>Permission level</Label>
                <Select value={permission} onChange={(e) => setPermission(e.target.value as GithubPermission)}>
                  {PERMISSIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </div>
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
                  as <strong>{permission}</strong>
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
