import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const KEY_PATH = path.join(DATA_DIR, ".key");

function loadOrCreateKey(): Buffer {
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(KEY_PATH)) {
    return readFileSync(KEY_PATH);
  }
  const key = randomBytes(32);
  writeFileSync(KEY_PATH, key, { mode: 0o600 });
  return key;
}

declare global {
  // eslint-disable-next-line no-var
  var __glab2ghKey: Buffer | undefined;
}

function getKey(): Buffer {
  if (!globalThis.__glab2ghKey) {
    globalThis.__glab2ghKey = loadOrCreateKey();
  }
  return globalThis.__glab2ghKey;
}

/** AES-256-GCM, encoded as base64(iv[12] || authTag[16] || ciphertext). */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decrypt(encoded: string): string {
  const key = getKey();
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
}
