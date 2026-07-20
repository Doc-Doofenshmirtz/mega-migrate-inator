import { NextResponse } from "next/server";
import { z } from "zod";
import { gitlabApiFromSettings } from "@/server/clients";
import { createAndStartAccessJob } from "@/server/accessJobs";
import { errorResponse } from "@/server/apiError";

export const runtime = "nodejs";

const CreateGitlabAccessJobSchema = z.object({
  action: z.enum(["add", "remove"]),
  repos: z.array(z.object({ projectId: z.union([z.string(), z.number()]), pathWithNamespace: z.string().min(1) })).min(1),
  userIds: z.array(z.object({ id: z.number(), username: z.string().min(1) })).min(1),
  accessLevel: z.number().optional(),
  expiresAt: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = CreateGitlabAccessJobSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request: " + parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
  }
  const { action, repos, userIds, accessLevel, expiresAt } = parsed.data;
  if (action === "add" && !accessLevel) {
    return NextResponse.json({ error: "accessLevel is required when action is 'add'" }, { status: 400 });
  }

  try {
    const api = gitlabApiFromSettings();
    const tasks = repos.flatMap((r) =>
      userIds.map((u) => ({
        repoRef: String(r.projectId),
        repoLabel: r.pathWithNamespace,
        memberRef: String(u.id),
        memberLabel: u.username,
      })),
    );
    const { jobId } = createAndStartAccessJob({
      provider: "gitlab",
      action,
      role: action === "add" ? String(accessLevel) : null,
      expiresAt: action === "add" ? (expiresAt ?? null) : null,
      tasks,
      client: api,
    });
    return NextResponse.json({ jobId });
  } catch (err) {
    return errorResponse(err, "gitlab.access.jobs.create");
  }
}
