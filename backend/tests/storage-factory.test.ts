import { describe, expect, it } from "bun:test";
import { HttpError } from "../src/http/errors";
import { LocalStorageProvider } from "../src/storage/local-storage-provider";
import { S3StorageProvider } from "../src/storage/s3-storage-provider";
import {
  createStorageProvider,
  resolveStorageProviderKind,
} from "../src/storage/factory";

describe("storage factory", () => {
  it("sélectionne local en environnement de dev", () => {
    const kind = resolveStorageProviderKind({ NODE_ENV: "development" });
    expect(kind).toBe("local");
  });

  it("sélectionne s3 en environnement de production", () => {
    const kind = resolveStorageProviderKind({ NODE_ENV: "production" });
    expect(kind).toBe("s3");
  });

  it("peut forcer local via env", () => {
    const provider = createStorageProvider({
      NODE_ENV: "production",
      STORAGE_PROVIDER: "local",
      LOCAL_STORAGE_DIR: "/tmp/storage",
      APP_BASE_URL: "http://localhost:3000",
    });

    expect(provider).toBeInstanceOf(LocalStorageProvider);
  });

  it("retourne une erreur claire si S3 est mal configuré", () => {
    expect(() =>
      createStorageProvider({
        NODE_ENV: "production",
        STORAGE_PROVIDER: "s3",
      }),
    ).toThrow(HttpError);
  });

  it("instancie S3 provider quand la config est complète", () => {
    const provider = createStorageProvider({
      NODE_ENV: "production",
      STORAGE_PROVIDER: "s3",
      S3_BUCKET: "bucket",
      AWS_REGION: "eu-west-3",
      AWS_ACCESS_KEY_ID: "x",
      AWS_SECRET_ACCESS_KEY: "y",
    });

    expect(provider).toBeInstanceOf(S3StorageProvider);
  });
});

