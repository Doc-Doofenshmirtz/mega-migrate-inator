# glab2gh — The Mega-Migrate-inator

> *"Behold, Perry the Platypus! The Mega-Migrate-inator! With just one command,
> every repository from GitLab shall be migrated to GitHub... WITH FULL
> HISTORY!"*

Yes, alright, fine — it's actually just a bulk-migration tool. But it does
mirror history, LFS objects, CI/CD variables, and a best-effort mapping of
branch protection from GitLab (self-hosted or gitlab.com) to GitHub, then
verifies that source and target refs match afterward. No death rays, but
also no repos left behind. Curse you, manual `git clone --mirror`!

Two ways to activate it:

- **`glab2gh-web`** — a self-hosted browser control panel. Connections, repo
  picker, options, dry-run plan, live progress, and a report — no config file,
  no lair required.
- **`glab2gh` CLI** — the original YAML + env-var driven -inator, still fully
  supported (`packages/cli`), for those who prefer to read the blueprints
  before pulling the lever.

This is a local operator tool, not a hosted service: run it on your own
machine or a trusted box, not as a public multi-tenant deployment. (Even
evil scientists have a blast radius to think about.)

## Web UI — quickest start

```bash
docker compose up
```

Then open **http://localhost:3000**, and the invention shall be unveiled.
Nothing else to configure — GitLab/GitHub credentials are entered in the
browser on first run and encrypted at rest.

Without `docker`, the equivalent is:

```bash
npm install
npm run build --workspace=@glab2gh/core
npm run web:build
npm run web:start   # or: npm run web:dev
```

The web app needs `git` and (optionally) `git-lfs` on `PATH`; the Docker
image installs both.

### About the password prompt on first `docker compose up`

Docker's container networking requires the app to bind `0.0.0.0` *inside*
the container even though `docker-compose.yml` only publishes that port to
`127.0.0.1` on your host (so it's still unreachable from your network by
default). The app can't tell "container-internal 0.0.0.0" apart from "really
exposed 0.0.0.0", and it refuses to bind non-loopback without a password —
see [Security](#security) below. So on first boot, if you haven't set
`GLAB2GH_AUTH_PASSWORD` yourself, the container generates one and prints it
once to `docker compose logs`. Use that to sign in, or set your own:

```yaml
# docker-compose.yml
environment:
  GLAB2GH_AUTH_PASSWORD: "your-password-here"
```

Running the app directly (not via Docker) and leaving `HOST` at its default
(`127.0.0.1`) skips the password entirely — there's no container networking
layer in the way in that case.

## CLI

For anyone who trusts a YAML file more than a button:

```bash
npm install
npm run build --workspace=@glab2gh/core
npm run build --workspace=@glab2gh/cli

export GITLAB_TOKEN=glpat-...
export GITHUB_TOKEN=ghp_...
node packages/cli/dist/index.js plan --config glab2gh.config.yaml
node packages/cli/dist/index.js migrate --config glab2gh.config.yaml
```

See `glab2gh.config.yaml` for the full config shape (GitLab source scope,
GitHub target, per-run toggles). Tokens are never read from that file —
only from `GITLAB_TOKEN`/`GITHUB_TOKEN`.

## Repo layout — the blueprints

```
packages/core/   @glab2gh/core — pure library: discovery, planning, the
                 migration pipeline, git/GitHub/GitLab clients. Used by both
                 the CLI and the web app; has no console I/O of its own.
packages/cli/    @glab2gh/cli — thin commander.js wrapper around core.
apps/web/        @glab2gh/web — the Next.js control panel + the in-process
                 job engine that runs actual migrations (server/engine.ts).
```

## Security — no self-destruct button, but still careful

- Tokens are entered once in the web UI, encrypted at rest (AES-256-GCM,
  key in `apps/web/data/.key`), and never sent back to the browser — every
  GitLab/GitHub call happens server-side.
- The server binds to `127.0.0.1` by default. Binding anywhere else requires
  `GLAB2GH_AUTH_PASSWORD` to be set, or the process refuses to start — this
  app holds tokens that can read and write every repo it's pointed at.
- This is a local tool, not a hardened multi-tenant service: encryption at
  rest protects against casual disk/backup exposure, not a determined local
  attacker with access to the running process or its environment.

## Known scope limits — even an -inator has fine print

- `migrate.wiki`, `migrate.releases`, and `migrate.webhooks` exist as config
  fields (inherited from the original CLI design) but aren't implemented in
  the migration engine yet — the web UI's Options page intentionally omits
  toggles for them rather than showing controls that would do nothing.
- Per-repo overrides in the web UI cover target name and visibility, not
  individual per-repo toggle overrides (CI variables, LFS, etc. are set
  per-run, not per-repo).
- Files over 100 MB are only detected once a repo is actually being migrated
  (GitHub hard-rejects the push) — there's no cheap way to check this from
  the GitLab API alone without cloning, so the web UI's dry-run Plan step
  doesn't pre-block on it the way it does for name collisions. By default
  (`migrate.large_files: warn`) this just produces a warning and the push
  will likely fail; set it to `auto_lfs` to have glab2gh rewrite the local
  mirror clone — converting oversized blobs to Git LFS pointers across all
  refs — before pushing, so the push succeeds. That rewrite only touches the
  local clone that gets pushed to GitHub; the GitLab source history is never
  modified. Requires `git-lfs` on `PATH`; falls back to warn-only otherwise.

*Curse you, edge cases! But at least you're documented.*
