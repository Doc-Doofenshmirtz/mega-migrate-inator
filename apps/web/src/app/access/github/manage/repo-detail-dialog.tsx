"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { FileTree } from "./file-tree";
import { FileContentPane } from "./file-content-pane";
import { DeleteRepoDialog } from "./delete-repo-dialog";
import type { GithubBranchRef, GithubRepoRef } from "@/lib/types";

interface RepoDetailDialogProps {
  owner: string;
  repo: GithubRepoRef;
  onClose: () => void;
  onDeleted: (fullName: string) => void;
}

export function RepoDetailDialog({ owner, repo, onClose, onDeleted }: RepoDetailDialogProps) {
  const [branches, setBranches] = useState<GithubBranchRef[] | null>(null);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/github/repos/branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo.name)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) {
          setBranchesError(d.error);
          return;
        }
        setBranches(d.branches);
        setBranch(d.defaultBranch);
      })
      .catch((e) => !cancelled && setBranchesError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo.name]);

  useEffect(() => {
    setSelectedPath(null);
  }, [branch]);

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={`${owner}/${repo.name}`}
        size="xl"
        footer={
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            Delete repository…
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={repo.private ? "neutral" : "accent"}>{repo.private ? "private" : "public"}</Badge>
            {repo.archived && <Badge tone="warning">archived</Badge>}
            {repo.fork && <Badge tone="neutral">fork</Badge>}
            {repo.description && (
              <span className="text-sm truncate" style={{ color: "var(--color-muted)" }}>
                {repo.description}
              </span>
            )}
          </div>

          {branchesError ? (
            <div className="text-sm text-[var(--color-danger)]">{branchesError}</div>
          ) : !branches || !branch ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-muted)" }}>
              <Spinner /> Loading branches…
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="max-w-xs">
                <Label>Branch</Label>
                <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                      {b.protected ? " 🔒" : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-2 pb-0.5">
                <a
                  href={`/api/github/repos/archive?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo.name)}&ref=${encodeURIComponent(branch)}&format=zip`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 font-medium transition-colors text-sm px-2.5 py-1.5 rounded-md bg-transparent border text-[var(--color-fg)] hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Download .zip
                </a>
                <a
                  href={`/api/github/repos/archive?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo.name)}&ref=${encodeURIComponent(branch)}&format=tar.gz`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 font-medium transition-colors text-sm px-2.5 py-1.5 rounded-md bg-transparent border text-[var(--color-fg)] hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Download .tar.gz
                </a>
              </div>
            </div>
          )}

          {branch && (
            <div className="flex border rounded-md overflow-hidden" style={{ height: 420 }}>
              <div className="w-64 shrink-0 overflow-auto border-r">
                <FileTree owner={owner} repo={repo.name} branch={branch} selectedPath={selectedPath} onSelectFile={setSelectedPath} />
              </div>
              <div className="flex-1 overflow-hidden">
                <FileContentPane owner={owner} repo={repo.name} branch={branch} path={selectedPath} />
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {deleteOpen && (
        <DeleteRepoDialog
          owner={owner}
          repo={repo}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => onDeleted(repo.fullName)}
        />
      )}
    </>
  );
}
