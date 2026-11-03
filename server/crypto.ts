import crypto from "crypto";

// ─── Secret encryption at rest ────────────────────────────────────────────────
// AES-256-GCM. Values are stored as "enc:v1:<iv>:<tag>:<ciphertext>" (base64).
// Legacy plaintext values (no prefix) are read as-is and re-encrypted on next write.

const PREFIX = "enc:v1:";

function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw) {
    if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) return b64;
    // Any other strong random string (e.g. a host-generated secret) is hashed to 32 bytes
    if (raw.length < 32) throw new Error("ENCRYPTION_KEY is too short — use at least 32 random characters.");
    return crypto.createHash("sha256").update(raw).digest();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY must be set in production — refusing to store secrets unencrypted.");
  }
  // Dev only: deterministic key so local data stays readable across restarts
  return crypto.createHash("sha256").update("tradeai-dev-only-encryption-key").digest();
}

const KEY = loadKey();

export function encryptSecret(value: string | null | undefined): string | null | undefined {
  if (value == null || value === "" || value.startsWith(PREFIX)) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(value: string | null | undefined): string | null | undefined {
  if (value == null || !value.startsWith(PREFIX)) return value;
  try {
    const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    console.error("[Crypto] Failed to decrypt a stored secret — wrong ENCRYPTION_KEY?");
    return null;
  }
}

/** Settings fields that hold credentials. Never sent to the browser, always encrypted at rest. */
export const SECRET_SETTING_FIELDS = [
  "mql5Password", "brokerApiKey", "smtpPass",
  "openaiApiKey", "anthropicApiKey", "geminiApiKey", "groqApiKey", "perplexityApiKey", "xaiApiKey",
] as const;

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("hex");
}
