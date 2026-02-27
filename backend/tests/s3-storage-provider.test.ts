import { describe, expect, it } from "bun:test";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { S3StorageProvider } from "../src/storage/s3-storage-provider";

describe("S3StorageProvider", () => {
  it("envoie un PutObjectCommand sur putObject", async () => {
    const sentCommands: unknown[] = [];
    const provider = new S3StorageProvider({
      bucket: "bucket-test",
      region: "eu-west-3",
      client: {
        send: async (command: unknown) => {
          sentCommands.push(command);
          return {};
        },
      },
    });

    const result = await provider.putObject({
      key: "docs/mandat.pdf",
      data: "content",
      contentType: "application/pdf",
    });

    expect(result.key).toBe("docs/mandat.pdf");
    expect(result.size).toBe(7);
    expect(sentCommands.length).toBe(1);
    expect(sentCommands[0]).toBeInstanceOf(PutObjectCommand);
    expect((sentCommands[0] as PutObjectCommand).input).toEqual({
      Bucket: "bucket-test",
      Key: "docs/mandat.pdf",
      Body: new TextEncoder().encode("content"),
      ContentType: "application/pdf",
    });
  });

  it("utilise un signer pour générer l'URL de download", async () => {
    const provider = new S3StorageProvider({
      bucket: "bucket-test",
      region: "eu-west-3",
      client: {
        send: async () => ({}),
      },
      signUrl: async (_client, command, options) => {
        expect(command).toBeInstanceOf(GetObjectCommand);
        expect((command as unknown as GetObjectCommand).input).toEqual({
          Bucket: "bucket-test",
          Key: "docs/mandat.pdf",
        });
        expect(options?.expiresIn).toBe(600);
        return "https://signed.example/download";
      },
    });

    const url = await provider.getDownloadUrl("docs/mandat.pdf", 600);
    expect(url).toBe("https://signed.example/download");
  });

  it("récupère un objet via GetObjectCommand", async () => {
    const sentCommands: unknown[] = [];
    const provider = new S3StorageProvider({
      bucket: "bucket-test",
      region: "eu-west-3",
      client: {
        send: async (command: unknown) => {
          sentCommands.push(command);
          return {
            Body: {
              async transformToByteArray() {
                return new TextEncoder().encode("audio-content");
              },
            },
            ContentType: "audio/mpeg",
          };
        },
      },
    });

    const object = await provider.getObject("docs/vocal.mp3");
    expect(object.key).toBe("docs/vocal.mp3");
    expect(object.contentType).toBe("audio/mpeg");
    expect(new TextDecoder().decode(object.data)).toBe("audio-content");
    expect(sentCommands[0]).toBeInstanceOf(GetObjectCommand);
  });

  it("envoie un DeleteObjectCommand sur deleteObject", async () => {
    const sentCommands: unknown[] = [];
    const provider = new S3StorageProvider({
      bucket: "bucket-test",
      region: "eu-west-3",
      client: {
        send: async (command: unknown) => {
          sentCommands.push(command);
          return {};
        },
      },
    });

    await provider.deleteObject("docs/to-delete.pdf");

    expect(sentCommands.length).toBe(1);
    expect(sentCommands[0]).toBeInstanceOf(DeleteObjectCommand);
    expect((sentCommands[0] as DeleteObjectCommand).input).toEqual({
      Bucket: "bucket-test",
      Key: "docs/to-delete.pdf",
    });
  });
});
