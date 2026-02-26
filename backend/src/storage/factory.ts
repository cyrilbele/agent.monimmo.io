import { HttpError } from "../http/errors";
import { LocalStorageProvider } from "./local-storage-provider";
import { S3StorageProvider } from "./s3-storage-provider";
import type { StorageProvider } from "./storage-provider";

export type StorageProviderKind = "local" | "s3";

type EnvLike = Record<string, string | undefined>;

export const resolveStorageProviderKind = (env: EnvLike): StorageProviderKind => {
  const explicit = env.STORAGE_PROVIDER?.toLowerCase();

  if (explicit === "local" || explicit === "s3") {
    return explicit;
  }

  return env.NODE_ENV === "production" ? "s3" : "local";
};

export const createStorageProvider = (env: EnvLike = process.env): StorageProvider => {
  const providerKind = resolveStorageProviderKind(env);

  if (providerKind === "local") {
    return new LocalStorageProvider({
      rootDir: env.LOCAL_STORAGE_DIR ?? "data/storage",
      publicBaseUrl: env.APP_BASE_URL ?? "http://localhost:3000",
    });
  }

  const bucket = env.S3_BUCKET;
  const region = env.AWS_REGION;

  if (!bucket || !region) {
    throw new HttpError(
      500,
      "STORAGE_CONFIG_ERROR",
      "Configuration S3 incomplète",
      {
        required: ["S3_BUCKET", "AWS_REGION"],
      },
    );
  }

  return new S3StorageProvider({
    bucket,
    region,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  });
};

let storageProviderSingleton: StorageProvider | null = null;

export const getStorageProvider = (): StorageProvider => {
  storageProviderSingleton ??= createStorageProvider(process.env);
  return storageProviderSingleton;
};

