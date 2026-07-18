"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

interface SecretMapping {
  originalKey: string;
  name: string;
  destination: string;
  renamed: boolean;
  fileType: boolean;
}
interface ProtectionResult {
  pattern: string;
  applied: boolean;
  notes: string[];
}
interface VerifyDiff {
  missingOnTarget: string[];
  extraOnTarget: string[];
  shaMismatch: string[];
}
interface RepoResult {
  sourcePath: string;
  targetFullName: string;
  targetUrl: string;
  status: string;
  branches: number;
  tags: number;
  lfs: boolean;
  secretsCount: number;
  secretMappings: SecretMapping[];
  prunedRefs: number;
  protectionResults: ProtectionResult[];
  sensitiveFiles: string[];
  warnings: string[];
  verifyDiff?: VerifyDiff;
  error?: string;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  success: "success",
  failed: "danger",
  verify_failed: "danger",
  empty: "neutral",
  skipped: "warning",
  cancelled: "warning",
  interrupted: "danger",
};

function RepoRow({ result }: { result: RepoResult }) {
  const [open, setOpen] = useState(false);
  const hasDetail =
    result.secretMappings.length > 0 ||
    result.protectionResults.length > 0 ||
    result.sensitiveFiles.length > 0 ||
    result.warnings.length > 0 ||
    Boolean(result.verifyDiff) ||
    Boolean(result.error);

  return (
    <div className="border-b">
      <div className="flex items-center gap-3 px-3 py-2 text-sm">
        <div className="flex-1 min-w-0 truncate" title={result.sourcePath}>
          {result.sourcePath}
        </div>
        <div className="flex-1 min-w-0 truncate" style={{ color: "var(--color-muted)" }} title={result.targetFullName}>
          → {result.targetFullName}
        </div>
        <div className="w-16 text-right">{result.branches}br</div>
        <div className="w-12 text-right">{result.lfs ? "LFS" : ""}</div>
        <Badge tone={STATUS_TONE[result.status] ?? "neutral"}>{result.status}</Badge>
        {hasDetail && (
          <button type="button" className="text-xs underline" style={{ color: "var(--color-muted)" }} onClick={() => setOpen((v) => !v)}>
            {open ? "hide" : "details"}
          </button>
        )}
      </div>
      {open && (
        <div className="px-3 pb-3 text-xs space-y-2" style={{ color: "var(--color-muted)" }}>
          {result.error && <div className="text-[var(--color-danger)]">Error: {result.error}</div>}
          {result.secretMappings.length > 0 && (
            <div>
              <div className="font-medium">CI/CD variables ({result.secretMappings.length}), names only:</div>
              <ul className="list-disc pl-5">
                {result.secretMappings.map((m, i) => (
                  <li key={i}>
                    <code>{m.name}</code> → {m.destination}
                    {m.renamed ? ` (renamed from ${m.originalKey})` : ""}
                    {m.fileType ? " [file-type: write to disk in workflow]" : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.protectionResults.length > 0 && (
            <div>
              <div className="font-medium">Branch protection:</div>
              <ul className="list-disc pl-5">
                {result.protectionResults.map((p, i) => (
                  <li key={i}>
                    <code>{p.pattern}</code>: {p.applied ? "applied" : "FAILED"} — {p.notes.join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.sensitiveFiles.length > 0 && (
            <div className="text-[var(--color-warning)]">
              <div className="font-medium">Committed files matching secret-like patterns (rotate real credentials):</div>
              <ul className="list-disc pl-5">
                {result.sensitiveFiles.map((f) => (
                  <li key={f}>
                    <code>{f}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.verifyDiff && (
            <div className="text-[var(--color-danger)]">
              <div className="font-medium">Verification failed:</div>
              <div>Missing on target: {result.verifyDiff.missingOnTarget.join(", ") || "(none)"}</div>
              <div>SHA mismatches: {result.verifyDiff.shaMismatch.join(", ") || "(none)"}</div>
              <div>Extra on target: {result.verifyDiff.extraOnTarget.join(", ") || "(none)"}</div>
            </div>
          )}
          {result.warnings.length > 0 && (
            <div>
              <div className="font-medium">Warnings:</div>
              <ul className="list-disc pl-5">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ReportClient({ runId }: { runId: string }) {
  const router = useRouter();
  const [runStartedAt, setRunStartedAt] = useState<string | null>(null);
  const [results, setResults] = useState<RepoResult[] | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${runId}/report`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setRunStartedAt(data.runStartedAt);
          setResults(data.results);
        }
      });
  }, [runId]);

  function downloadJson() {
    const blob = new Blob([JSON.stringify({ runStartedAt, results }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `glab2gh-report-${runId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function retryFailed() {
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to retry");
        return;
      }
      router.push(`/run/${data.runId}`);
    } finally {
      setRetrying(false);
    }
  }

  if (error) {
    return <div className="text-sm text-[var(--color-danger)]">{error}</div>;
  }

  if (!results) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-muted)" }}>
        <Spinner /> Loading report…
      </div>
    );
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed" || r.status === "verify_failed").length;
  const hasFailed = failed > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Report</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
            Started {runStartedAt ? new Date(runStartedAt).toLocaleString() : "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/runs/${runId}/report?format=md`}>
            <Button variant="secondary" size="sm">
              Download .md
            </Button>
          </a>
          <Button variant="secondary" size="sm" onClick={downloadJson}>
            Download .json
          </Button>
          {hasFailed && (
            <Button variant="danger" size="sm" onClick={retryFailed} disabled={retrying}>
              {retrying && <Spinner />}
              Retry {failed} failed repo{failed === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {results.length} repo(s) — {succeeded} succeeded, {failed} failed, {results.length - succeeded - failed} other
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {results.map((r) => (
            <RepoRow key={r.sourcePath} result={r} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
