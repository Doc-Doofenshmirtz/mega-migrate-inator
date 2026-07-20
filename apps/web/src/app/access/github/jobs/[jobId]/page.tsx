import { JobClient } from "@/app/access/job-client";

export default async function GithubAccessJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <JobClient jobId={jobId} backHref="/access/github/jobs" title="GitHub access job" />;
}
