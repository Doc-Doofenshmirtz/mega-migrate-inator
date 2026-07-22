import Link from "next/link";
import { listAccessJobs } from "@/server/accessJobs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { AutoRefresh } from "@/components/auto-refresh";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, BadgeTone> = {
  running: "accent",
  cancelling: "warning",
  completed: "success",
  cancelled: "warning",
  interrupted: "danger",
};
const ACTIVE_STATUSES = new Set(["running", "cancelling"]);

export default function GitlabAccessJobsPage() {
  const jobs = listAccessJobs("gitlab");
  const hasActive = jobs.some((job) => ACTIVE_STATUSES.has(job.status));

  return (
    <div className="space-y-6">
      <AutoRefresh active={hasActive} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">GitLab access jobs</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            History of bulk member add/remove jobs.
          </p>
        </div>
        <Link href="/access/gitlab/manage">
          <Button>New access job</Button>
        </Link>
      </div>

      {jobs.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              No access jobs yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/access/gitlab/jobs/${job.id}`}
                className="flex items-center gap-3 px-4 py-3 text-sm border-b last:border-b-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate">{new Date(job.createdAt).toLocaleString()}</div>
                  <div className="text-xs truncate" style={{ color: "var(--color-muted)" }}>
                    {job.action === "add" ? "Add" : "Remove"} · access level {job.role ?? "—"}
                  </div>
                </div>
                <div style={{ color: "var(--color-muted)" }}>
                  {job.succeeded}/{job.total} done
                  {job.failed > 0 ? `, ${job.failed} failed` : ""}
                </div>
                <Badge tone={STATUS_TONE[job.status] ?? "neutral"}>{job.status}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
