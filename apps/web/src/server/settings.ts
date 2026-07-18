import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import { encrypt, decrypt } from "./crypto";

function setSetting(key: string, value: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value_encrypted, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_encrypted = excluded.value_encrypted, updated_at = excluded.updated_at`,
    )
    .run(key, encrypt(JSON.stringify(value)), new Date().toISOString());
}

function getSetting<T>(key: string): T | undefined {
  const row = getDb().prepare("SELECT value_encrypted FROM settings WHERE key = ?").get(key) as
    | { value_encrypted: string }
    | undefined;
  if (!row) return undefined;
  return JSON.parse(decrypt(row.value_encrypted)) as T;
}

function deleteSetting(key: string): void {
  getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
}

export interface GitlabConnectionSettings {
  url: string;
  token: string;
  insecureTls: boolean;
}

export interface GithubConnectionSettings {
  token: string;
  apiUrl: string;
}

const KEY_GITLAB = "gitlab_connection";
const KEY_GITHUB = "github_connection";
const KEY_DEFAULT_OPTIONS = "default_options";
const KEY_AUTH_SESSION_SECRET = "auth_session_secret";

export function getGitlabConnection(): GitlabConnectionSettings | undefined {
  return getSetting<GitlabConnectionSettings>(KEY_GITLAB);
}
export function setGitlabConnection(v: GitlabConnectionSettings): void {
  setSetting(KEY_GITLAB, v);
}

export function getGithubConnection(): GithubConnectionSettings | undefined {
  return getSetting<GithubConnectionSettings>(KEY_GITHUB);
}
export function setGithubConnection(v: GithubConnectionSettings): void {
  setSetting(KEY_GITHUB, v);
}

export function forgetCredentials(): void {
  deleteSetting(KEY_GITLAB);
  deleteSetting(KEY_GITHUB);
}

export function getDefaultOptions<T>(): T | undefined {
  return getSetting<T>(KEY_DEFAULT_OPTIONS);
}
export function setDefaultOptions(v: unknown): void {
  setSetting(KEY_DEFAULT_OPTIONS, v);
}

/** Random per-install secret used to sign the auth session cookie (see server/auth.ts). */
export function getOrCreateAuthSessionSecret(): string {
  const existing = getSetting<string>(KEY_AUTH_SESSION_SECRET);
  if (existing) return existing;
  const fresh = randomBytes(32).toString("hex");
  setSetting(KEY_AUTH_SESSION_SECRET, fresh);
  return fresh;
}
