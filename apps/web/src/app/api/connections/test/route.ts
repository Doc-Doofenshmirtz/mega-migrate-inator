import { NextResponse } from "next/server";
import { z } from "zod";
import { redact } from "@glab2gh/core";
import { setGitlabConnection, setGithubConnection } from "@/server/settings";
import { createGitlabApi, createGithubApi } from "@/server/clients";

export const runtime = "nodejs";

const GitlabTestSchema = z.object({
  kind: z.literal("gitlab"),
  url: z.string().url(),
  token: z.string().min(4),
  insecureTls: z.boolean().default(false),
});

const GithubTestSchema = z.object({
  kind: z.literal("github"),
  apiUrl: z.string().url().default("https://api.github.com"),
  token: z.string().min(4),
});

const BodySchema = z.discriminatedUnion("kind", [GitlabTestSchema, GithubTestSchema]);

interface TestResult {
  ok: true;
  identity: { username: string; name: string | null };
  scopes: string[] | null;
  warnings: string[];
}

async function testGitlab(input: z.infer<typeof GitlabTestSchema>): Promise<TestResult> {
  const api = createGitlabApi(input.url, input.token, input.insecureTls);
  const me: any = await api.Users.showCurrentUser();

  const warnings: string[] = [];
  let scopes: string[] | null = null;
  try {
    const self: any = await (api as any).PersonalAccessTokens.show("self");
    scopes = Array.isArray(self?.scopes) ? self.scopes : null;
  } catch {
    warnings.push(
      "Could not verify token scopes (this GitLab version/token type may not support self-introspection). " +
        "Scope-dependent steps will fail with a clear error at migration time if the token is missing permissions.",
    );
  }

  if (scopes) {
    if (!scopes.includes("api") && !scopes.includes("read_api")) {
      warnings.push("Token lacks the `api` scope — CI/CD variable migration and branch protection will be unavailable.");
    }
    if (!scopes.includes("read_repository") && !scopes.includes("api")) {
      warnings.push("Token lacks the `read_repository` scope — repository mirroring will fail.");
    }
  }

  setGitlabConnection({ url: input.url, token: input.token, insecureTls: input.insecureTls });

  return {
    ok: true,
    identity: { username: me.username, name: me.name ?? null },
    scopes,
    warnings,
  };
}

async function testGithub(input: z.infer<typeof GithubTestSchema>): Promise<TestResult> {
  const octokit = createGithubApi(input.token, input.apiUrl);
  const res = await octokit.request("GET /user");
  const scopesHeader = res.headers["x-oauth-scopes"];
  const scopes = typeof scopesHeader === "string" ? scopesHeader.split(",").map((s) => s.trim()).filter(Boolean) : null;

  const warnings: string[] = [];
  if (scopes) {
    if (!scopes.includes("repo")) {
      warnings.push("Token lacks the `repo` scope — repository creation, push, and secrets will fail.");
    }
  } else {
    warnings.push(
      "Fine-grained token detected — its scopes can't be listed up front; permissions are validated per-repository during the run.",
    );
  }

  setGithubConnection({ token: input.token, apiUrl: input.apiUrl });

  return {
    ok: true,
    identity: { username: res.data.login, name: res.data.name ?? null },
    scopes,
    warnings,
  };
}

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request: " + parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
  }

  try {
    const result =
      parsed.data.kind === "gitlab" ? await testGitlab(parsed.data) : await testGithub(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    // The token was already registered with the global redactor inside
    // createGitlabApi/createGithubApi above, so this scrubs it if an error
    // ever echoed it back (e.g. in a request URL) — never send tokens to the browser.
    const message = redact(err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: `Connection test failed: ${message}` }, { status: 200 });
  }
}
