import Link from "next/link";
import { getGitlabConnection, getGithubConnection } from "@/server/settings";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default function AccessLandingPage() {
  const githubConfigured = Boolean(getGithubConnection());
  const gitlabConfigured = Boolean(getGitlabConnection());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Access management</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          Add or remove collaborators across one or many repositories at once — kept separate for GitHub and GitLab
          since their APIs and permission models don't match.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>GitHub</CardTitle>
            <CardDescription>Repository collaborators, invitations, and permission levels.</CardDescription>
          </CardHeader>
          <CardFooter>
            {githubConfigured ? (
              <>
                <Link href="/access/github">
                  <Button size="sm">Overview</Button>
                </Link>
                <Link href="/access/github/manage">
                  <Button variant="secondary" size="sm">
                    Manage access
                  </Button>
                </Link>
                <Link href="/access/github/jobs">
                  <Button variant="ghost" size="sm">
                    Job history
                  </Button>
                </Link>
              </>
            ) : (
              <Link href="/setup">
                <Button variant="secondary" size="sm">
                  Connect GitHub →
                </Button>
              </Link>
            )}
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>GitLab</CardTitle>
            <CardDescription>Project members and access levels, including inherited group access.</CardDescription>
          </CardHeader>
          <CardFooter>
            {gitlabConfigured ? (
              <>
                <Link href="/access/gitlab">
                  <Button size="sm">Overview</Button>
                </Link>
                <Link href="/access/gitlab/manage">
                  <Button variant="secondary" size="sm">
                    Manage access
                  </Button>
                </Link>
                <Link href="/access/gitlab/jobs">
                  <Button variant="ghost" size="sm">
                    Job history
                  </Button>
                </Link>
              </>
            ) : (
              <Link href="/setup">
                <Button variant="secondary" size="sm">
                  Connect GitLab →
                </Button>
              </Link>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
