import { createRequire } from "node:module";
import type { Octokit } from "octokit";
import type { GitlabVariable } from "../gitlab/variables.js";
import { sanitizeSecretName } from "../util/naming.js";
import { logger } from "../util/logger.js";

// libsodium-wrappers' published ESM build (dist/modules-esm) references a
// sibling file that isn't included in the npm package, which breaks native
// `import` resolution under Node's ESM loader. Loading it via `require`
// forces Node to use the CJS build (dist/modules/libsodium-wrappers.js)
// instead, which works correctly.
const require = createRequire(import.meta.url);
const sodium: typeof import("libsodium-wrappers") = require("libsodium-wrappers");

export interface SecretMigrationOutcome {
  name: string;
  originalKey: string;
  destination: "secret" | "variable";
  environment?: string;
  renamed: boolean;
  fileType: boolean;
  environmentScoped: boolean;
  fellBackToRepoSecret: boolean;
}

export async function encryptForRepo(value: string, publicKey: string): Promise<string> {
  await sodium.ready;
  const messageBytes = sodium.from_string(value);
  const keyBytes = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
  const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
  return sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);
}

function decideDestination(v: GitlabVariable, mode: "secrets" | "variables" | "auto"): "secret" | "variable" {
  if (mode === "secrets") return "secret";
  if (mode === "variables") return "variable";
  // auto: masked or protected -> secret (sensitive); else variable
  return v.masked || v.protected ? "secret" : "variable";
}

async function ensureEnvironment(octokit: Octokit, owner: string, repo: string, environment: string): Promise<boolean> {
  try {
    await octokit.rest.repos.createOrUpdateEnvironment({ owner, repo, environment_name: environment });
    return true;
  } catch (err) {
    logger.warn({ owner, repo, environment }, "could not create/ensure GitHub environment; falling back to repo secret");
    return false;
  }
}

export async function pushVariables(
  octokit: Octokit,
  owner: string,
  repo: string,
  variables: GitlabVariable[],
  mode: "secrets" | "variables" | "auto",
): Promise<SecretMigrationOutcome[]> {
  const outcomes: SecretMigrationOutcome[] = [];

  let repoPublicKey: { key: string; key_id: string } | undefined;
  const ensurePublicKey = async () => {
    if (!repoPublicKey) {
      const { data } = await octokit.rest.actions.getRepoPublicKey({ owner, repo });
      repoPublicKey = data;
    }
    return repoPublicKey;
  };

  for (const v of variables) {
    const { name: sanitizedBase, renamed: baseRenamed } = sanitizeSecretName(v.key);
    const environmentScoped = v.environmentScope !== "*" && v.environmentScope.trim().length > 0;
    const destination = decideDestination(v, mode);

    let finalName = sanitizedBase;
    let environment: string | undefined;
    let fellBackToRepoSecret = false;

    if (environmentScoped && destination === "secret") {
      const envName = v.environmentScope;
      const created = await ensureEnvironment(octokit, owner, repo, envName);
      if (created) {
        environment = envName;
      } else {
        finalName = `${sanitizedBase}__${envName.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
        fellBackToRepoSecret = true;
      }
    } else if (environmentScoped) {
      // GitHub Actions variables have no environment-scoping concept in the same way; suffix instead.
      finalName = `${sanitizedBase}__${v.environmentScope.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
      fellBackToRepoSecret = true;
    }

    if (destination === "secret") {
      const key = await ensurePublicKey();
      const encryptedValue = await encryptForRepo(v.value, key.key);
      if (environment) {
        await octokit.rest.actions.createOrUpdateEnvironmentSecret({
          owner,
          repo,
          environment_name: environment,
          secret_name: finalName,
          encrypted_value: encryptedValue,
          key_id: key.key_id,
        });
      } else {
        await octokit.rest.actions.createOrUpdateRepoSecret({
          owner,
          repo,
          secret_name: finalName,
          encrypted_value: encryptedValue,
          key_id: key.key_id,
        });
      }
    } else {
      try {
        await octokit.rest.actions.createRepoVariable({ owner, repo, name: finalName, value: v.value });
      } catch (err: any) {
        if (err?.status === 409) {
          await octokit.rest.actions.updateRepoVariable({ owner, repo, name: finalName, value: v.value });
        } else {
          throw err;
        }
      }
    }

    outcomes.push({
      name: finalName,
      originalKey: v.key,
      destination,
      environment,
      renamed: baseRenamed || finalName !== sanitizedBase,
      fileType: v.variableType === "file",
      environmentScoped,
      fellBackToRepoSecret,
    });
  }

  return outcomes;
}
