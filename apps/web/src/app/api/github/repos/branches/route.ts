import { NextResponse } from "next/server";
import { githubApiFromSettings } from "@/server/clients";
import { errorResponse } from "@/server/apiError";
import type { GithubBranchRef } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const owner = params.get("owner");
  const repo = params.get("repo");
  if (!owner || !repo) {
    return NextResponse.json({ error: "owner and repo query params are required" }, { status: 400 });
  }

  try {
    const octokit = githubApiFromSettings();
    const [repoInfo, rawBranches] = await Promise.all([
      octokit.rest.repos.get({ owner, repo }),
      octokit.paginate(octokit.rest.repos.listBranches, { owner, repo, per_page: 100 }),
    ]);

    const branches: GithubBranchRef[] = rawBranches.map((b) => ({ name: b.name, protected: b.protected }));
    return NextResponse.json({ branches, defaultBranch: repoInfo.data.default_branch });
  } catch (err) {
    return errorResponse(err, "github.repos.branches");
  }
}
