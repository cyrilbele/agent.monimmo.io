import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const FALLBACK_INTEGRATION_SECRET = randomBytes(32).toString("hex");
let hasWarnedMissingIntegrationSecret = false;

const getKey = (env: Record<string, string | undefined> = process.env): Buffer => {
  const secret = env.INTEGRATION_TOKEN_SECRET?.trim();
  if (secret) {
    return createHash("sha256").update(secret).digest();
  }

  if (env.NODE_ENV === "production") {
    throw new Error("INTEGRATION_TOKEN_SECRET manquant en production");
  }

  if (!hasWarnedMissingIntegrationSecret) {
    hasWarnedMissingIntegrationSecret = true;
    console.warn(
      "[Security] INTEGRATION_TOKEN_SECRET absent: secret ephemere en cours d'utilisation (dev/test uniquement).",
    );
  }

  const fallbackSecret = `INTEGRATION_TOKEN_SECRET:${FALLBACK_INTEGRATION_SECRET}`;
  return createHash("sha256").update(fallbackSecret).digest();
};

export const encryptToken = (
  plainText: string,
  env: Record<string, string | undefined> = process.env,
): string => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, getKey(env), iv);

  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
};

export const decryptToken = (
  cipherText: string,
  env: Record<string, string | undefined> = process.env,
): string => {
  const [ivPart, tagPart, dataPart] = cipherText.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Cipher text invalide");
  }

  const iv = Buffer.from(ivPart, "base64");
  const tag = Buffer.from(tagPart, "base64");
  const data = Buffer.from(dataPart, "base64");

  const decipher = createDecipheriv(ALGO, getKey(env), iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
};
