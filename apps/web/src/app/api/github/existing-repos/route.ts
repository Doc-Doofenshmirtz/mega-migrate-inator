import { NextResponse } from "next/server";
import { listExistingRepoNames, detectOwnerType } from "@glab2gh/core";
import { githubApiFromSettings } from "@/server/clients";
import { errorResponse } from "@/server/apiError";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get("owner");
  if (!owner) {
    return NextResponse.json({ error: "owner query param is required" }, { status: 400 });
  }

  try {
    const octokit = githubApiFromSettings();
    const ownerType = await detectOwnerType(octokit, owner);
    const names = await listExistingRepoNames(octokit, owner, ownerType);
    return NextResponse.json({ names: Array.from(names) });
  } catch (err) {
    return errorResponse(err, "github.existingRepos");
  }
}
