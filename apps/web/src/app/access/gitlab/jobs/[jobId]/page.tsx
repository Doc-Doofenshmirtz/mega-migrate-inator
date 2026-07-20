import { JobClient } from "@/app/access/job-client";

export default async function GitlabAccessJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <JobClient jobId={jobId} backHref="/access/gitlab/jobs" title="GitLab access job" />;
}
