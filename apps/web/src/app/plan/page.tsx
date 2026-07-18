import { redirect } from "next/navigation";
import { getGitlabConnection, getGithubConnection } from "@/server/settings";
import { PlanClient } from "./plan-client";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  if (!getGitlabConnection() || !getGithubConnection()) {
    redirect("/setup");
  }
  return <PlanClient />;
}
