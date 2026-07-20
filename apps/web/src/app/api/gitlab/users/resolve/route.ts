import { NextResponse } from "next/server";
import { z } from "zod";
import { gitlabApiFromSettings } from "@/server/clients";
import { errorResponse } from "@/server/apiError";

export const runtime = "nodejs";

const ResolveSchema = z.object({ usernames: z.array(z.string().min(1)).min(1) });

/**
 * GitLab's member write endpoints need a numeric userId — gitbeaker's
 * AddMemberOptions type allows a bare `username` but the client forwards it
 * verbatim with no guaranteed server-side lookup, so the app resolves ids
 * itself before job creation, and gets clean resolved-user objects for the
 * review step in the same round trip.
 */
export async function POST(req: Request) {
  const parsed = ResolveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request: " + parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
  }

  try {
    const api = gitlabApiFromSettings();
    const results = await Promise.all(
      parsed.data.usernames.map(async (username) => {
        const matches = (await api.Users.all({ username })) as any[];
        const exact = matches.find((u) => u.username === username);
        return { username, user: exact ? { id: exact.id, username: exact.username, name: exact.name, avatarUrl: exact.avatar_url } : null };
      }),
    );

    return NextResponse.json({
      resolved: results.filter((r) => r.user).map((r) => r.user),
      notFound: results.filter((r) => !r.user).map((r) => r.username),
    });
  } catch (err) {
    return errorResponse(err, "gitlab.users.resolve");
  }
}
