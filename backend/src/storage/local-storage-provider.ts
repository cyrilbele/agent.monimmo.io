import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  StorageObjectMetadata,
  StorageProvider,
  StoragePutObjectInput,
} from "./storage-provider";

type LocalStorageProviderOptions = {
  rootDir?: string;
  publicBaseUrl?: string;
};

const toUint8Array = (data: StoragePutObjectInput["data"]): Uint8Array => {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }

  if (data instanceof Uint8Array) {
    return data;
  }

  return new Uint8Array(data);
};

export class LocalStorageProvider implements StorageProvider {
  private readonly rootDir: string;
  private readonly publicBaseUrl: string;

  constructor(options: LocalStorageProviderOptions = {}) {
    this.rootDir = path.resolve(options.rootDir ?? "data/storage");
    this.publicBaseUrl = options.publicBaseUrl ?? "http://localhost:3000";
  }

  private resolveKeyPath(key: string): string {
    const normalizedKey = key.replace(/^\/+/, "");
    const resolvedPath = path.resolve(this.rootDir, normalizedKey);

    if (
      resolvedPath !== this.rootDir &&
      !resolvedPath.startsWith(`${this.rootDir}${path.sep}`)
    ) {
      throw new Error("Storage key invalide");
    }

    return resolvedPath;
  }

  async putObject(input: StoragePutObjectInput): Promise<StorageObjectMetadata> {
    const filePath = this.resolveKeyPath(input.key);
    const bytes = toUint8Array(input.data);

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);

    const fileStat = await stat(filePath);
    return {
      key: input.key,
      size: fileStat.size,
      contentType: input.contentType,
    };
  }

  async getDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    const encodedKey = encodeURIComponent(key);
    return `${this.publicBaseUrl}/storage/${encodedKey}?expiresAt=${encodeURIComponent(expiresAt)}`;
  }

  async deleteObject(key: string): Promise<void> {
    const filePath = this.resolveKeyPath(key);
    await rm(filePath, { force: true });
  }
}

