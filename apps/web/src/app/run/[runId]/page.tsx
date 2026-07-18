import { RunClient } from "./run-client";

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <RunClient runId={runId} />;
}
