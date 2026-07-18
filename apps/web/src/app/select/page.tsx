import { redirect } from "next/navigation";
import { getGitlabConnection, getGithubConnection } from "@/server/settings";
import { SelectClient } from "./select-client";

// Connection status is read from SQLite at request time and can change any
// time the user hits /setup — this must never be frozen into a static build.
export const dynamic = "force-dynamic";

export default async function SelectPage() {
  if (!getGitlabConnection() || !getGithubConnection()) {
    redirect("/setup");
  }
  return <SelectClient />;
}
