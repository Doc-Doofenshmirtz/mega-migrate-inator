import Link from "next/link";
import { getGitlabConnection, getGithubConnection } from "@/server/settings";
import { listRuns } from "@/server/runs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, BadgeTone> = {
  running: "accent",
  cancelling: "warning",
  completed: "success",
  cancelled: "warning",
  interrupted: "danger",
};

export default async function DashboardPage() {
  const configured = Boolean(getGitlabConnection() && getGithubConnection());
  const runs = listRuns();
  const activeStatuses = new Set(["running", "cancelling"]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Runs</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            Every repository. One command. Full history.
          </p>
        </div>
        <Link href={configured ? "/select" : "/setup"}>
          <Button>New migration</Button>
        </Link>
      </div>

      {runs.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              {configured
                ? "No runs yet — start a new migration to see live progress here."
                : "Set up your GitLab and GitHub connections to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {runs.map((run) => {
              const isActive = activeStatuses.has(run.status);
              return (
                <Link
                  key={run.id}
                  href={isActive ? `/run/${run.id}` : `/report/${run.id}`}
                  className="flex items-center gap-3 px-4 py-3 text-sm border-b last:border-b-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{new Date(run.createdAt).toLocaleString()}</div>
                  </div>
                  <div style={{ color: "var(--color-muted)" }}>
                    {run.succeeded}/{run.total} succeeded
                    {run.failed > 0 ? `, ${run.failed} failed` : ""}
                  </div>
                  <Badge tone={STATUS_TONE[run.status] ?? "neutral"}>{run.status}</Badge>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
