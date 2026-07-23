import { NextResponse } from "next/server";
import { encryptForRepo } from "@glab2gh/core";
import { githubApiFromSettings } from "@/server/clients";
import { errorResponse } from "@/server/apiError";
import type { GithubActionsSecretRef, GithubActionsVariableRef } from "@/lib/types";

export const runtime = "nodejs";

// GitHub Actions secret/variable names: letters, digits, underscore; can't start with a digit or GITHUB_.
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function validateName(name: string): string | null {
  if (!NAME_PATTERN.test(name)) {
    return "Name must start with a letter or underscore and contain only letters, digits, and underscores.";
  }
  if (name.toUpperCase().startsWith("GITHUB_")) {
    return "Name can't start with GITHUB_ — that prefix is reserved.";
  }
  return null;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const owner = params.get("owner");
  const repo = params.get("repo");
  if (!owner || !repo) {
    return NextResponse.json({ error: "owner and repo query params are required" }, { status: 400 });
  }

  try {
    const octokit = githubApiFromSettings();
    const [rawSecrets, rawVariables] = await Promise.all([
      octokit.paginate(octokit.rest.actions.listRepoSecrets, { owner, repo, per_page: 100 }),
      octokit.paginate(octokit.rest.actions.listRepoVariables, { owner, repo, per_page: 100 }),
    ]);

    const secrets: GithubActionsSecretRef[] = rawSecrets.map((s) => ({ name: s.name, updatedAt: s.updated_at }));
    const variables: GithubActionsVariableRef[] = rawVariables.map((v) => ({
      name: v.name,
      value: v.value,
      updatedAt: v.updated_at,
    }));

    return NextResponse.json({ secrets, variables });
  } catch (err) {
    return errorResponse(err, "github.repos.secrets.list");
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { owner, repo, kind, name, value } = body as {
      owner?: string;
      repo?: string;
      kind?: "secret" | "variable";
      name?: string;
      value?: string;
    };
    if (!owner || !repo || !kind || !name || typeof value !== "string") {
      return NextResponse.json({ error: "owner, repo, kind, name, and value are required" }, { status: 400 });
    }
    const nameError = validateName(name);
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 });
    }

    const octokit = githubApiFromSettings();

    if (kind === "secret") {
      const { data: publicKey } = await octokit.rest.actions.getRepoPublicKey({ owner, repo });
      const encrypted_value = await encryptForRepo(value, publicKey.key);
      await octokit.rest.actions.createOrUpdateRepoSecret({
        owner,
        repo,
        secret_name: name,
        encrypted_value,
        key_id: publicKey.key_id,
      });
      return NextResponse.json({ ok: true });
    }

    if (kind === "variable") {
      try {
        await octokit.rest.actions.createRepoVariable({ owner, repo, name, value });
      } catch (err: any) {
        if (err?.status === 409) {
          await octokit.rest.actions.updateRepoVariable({ owner, repo, name, value });
        } else {
          throw err;
        }
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "kind must be 'secret' or 'variable'" }, { status: 400 });
  } catch (err) {
    return errorResponse(err, "github.repos.secrets.upsert");
  }
}

export async function DELETE(req: Request) {
  const params = new URL(req.url).searchParams;
  const owner = params.get("owner");
  const repo = params.get("repo");
  const kind = params.get("kind");
  const name = params.get("name");
  if (!owner || !repo || !name || (kind !== "secret" && kind !== "variable")) {
    return NextResponse.json({ error: "owner, repo, name, and kind ('secret' | 'variable') are required" }, { status: 400 });
  }

  try {
    const octokit = githubApiFromSettings();
    if (kind === "secret") {
      await octokit.rest.actions.deleteRepoSecret({ owner, repo, secret_name: name });
    } else {
      await octokit.rest.actions.deleteRepoVariable({ owner, repo, name });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "github.repos.secrets.delete");
  }
}
