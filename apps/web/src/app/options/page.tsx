import { redirect } from "next/navigation";
import { getGitlabConnection, getGithubConnection } from "@/server/settings";
import { OptionsClient } from "./options-client";

export const dynamic = "force-dynamic";

export default async function OptionsPage() {
  if (!getGitlabConnection() || !getGithubConnection()) {
    redirect("/setup");
  }
  return <OptionsClient />;
}
