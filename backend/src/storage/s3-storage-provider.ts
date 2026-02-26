import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  StorageObjectMetadata,
  StorageProvider,
  StoragePutObjectInput,
} from "./storage-provider";

type S3StorageProviderOptions = {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  client?: Pick<S3Client, "send">;
  signUrl?: typeof getSignedUrl;
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

export class S3StorageProvider implements StorageProvider {
  private readonly client: Pick<S3Client, "send">;
  private readonly bucket: string;
  private readonly signUrl: typeof getSignedUrl;

  constructor(options: S3StorageProviderOptions) {
    this.bucket = options.bucket;
    this.signUrl = options.signUrl ?? getSignedUrl;
    this.client =
      options.client ??
      new S3Client({
        region: options.region,
        endpoint: options.endpoint,
        forcePathStyle: options.forcePathStyle,
        credentials:
          options.accessKeyId && options.secretAccessKey
            ? {
                accessKeyId: options.accessKeyId,
                secretAccessKey: options.secretAccessKey,
              }
            : undefined,
      });
  }

  async putObject(input: StoragePutObjectInput): Promise<StorageObjectMetadata> {
    const bytes = toUint8Array(input.data);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: bytes,
        ContentType: input.contentType,
      }),
    );

    return {
      key: input.key,
      size: bytes.byteLength,
      contentType: input.contentType,
    };
  }

  async getDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return this.signUrl(this.client as S3Client, command, { expiresIn: expiresInSeconds });
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}
