import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
function getKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw || !/^[a-fA-F0-9]{64}$/.test(raw)) throw new Error("TOKEN_ENCRYPTION_KEY must be 64 hex characters. Generate it with: openssl rand -hex 32");
  return Buffer.from(raw, "hex");
}
export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptSecret(payload: string) {
  const [iv, tag, data] = payload.split(".");
  if (!iv || !tag || !data) throw new Error("Invalid encrypted secret format.");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function newOpaqueToken() { return randomBytes(32).toString("base64url"); }
