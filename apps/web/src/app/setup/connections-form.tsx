"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

interface TestResult {
  ok: boolean;
  identity?: { username: string; name: string | null };
  scopes?: string[] | null;
  warnings?: string[];
  error?: string;
}

interface GitlabInitial {
  configured: boolean;
  url?: string;
  insecureTls?: boolean;
}
interface GithubInitial {
  configured: boolean;
  apiUrl?: string;
}

export function ConnectionsForm({
  initialGitlab,
  initialGithub,
}: {
  initialGitlab: GitlabInitial;
  initialGithub: GithubInitial;
}) {
  const [gitlabUrl, setGitlabUrl] = useState(initialGitlab.url ?? "");
  const [gitlabToken, setGitlabToken] = useState("");
  const [gitlabInsecureTls, setGitlabInsecureTls] = useState(initialGitlab.insecureTls ?? false);
  const [gitlabTesting, setGitlabTesting] = useState(false);
  const [gitlabResult, setGitlabResult] = useState<TestResult | null>(null);
  const [gitlabConfigured, setGitlabConfigured] = useState(initialGitlab.configured);

  const [showGhe, setShowGhe] = useState(Boolean(initialGithub.apiUrl && initialGithub.apiUrl !== "https://api.github.com"));
  const [githubApiUrl, setGithubApiUrl] = useState(initialGithub.apiUrl ?? "https://api.github.com");
  const [githubToken, setGithubToken] = useState("");
  const [githubTesting, setGithubTesting] = useState(false);
  const [githubResult, setGithubResult] = useState<TestResult | null>(null);
  const [githubConfigured, setGithubConfigured] = useState(initialGithub.configured);

  const [forgetting, setForgetting] = useState(false);

  async function testGitlab() {
    setGitlabTesting(true);
    setGitlabResult(null);
    try {
      const res = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "gitlab", url: gitlabUrl, token: gitlabToken, insecureTls: gitlabInsecureTls }),
      });
      const data: TestResult = await res.json();
      setGitlabResult(data);
      if (data.ok) setGitlabConfigured(true);
    } catch (err) {
      setGitlabResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setGitlabTesting(false);
    }
  }

  async function testGithub() {
    setGithubTesting(true);
    setGithubResult(null);
    try {
      const res = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "github", apiUrl: githubApiUrl, token: githubToken }),
      });
      const data: TestResult = await res.json();
      setGithubResult(data);
      if (data.ok) setGithubConfigured(true);
    } catch (err) {
      setGithubResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setGithubTesting(false);
    }
  }

  async function forgetCredentials() {
    setForgetting(true);
    try {
      await fetch("/api/connections", { method: "DELETE" });
      setGitlabConfigured(false);
      setGithubConfigured(false);
      setGitlabResult(null);
      setGithubResult(null);
      setGitlabToken("");
      setGithubToken("");
    } finally {
      setForgetting(false);
    }
  }

  const bothConfigured = gitlabConfigured && githubConfigured;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>GitLab</CardTitle>
              <CardDescription>Self-hosted or gitlab.com source instance.</CardDescription>
            </div>
            {gitlabConfigured && <Badge tone="success">Connected</Badge>}
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="gitlab-url">GitLab URL</Label>
              <Input
                id="gitlab-url"
                placeholder="https://gitlab.mycompany.com"
                value={gitlabUrl}
                onChange={(e) => setGitlabUrl(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="gitlab-token">Personal access token</Label>
              <Input
                id="gitlab-token"
                type="password"
                placeholder={gitlabConfigured ? "•••••••••••• (saved — enter a new one to replace)" : "glpat-…"}
                value={gitlabToken}
                onChange={(e) => setGitlabToken(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="gitlab-insecure" className="mb-0">
                Allow self-signed TLS certificates
              </Label>
              <Switch id="gitlab-insecure" checked={gitlabInsecureTls} onCheckedChange={setGitlabInsecureTls} />
            </div>
            {gitlabResult && (
              <Alert tone={gitlabResult.ok ? "success" : "danger"}>
                {gitlabResult.ok ? (
                  <div className="space-y-2">
                    <div>
                      Authenticated as <strong>{gitlabResult.identity?.username}</strong>
                      {gitlabResult.identity?.name ? ` (${gitlabResult.identity.name})` : ""}.
                    </div>
                    {gitlabResult.scopes && (
                      <div className="flex flex-wrap gap-1">
                        {gitlabResult.scopes.map((s) => (
                          <Badge key={s} tone="neutral">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {gitlabResult.warnings?.map((w, i) => (
                      <div key={i} className="text-[var(--color-warning)]">
                        ⚠ {w}
                      </div>
                    ))}
                  </div>
                ) : (
                  gitlabResult.error
                )}
              </Alert>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={testGitlab} disabled={gitlabTesting || !gitlabUrl || !gitlabToken} variant="secondary">
              {gitlabTesting && <Spinner />}
              Test connection
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>GitHub</CardTitle>
              <CardDescription>Target for migrated repositories.</CardDescription>
            </div>
            {githubConfigured && <Badge tone="success">Connected</Badge>}
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="github-token">Personal access token</Label>
              <Input
                id="github-token"
                type="password"
                placeholder={githubConfigured ? "•••••••••••• (saved — enter a new one to replace)" : "ghp_… or github_pat_…"}
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="text-sm underline"
              style={{ color: "var(--color-muted)" }}
              onClick={() => setShowGhe((v) => !v)}
            >
              {showGhe ? "Hide" : "GitHub Enterprise?"}
            </button>
            {showGhe && (
              <div>
                <Label htmlFor="github-api-url">API URL</Label>
                <Input
                  id="github-api-url"
                  placeholder="https://github.mycompany.com/api/v3"
                  value={githubApiUrl}
                  onChange={(e) => setGithubApiUrl(e.target.value)}
                />
              </div>
            )}
            {githubResult && (
              <Alert tone={githubResult.ok ? "success" : "danger"}>
                {githubResult.ok ? (
                  <div className="space-y-2">
                    <div>
                      Authenticated as <strong>{githubResult.identity?.username}</strong>
                      {githubResult.identity?.name ? ` (${githubResult.identity.name})` : ""}.
                    </div>
                    {githubResult.scopes && (
                      <div className="flex flex-wrap gap-1">
                        {githubResult.scopes.map((s) => (
                          <Badge key={s} tone="neutral">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {githubResult.warnings?.map((w, i) => (
                      <div key={i} className="text-[var(--color-warning)]">
                        ⚠ {w}
                      </div>
                    ))}
                  </div>
                ) : (
                  githubResult.error
                )}
              </Alert>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={testGithub} disabled={githubTesting || !githubToken} variant="secondary">
              {githubTesting && <Spinner />}
              Test connection
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={forgetCredentials} disabled={forgetting}>
          Forget credentials
        </Button>
        {bothConfigured ? (
          <Link href="/select">
            <Button>Continue to repo selection →</Button>
          </Link>
        ) : (
          <Button disabled>Continue to repo selection →</Button>
        )}
      </div>
    </div>
  );
}
