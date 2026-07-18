import { getGitlabConnection, getGithubConnection } from "@/server/settings";
import { ConnectionsForm } from "./connections-form";

// Must reflect live SQLite state on every request, not a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const gitlab = getGitlabConnection();
  const github = getGithubConnection();

  return (
    <div className="space-y-6">
      {!gitlab && !github && (
        <div
          className="rounded-lg border-2 border-dashed px-4 py-3"
          style={{ borderColor: "var(--color-accent)" }}
        >
          <div
            className="text-[10px] font-semibold uppercase tracking-widest mb-1"
            style={{ color: "var(--color-accent)" }}
          >
            Exhibit A — the invention
          </div>
          <p className="text-sm italic" style={{ color: "var(--color-muted)" }}>
            &ldquo;Behold! With just one command, every repository from GitLab
            shall be migrated to GitHub... WITH FULL HISTORY!&rdquo;
          </p>
        </div>
      )}
      <div>
        <h1 className="text-xl font-semibold">Connections</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          Enter your GitLab and GitHub credentials once. They&apos;re encrypted at rest and never sent back to
          the browser — every GitLab/GitHub API call happens server-side.
        </p>
      </div>
      <ConnectionsForm
        initialGitlab={gitlab ? { configured: true, url: gitlab.url, insecureTls: gitlab.insecureTls } : { configured: false }}
        initialGithub={github ? { configured: true, apiUrl: github.apiUrl } : { configured: false }}
      />
    </div>
  );
}
