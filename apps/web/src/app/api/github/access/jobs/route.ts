import { NextResponse } from "next/server";
import { z } from "zod";
import { detectOwnerType } from "@glab2gh/core";
import { githubApiFromSettings } from "@/server/clients";
import { createAndStartAccessJob } from "@/server/accessJobs";
import { errorResponse } from "@/server/apiError";

export const runtime = "nodejs";

const CreateGithubAccessJobSchema = z.object({
  action: z.enum(["add", "remove"]),
  repos: z.array(z.object({ owner: z.string().min(1), repo: z.string().min(1) })).min(1),
  usernames: z.array(z.string().min(1)).min(1),
  permission: z.enum(["pull", "triage", "push", "maintain", "admin"]).optional(),
});

export async function POST(req: Request) {
  const parsed = CreateGithubAccessJobSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request: " + parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
  }
  const { action, repos, usernames, permission } = parsed.data;
  if (action === "add" && !permission) {
    return NextResponse.json({ error: "permission is required when action is 'add'" }, { status: 400 });
  }

  try {
    const octokit = githubApiFromSettings();

    // `triage`/`maintain` are only valid on organization-owned repos — GitHub rejects
    // them for personal accounts with a per-task validation error. Check up front so
    // the whole job fails fast with one clear message instead of every task failing
    // individually once it's already running.
    if (action === "add" && (permission === "triage" || permission === "maintain")) {
      const distinctOwners = Array.from(new Map(repos.map((r) => [r.owner.toLowerCase(), r.owner])).values());
      const ownerTypes = await Promise.all(distinctOwners.map(async (o) => [o, await detectOwnerType(octokit, o)] as const));
      const invalidOwners = new Set(ownerTypes.filter(([, t]) => t === "User").map(([o]) => o.toLowerCase()));
      if (invalidOwners.size > 0) {
        const offending = repos.filter((r) => invalidOwners.has(r.owner.toLowerCase())).map((r) => `${r.owner}/${r.repo}`);
        return NextResponse.json(
          {
            error: `Permission "${permission}" is only valid on organization-owned repositories. These are personal accounts and don't support it: ${offending.join(", ")}. Use pull, push, or admin instead.`,
          },
          { status: 400 },
        );
      }
    }

    const tasks = repos.flatMap((r) =>
      usernames.map((username) => ({
        repoRef: `${r.owner}/${r.repo}`,
        repoLabel: `${r.owner}/${r.repo}`,
        memberRef: username,
        memberLabel: username,
      })),
    );
    const { jobId } = createAndStartAccessJob({
      provider: "github",
      action,
      role: action === "add" ? (permission ?? null) : null,
      tasks,
      client: octokit,
    });
    return NextResponse.json({ jobId });
  } catch (err) {
    return errorResponse(err, "github.access.jobs.create");
  }
}
