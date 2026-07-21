import { NextResponse } from "next/server";
import { ConnectionNotConfiguredError } from "@/server/clients";
import { getGithubConnection } from "@/server/settings";
import { errorResponse } from "@/server/apiError";

export const runtime = "nodejs";

const ARCHIVE_PATH: Record<"zip" | "tar.gz", string> = {
  zip: "zipball",
  "tar.gz": "tarball",
};

/**
 * GitHub's archive endpoints (zipball/tarball) 302 to a pre-signed, unauthenticated
 * codeload.github.com URL — rather than downloading the archive server-side just to
 * stream it back out (memory/timeout risk for large repos), fetch with redirects
 * disabled, grab the Location header, and redirect the browser straight there so
 * the download comes directly from GitHub's CDN.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const owner = params.get("owner");
  const repo = params.get("repo");
  const ref = params.get("ref");
  const format = params.get("format");
  if (!owner || !repo || !ref) {
    return NextResponse.json({ error: "owner, repo, and ref query params are required" }, { status: 400 });
  }
  if (format !== "zip" && format !== "tar.gz") {
    return NextResponse.json({ error: 'format must be "zip" or "tar.gz"' }, { status: 400 });
  }

  try {
    const conn = getGithubConnection();
    if (!conn) throw new ConnectionNotConfiguredError("github");

    const archiveUrl = `${conn.apiUrl.replace(/\/$/, "")}/repos/${owner}/${repo}/${ARCHIVE_PATH[format]}/${encodeURIComponent(ref)}`;
    const res = await fetch(archiveUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        Authorization: `token ${conn.token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "glab2gh",
      },
    });

    const location = res.headers.get("location");
    if (!location || res.status < 300 || res.status >= 400) {
      return NextResponse.json({ error: `GitHub did not return a download link (status ${res.status})` }, { status: 502 });
    }
    return NextResponse.redirect(location);
  } catch (err) {
    return errorResponse(err, "github.repos.archive");
  }
}
