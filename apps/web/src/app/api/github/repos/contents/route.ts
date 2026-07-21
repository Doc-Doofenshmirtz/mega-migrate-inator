import { NextResponse } from "next/server";
import { githubApiFromSettings } from "@/server/clients";
import { errorResponse } from "@/server/apiError";
import type { GithubContentsResponse, GithubFileContent, GithubTreeEntry } from "@/lib/types";

export const runtime = "nodejs";

// Files rendered inline are capped independently of GitHub's own 100MB blob ceiling —
// this is purely about not shipping megabytes of text into the browser for one file.
const MAX_INLINE_CHARS = 1_000_000;

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "pdf", "zip", "tar", "gz", "7z", "rar",
  "exe", "dll", "so", "dylib", "class", "jar", "woff", "woff2", "ttf", "eot", "otf",
  "mp3", "mp4", "mov", "wav", "flac", "psd", "sqlite", "db", "pyc", "o", "a", "node",
]);

function looksBinary(buf: Buffer, filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "svg") return false; // XML — viewable as source
  if (BINARY_EXTENSIONS.has(ext)) return true;
  return buf.subarray(0, 8000).includes(0);
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const owner = params.get("owner");
  const repo = params.get("repo");
  const path = params.get("path") ?? "";
  const ref = params.get("ref") || undefined;
  if (!owner || !repo) {
    return NextResponse.json({ error: "owner and repo query params are required" }, { status: 400 });
  }

  try {
    const octokit = githubApiFromSettings();
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });

    if (Array.isArray(data)) {
      const entries: GithubTreeEntry[] = data
        .map((e) => ({
          name: e.name,
          path: e.path,
          type: (e.type === "dir" || e.type === "symlink" || e.type === "submodule" ? e.type : "file") as GithubTreeEntry["type"],
          size: e.size,
          sha: e.sha,
        }))
        .sort((a, b) => (a.type === "dir") === (b.type === "dir") ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1);
      const body: GithubContentsResponse = { type: "dir", path, entries };
      return NextResponse.json(body);
    }

    if (data.type !== "file") {
      return NextResponse.json({ error: `Unsupported content type: ${data.type}` }, { status: 400 });
    }

    let buf: Buffer;
    if (data.content) {
      buf = Buffer.from(data.content, "base64");
    } else {
      const blob = await octokit.rest.git.getBlob({ owner, repo, file_sha: data.sha });
      buf = Buffer.from(blob.data.content, blob.data.encoding as BufferEncoding);
    }

    const binary = looksBinary(buf, data.name);
    let content: string | null = null;
    let truncated = false;
    if (!binary) {
      content = buf.toString("utf8");
      if (content.length > MAX_INLINE_CHARS) {
        content = content.slice(0, MAX_INLINE_CHARS);
        truncated = true;
      }
    }

    const file: GithubFileContent = {
      path: data.path,
      name: data.name,
      size: data.size,
      sha: data.sha,
      binary,
      truncated,
      content,
      htmlUrl: data.html_url,
      downloadUrl: data.download_url,
    };
    const body: GithubContentsResponse = { type: "file", file };
    return NextResponse.json(body);
  } catch (err) {
    return errorResponse(err, "github.repos.contents");
  }
}
