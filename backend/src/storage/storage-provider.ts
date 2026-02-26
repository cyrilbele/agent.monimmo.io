export type StoragePutObjectInput = {
  key: string;
  data: ArrayBuffer | Uint8Array | string;
  contentType?: string;
};

export type StorageObjectMetadata = {
  key: string;
  size: number;
  contentType?: string;
};

export interface StorageProvider {
  putObject(input: StoragePutObjectInput): Promise<StorageObjectMetadata>;
  getDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}

