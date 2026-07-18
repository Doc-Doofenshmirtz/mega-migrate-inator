"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { getSelectedRepos, setSelectedRepos, getDraftOptions } from "@/lib/wizardDraft";
import type { MigrationOptions } from "@/lib/types";

interface PlanPreviewRow {
  sourcePath: string;
  targetFullName: string;
  visibility: string;
  sizeBytes: number;
  lfsLikely: boolean;
  ciVariableCount: number;
  skip: boolean;
  skipReason?: string;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "?";
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(0)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function PlanClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [rows, setRows] = useState<PlanPreviewRow[]>([]);
  const [blockingErrors, setBlockingErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<MigrationOptions | null>(null);

  const computePlan = useCallback(async () => {
    const repos = getSelectedRepos();
    const opts = getDraftOptions<MigrationOptions>();
    if (repos.length === 0 || !opts) {
      router.replace(repos.length === 0 ? "/select" : "/options");
      return;
    }
    setOptions(opts);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true, selectedRepoPaths: repos.map((r) => r.pathWithNamespace), options: opts }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to compute plan");
        setBlockingErrors(data.blockingErrors ?? []);
        setRows([]);
      } else {
        setRows(data.rows);
        setBlockingErrors(data.blockingErrors ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    computePlan();
  }, [computePlan]);

  function removeRepo(sourcePath: string) {
    const repos = getSelectedRepos().filter((r) => r.pathWithNamespace !== sourcePath);
    setSelectedRepos(repos);
    computePlan();
  }

  async function startMigration() {
    const repos = getSelectedRepos();
    if (!options) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false, selectedRepoPaths: repos.map((r) => r.pathWithNamespace), options }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to start migration");
        setBlockingErrors(data.blockingErrors ?? []);
        return;
      }
      router.push(`/run/${data.runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }

  const canStart = !loading && blockingErrors.length === 0 && rows.length > 0 && !error;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Plan</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          Dry run — nothing is created or modified yet.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-muted)" }}>
          <Spinner /> Computing plan…
        </div>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      {blockingErrors.length > 0 && (
        <Alert tone="danger">
          <div className="font-medium mb-1">Blocking issues — resolve before starting:</div>
          <ul className="list-disc pl-5 space-y-0.5">
            {blockingErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}

      {!loading && rows.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--color-surface)]">
                  <tr className="text-left border-b" style={{ color: "var(--color-muted)" }}>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Target</th>
                    <th className="px-3 py-2 font-medium">Visibility</th>
                    <th className="px-3 py-2 font-medium">Size</th>
                    <th className="px-3 py-2 font-medium">LFS</th>
                    <th className="px-3 py-2 font-medium">CI vars</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.sourcePath} className="border-b">
                      <td className="px-3 py-2 truncate max-w-[200px]" title={row.sourcePath}>
                        {row.sourcePath}
                      </td>
                      <td className="px-3 py-2 truncate max-w-[200px]" title={row.targetFullName}>
                        {row.targetFullName}
                      </td>
                      <td className="px-3 py-2">{row.visibility}</td>
                      <td className="px-3 py-2" style={{ color: "var(--color-muted)" }}>
                        {formatBytes(row.sizeBytes)}
                      </td>
                      <td className="px-3 py-2">{row.lfsLikely ? "yes" : "no"}</td>
                      <td className="px-3 py-2">{row.ciVariableCount}</td>
                      <td className="px-3 py-2">
                        {row.skip ? (
                          <Badge tone="warning" title={row.skipReason}>
                            skip
                          </Badge>
                        ) : (
                          <Badge tone="success">ok</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-xs underline"
                          style={{ color: "var(--color-muted)" }}
                          onClick={() => removeRepo(row.sourcePath)}
                        >
                          remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-0 flex items-center justify-between rounded-lg border bg-[var(--color-surface)] px-4 py-3">
        <div className="text-sm" style={{ color: "var(--color-muted)" }}>
          {loading ? "Computing…" : `${rows.filter((r) => !r.skip).length} repo(s) will be migrated, ${rows.filter((r) => r.skip).length} skipped.`}
        </div>
        <div className="flex gap-2">
          <Link href="/options">
            <Button variant="ghost">← Back</Button>
          </Link>
          <Button onClick={startMigration} disabled={!canStart || starting}>
            {starting && <Spinner />}
            Start migration →
          </Button>
        </div>
      </div>
    </div>
  );
}
