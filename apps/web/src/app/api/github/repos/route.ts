import { NextResponse } from "next/server";
import { detectOwnerType } from "@glab2gh/core";
import { githubApiFromSettings } from "@/server/clients";
import { errorResponse } from "@/server/apiError";
import type { GithubRepoRef } from "@/lib/types";

export const runtime = "nodejs";

interface RawRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  archived: boolean;
  fork: boolean;
  description: string | null;
  updated_at: string | null;
}

function mapRepo(raw: RawRepo): GithubRepoRef {
  return {
    id: raw.id,
    name: raw.name,
    fullName: raw.full_name,
    private: Boolean(raw.private),
    archived: Boolean(raw.archived),
    fork: Boolean(raw.fork),
    description: raw.description ?? null,
    updatedAt: raw.updated_at ?? null,
  };
}

/**
 * Paginated repo listing for one GitHub owner (user or org) — for the access
 * picker. Unlike GitLab's listProjectsPage, GitHub's list endpoints have no
 * cheap total-page-count, so this returns a `hasMore` boolean (true when a
 * full page came back) rather than a total.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const owner = params.get("owner");
  const page = params.get("page") ? Number(params.get("page")) : 1;
  if (!owner) {
    return NextResponse.json({ error: "owner query param is required" }, { status: 400 });
  }

  try {
    const octokit = githubApiFromSettings();
    const ownerType = await detectOwnerType(octokit, owner);
    const perPage = 50;

    let data: RawRepo[];
    if (ownerType === "Organization") {
      data = (await octokit.rest.repos.listForOrg({ org: owner, per_page: perPage, page, sort: "full_name" })).data as RawRepo[];
    } else {
      const { data: me } = await octokit.rest.users.getAuthenticated();
      // `GET /users/{username}/repos` only ever returns public repos, even when the
      // username is the token's own account — listing the token owner's private repos
      // requires the authenticated-user endpoint instead.
      data =
        me.login.toLowerCase() === owner.toLowerCase()
          ? (
              await octokit.rest.repos.listForAuthenticatedUser({
                per_page: perPage,
                page,
                sort: "full_name",
                affiliation: "owner",
              })
            ).data
          : (await octokit.rest.repos.listForUser({ username: owner, per_page: perPage, page, sort: "full_name" })).data as RawRepo[];
    }

    const repos = data.map(mapRepo);
    return NextResponse.json({ repos, hasMore: data.length === perPage });
  } catch (err) {
    return errorResponse(err, "github.repos");
  }
}
