"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { GithubRepoRef } from "@/lib/types";

interface DeleteRepoDialogProps {
  owner: string;
  repo: GithubRepoRef;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteRepoDialog({ owner, repo, onClose, onDeleted }: DeleteRepoDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText === repo.name && !deleting;

  async function submit() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/github/repos?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo.name)}&confirm=${encodeURIComponent(confirmText)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to delete repository");
        return;
      }
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Delete repository"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} disabled={!canDelete}>
            {deleting && <Spinner />}
            Delete this repository
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Alert tone="danger">
          This permanently deletes <strong>{owner}/{repo.name}</strong> — including its issues, pull requests, wiki,
          releases, and stars. This cannot be undone.
        </Alert>
        <div>
          <Label>
            Type <code className="font-mono">{repo.name}</code> to confirm
          </Label>
          <Input
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={repo.name}
          />
        </div>
        {error && <div className="text-sm text-[var(--color-danger)]">{error}</div>}
      </div>
    </Dialog>
  );
}
