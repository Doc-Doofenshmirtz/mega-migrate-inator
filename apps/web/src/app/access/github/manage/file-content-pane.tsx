"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { guessLanguage } from "@/lib/fileLanguage";
import type { GithubContentsResponse, GithubFileContent } from "@/lib/types";

const SyntaxHighlighter = dynamic(() => import("react-syntax-highlighter/dist/esm/prism-async-light"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-2 text-sm p-3" style={{ color: "var(--color-muted)" }}>
      <Spinner /> Loading highlighter…
    </div>
  ),
});

interface FileContentPaneProps {
  owner: string;
  repo: string;
  branch: string;
  path: string | null;
}

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const listener = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return dark;
}

export function FileContentPane({ owner, repo, branch, path }: FileContentPaneProps) {
  const [file, setFile] = useState<GithubFileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefersDark = usePrefersDark();

  useEffect(() => {
    if (!path) {
      setFile(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(
      `/api/github/repos/contents?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}&ref=${encodeURIComponent(branch)}`,
    )
      .then((r) => r.json())
      .then((data: GithubContentsResponse | { error: string }) => {
        if (cancelled) return;
        if ("error" in data) {
          setError(data.error);
          return;
        }
        if (data.type !== "file") {
          setError(`${path} is not a file`);
          return;
        }
        setFile(data.file);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [owner, repo, branch, path]);

  if (!path) {
    return (
      <div className="flex items-center justify-center h-full text-sm p-6 text-center" style={{ color: "var(--color-muted)" }}>
        Select a file to view its contents.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm p-3" style={{ color: "var(--color-muted)" }}>
        <Spinner /> Loading file…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3">
        <Alert tone="danger">{error}</Alert>
      </div>
    );
  }

  if (!file) return null;

  const language = guessLanguage(file.name);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b text-xs" style={{ color: "var(--color-muted)" }}>
        <span className="truncate font-mono">{file.path}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span>{(file.size / 1024).toFixed(1)} KB</span>
          {file.htmlUrl && (
            <a href={file.htmlUrl} target="_blank" rel="noreferrer" className="underline">
              View on GitHub
            </a>
          )}
        </div>
      </div>

      {file.truncated && (
        <div className="p-2">
          <Alert tone="warning">Showing the first 1 MB of a larger file — view the full file on GitHub for the rest.</Alert>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {file.binary ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center text-sm" style={{ color: "var(--color-muted)" }}>
            <div>Binary file — not shown.</div>
            <div className="flex gap-2">
              {file.htmlUrl && (
                <Button variant="outline" size="sm" onClick={() => window.open(file.htmlUrl!, "_blank")}>
                  View on GitHub
                </Button>
              )}
              {file.downloadUrl && (
                <a href={file.downloadUrl} className="text-sm underline self-center">
                  Download
                </a>
              )}
            </div>
          </div>
        ) : language ? (
          <SyntaxHighlighter
            language={language}
            style={prefersDark ? oneDark : oneLight}
            customStyle={{ margin: 0, background: "var(--color-surface)", fontSize: "0.8125rem" }}
            showLineNumbers
          >
            {file.content ?? ""}
          </SyntaxHighlighter>
        ) : (
          <pre className="font-mono text-sm whitespace-pre-wrap p-3">{file.content}</pre>
        )}
      </div>
    </div>
  );
}
