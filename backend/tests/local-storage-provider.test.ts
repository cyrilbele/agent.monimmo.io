import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalStorageProvider } from "../src/storage/local-storage-provider";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("LocalStorageProvider", () => {
  it("écrit un objet localement", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "monimmo-storage-"));
    tempDirs.push(rootDir);

    const provider = new LocalStorageProvider({ rootDir });
    const metadata = await provider.putObject({
      key: "docs/mandat.txt",
      data: "hello",
      contentType: "text/plain",
    });

    expect(metadata).toEqual({
      key: "docs/mandat.txt",
      size: 5,
      contentType: "text/plain",
    });

    const fileContent = await readFile(path.join(rootDir, "docs/mandat.txt"), "utf8");
    expect(fileContent).toBe("hello");
  });

  it("génère une URL de téléchargement locale", async () => {
    const provider = new LocalStorageProvider({
      rootDir: "/tmp/fake",
      publicBaseUrl: "http://localhost:3000",
    });

    const url = await provider.getDownloadUrl("docs/mandat.pdf", 600);
    expect(url).toContain("http://localhost:3000/storage/docs%2Fmandat.pdf");
    expect(url).toContain("expiresAt=");
  });

  it("lit un objet local", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "monimmo-storage-"));
    tempDirs.push(rootDir);

    const provider = new LocalStorageProvider({ rootDir });
    await provider.putObject({
      key: "docs/vocal.wav",
      data: "audio",
      contentType: "audio/wav",
    });

    const object = await provider.getObject("docs/vocal.wav");
    expect(object.key).toBe("docs/vocal.wav");
    expect(new TextDecoder().decode(object.data)).toBe("audio");
  });

  it("supprime un objet", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "monimmo-storage-"));
    tempDirs.push(rootDir);

    const provider = new LocalStorageProvider({ rootDir });
    await provider.putObject({
      key: "docs/a-supprimer.txt",
      data: "to-delete",
    });

    await provider.deleteObject("docs/a-supprimer.txt");

    const exists = await Bun.file(path.join(rootDir, "docs/a-supprimer.txt")).exists();
    expect(exists).toBe(false);
  });
});
