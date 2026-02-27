import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  StorageGetObjectResult,
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

const streamToUint8Array = async (stream: AsyncIterable<unknown>): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  let total = 0;

  for await (const chunk of stream) {
    let bytes: Uint8Array;
    if (chunk instanceof Uint8Array) {
      bytes = chunk;
    } else if (chunk instanceof ArrayBuffer) {
      bytes = new Uint8Array(chunk);
    } else if (typeof chunk === "string") {
      bytes = new TextEncoder().encode(chunk);
    } else {
      bytes = new Uint8Array(chunk as ArrayBufferLike);
    }
    chunks.push(bytes);
    total += bytes.byteLength;
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
};

const bodyToUint8Array = async (body: unknown): Promise<Uint8Array> => {
  if (body instanceof Uint8Array) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }

  if (typeof body === "string") {
    return new TextEncoder().encode(body);
  }

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;

    const transformToByteArray = record.transformToByteArray;
    if (typeof transformToByteArray === "function") {
      const bytes = await (transformToByteArray as () => Promise<Uint8Array>)();
      return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    }

    const arrayBuffer = record.arrayBuffer;
    if (typeof arrayBuffer === "function") {
      return new Uint8Array(await (arrayBuffer as () => Promise<ArrayBuffer>)());
    }

    if (Symbol.asyncIterator in record) {
      return streamToUint8Array(record as AsyncIterable<unknown>);
    }
  }

  throw new Error("Format de flux S3 non supporté");
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

  async getObject(key: string): Promise<StorageGetObjectResult> {
    const response = (await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    )) as { Body?: unknown; ContentType?: string };

    if (!response.Body) {
      throw new Error("Objet S3 introuvable");
    }

    return {
      key,
      data: await bodyToUint8Array(response.Body),
      contentType: response.ContentType,
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
