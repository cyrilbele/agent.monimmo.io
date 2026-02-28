import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type EnvLike = Record<string, string | undefined>;

export const STORAGE_URL_SIGNATURE_QUERY_PARAM = "sig";

const FALLBACK_STORAGE_URL_SECRET = randomBytes(32).toString("hex");
let hasWarnedForMissingSecret = false;

const getStorageUrlSecret = (env: EnvLike = process.env): string => {
  const explicitSecret = env.STORAGE_URL_SECRET?.trim();
  if (explicitSecret) {
    return explicitSecret;
  }

  if (env.NODE_ENV === "production") {
    throw new Error("STORAGE_URL_SECRET manquant en production");
  }

  if (!hasWarnedForMissingSecret) {
    hasWarnedForMissingSecret = true;
    console.warn(
      "[Security] STORAGE_URL_SECRET absent: secret ephemere en cours d'utilisation (dev/test uniquement).",
    );
  }

  return FALLBACK_STORAGE_URL_SECRET;
};

const toPayload = (input: { key: string; expiresAt: string }): string =>
  `key:${input.key}\nexpiresAt:${input.expiresAt}`;

export const signStorageUrl = (
  input: { key: string; expiresAt: string },
  env: EnvLike = process.env,
): string => {
  const secret = getStorageUrlSecret(env);
  return createHmac("sha256", secret).update(toPayload(input)).digest("base64url");
};

export const verifyStorageUrlSignature = (
  input: { key: string; expiresAt: string; signature: string },
  env: EnvLike = process.env,
): boolean => {
  const expectedSignature = signStorageUrl(
    {
      key: input.key,
      expiresAt: input.expiresAt,
    },
    env,
  );

  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(input.signature);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
};
