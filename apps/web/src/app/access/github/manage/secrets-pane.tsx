"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { GithubActionsSecretRef, GithubActionsVariableRef } from "@/lib/types";

interface SecretsPaneProps {
  owner: string;
  repo: string;
}

type Kind = "secret" | "variable";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

async function upsert(owner: string, repo: string, kind: Kind, name: string, value: string): Promise<void> {
  const res = await fetch("/api/github/repos/secrets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, repo, kind, name, value }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Failed to save ${kind}`);
}

async function remove(owner: string, repo: string, kind: Kind, name: string): Promise<void> {
  const res = await fetch(
    `/api/github/repos/secrets?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&kind=${kind}&name=${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Failed to delete ${kind}`);
}

export function SecretsPane({ owner, repo }: SecretsPaneProps) {
  const [secrets, setSecrets] = useState<GithubActionsSecretRef[] | null>(null);
  const [variables, setVariables] = useState<GithubActionsVariableRef[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/github/repos/secrets?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setLoadError(d.error);
          return;
        }
        setLoadError(null);
        setSecrets(d.secrets);
        setVariables(d.variables);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [owner, repo]);

  useEffect(() => {
    setSecrets(null);
    setVariables(null);
    setLoadError(null);
    load();
  }, [load]);

  if (loadError && !secrets) {
    return <div className="text-sm text-[var(--color-danger)] p-3">{loadError}</div>;
  }
  if (!secrets || !variables) {
    return (
      <div className="flex items-center gap-2 text-sm p-3" style={{ color: "var(--color-muted)" }}>
        <Spinner /> Loading secrets &amp; variables…
      </div>
    );
  }

  return (
    <div className="space-y-5 overflow-auto" style={{ maxHeight: 460 }}>
      <Alert tone="neutral">
        GitHub encrypts secret values the moment they&apos;re set and never returns them again — the list below shows
        secret names only, and &quot;Set new value&quot; always overwrites blind. Variables are stored as plain text,
        so their values are visible and editable directly.
      </Alert>

      {loadError && <div className="text-sm text-[var(--color-danger)]">{loadError}</div>}

      <SecretsSection owner={owner} repo={repo} secrets={secrets} onChange={load} />
      <VariablesSection owner={owner} repo={repo} variables={variables} onChange={load} />
    </div>
  );
}

function SectionShell({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          ({count})
        </span>
      </div>
      <div className="rounded-md border divide-y">{children}</div>
    </div>
  );
}

function SecretsSection({
  owner,
  repo,
  secrets,
  onChange,
}: {
  owner: string;
  repo: string;
  secrets: GithubActionsSecretRef[];
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <SectionShell title="Repository secrets" count={secrets.length}>
      {secrets.length === 0 && !adding && (
        <div className="px-3 py-3 text-sm" style={{ color: "var(--color-muted)" }}>
          No repository secrets.
        </div>
      )}
      {secrets.map((s) => (
        <SecretRow key={s.name} owner={owner} repo={repo} secret={s} onChange={onChange} />
      ))}
      {adding ? (
        <NewEntryRow
          kind="secret"
          owner={owner}
          repo={repo}
          existingNames={secrets.map((s) => s.name)}
          onDone={() => {
            setAdding(false);
            onChange();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div className="px-3 py-2">
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            + New secret
          </Button>
        </div>
      )}
    </SectionShell>
  );
}

function VariablesSection({
  owner,
  repo,
  variables,
  onChange,
}: {
  owner: string;
  repo: string;
  variables: GithubActionsVariableRef[];
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <SectionShell title="Repository variables" count={variables.length}>
      {variables.length === 0 && !adding && (
        <div className="px-3 py-3 text-sm" style={{ color: "var(--color-muted)" }}>
          No repository variables.
        </div>
      )}
      {variables.map((v) => (
        <VariableRow key={v.name} owner={owner} repo={repo} variable={v} onChange={onChange} />
      ))}
      {adding ? (
        <NewEntryRow
          kind="variable"
          owner={owner}
          repo={repo}
          existingNames={variables.map((v) => v.name)}
          onDone={() => {
            setAdding(false);
            onChange();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div className="px-3 py-2">
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            + New variable
          </Button>
        </div>
      )}
    </SectionShell>
  );
}

function SecretRow({
  owner,
  repo,
  secret,
  onChange,
}: {
  owner: string;
  repo: string;
  secret: GithubActionsSecretRef;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    if (!value) return;
    setSaving(true);
    setError(null);
    try {
      await upsert(owner, repo, "secret", secret.name, value);
      setEditing(false);
      setValue("");
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    setError(null);
    try {
      await remove(owner, repo, "secret", secret.name);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm truncate">{secret.name}</div>
          <div className="text-xs" style={{ color: "var(--color-muted)" }}>
            Updated {formatDate(secret.updatedAt)}
          </div>
        </div>
        {!confirmDelete ? (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cancel" : "Set new value"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </>
        ) : (
          <>
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>
              Delete {secret.name}?
            </span>
            <Button variant="danger" size="sm" onClick={doDelete} disabled={deleting}>
              {deleting && <Spinner />}
              Confirm
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </Button>
          </>
        )}
      </div>
      {editing && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="password"
            autoFocus
            placeholder="New secret value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="max-w-sm"
          />
          <Button size="sm" onClick={save} disabled={!value || saving}>
            {saving && <Spinner />}
            Save
          </Button>
        </div>
      )}
      {error && <div className="mt-1 text-xs text-[var(--color-danger)]">{error}</div>}
    </div>
  );
}

function VariableRow({
  owner,
  repo,
  variable,
  onChange,
}: {
  owner: string;
  repo: string;
  variable: GithubActionsVariableRef;
  onChange: () => void;
}) {
  const [value, setValue] = useState(variable.value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => setValue(variable.value), [variable.value]);

  const dirty = value !== variable.value;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await upsert(owner, repo, "variable", variable.name, value);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    setError(null);
    try {
      await remove(owner, repo, "variable", variable.name);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="w-48 shrink-0 min-w-0">
          <div className="font-mono text-sm truncate">{variable.name}</div>
          <div className="text-xs" style={{ color: "var(--color-muted)" }}>
            Updated {formatDate(variable.updatedAt)}
          </div>
        </div>
        <Input value={value} onChange={(e) => setValue(e.target.value)} className="flex-1" />
        {!confirmDelete ? (
          <>
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              {saving && <Spinner />}
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </>
        ) : (
          <>
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>
              Delete?
            </span>
            <Button variant="danger" size="sm" onClick={doDelete} disabled={deleting}>
              {deleting && <Spinner />}
              Confirm
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </Button>
          </>
        )}
      </div>
      {error && <div className="mt-1 text-xs text-[var(--color-danger)]">{error}</div>}
    </div>
  );
}

function NewEntryRow({
  kind,
  owner,
  repo,
  existingNames,
  onDone,
  onCancel,
}: {
  kind: Kind;
  owner: string;
  repo: string;
  existingNames: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameTaken = existingNames.some((n) => n.toLowerCase() === name.trim().toLowerCase());
  const canSave = Boolean(name.trim()) && Boolean(value) && !nameTaken && !saving;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await upsert(owner, repo, kind, name.trim(), value);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div className="px-3 py-2 bg-[var(--color-accent)]/5">
      <div className="flex items-center gap-2">
        <div className="w-48 shrink-0">
          <Label className="sr-only">Name</Label>
          <Input
            autoFocus
            placeholder={kind === "secret" ? "SECRET_NAME" : "VARIABLE_NAME"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Input
          type={kind === "secret" ? "password" : "text"}
          placeholder="Value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1"
        />
        <Button size="sm" onClick={save} disabled={!canSave}>
          {saving && <Spinner />}
          Add
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
      {nameTaken && <div className="mt-1 text-xs text-[var(--color-warning)]">A {kind} with this name already exists.</div>}
      {error && <div className="mt-1 text-xs text-[var(--color-danger)]">{error}</div>}
    </div>
  );
}
