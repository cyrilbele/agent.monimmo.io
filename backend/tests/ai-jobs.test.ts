import { beforeAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { aiJobsService } from "../src/ai";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { files, messages, reviewQueueItems } from "../src/db/schema";

describe("ai jobs (matching + classification + review queue)", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("rattache automatiquement un message quand le bien est évident", async () => {
    const now = new Date();
    const messageId = crypto.randomUUID();
    await db.insert(messages).values({
      id: messageId,
      orgId: "org_demo",
      propertyId: null,
      channel: "GMAIL",
      sourceProvider: "GMAIL",
      externalId: `ai_msg_${messageId}`,
      subject: "Appartement T3 lumineux",
      body: "Je suis intéressé par votre bien à Lyon 69003.",
      aiStatus: "PENDING",
      receivedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const result = await aiJobsService.processMessage({
      orgId: "org_demo",
      messageId,
    });
    expect(result.status).toBe("PROCESSED");

    const updated = await db.query.messages.findFirst({
      where: and(eq(messages.id, messageId), eq(messages.orgId, "org_demo")),
    });
    expect(updated?.propertyId).toBe("property_demo");
    expect(updated?.aiStatus).toBe("PROCESSED");
  });

  it("envoie en review queue les messages ambigus", async () => {
    const now = new Date();
    const messageId = crypto.randomUUID();
    await db.insert(messages).values({
      id: messageId,
      orgId: "org_demo",
      propertyId: null,
      channel: "GMAIL",
      sourceProvider: "GMAIL",
      externalId: `ai_msg_${messageId}`,
      subject: "Question",
      body: "Pouvez-vous me rappeler ?",
      aiStatus: "PENDING",
      receivedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const result = await aiJobsService.processMessage({
      orgId: "org_demo",
      messageId,
    });
    expect(result.status).toBe("REVIEW_REQUIRED");

    const updated = await db.query.messages.findFirst({
      where: and(eq(messages.id, messageId), eq(messages.orgId, "org_demo")),
    });
    expect(updated?.aiStatus).toBe("REVIEW_REQUIRED");

    const review = await db.query.reviewQueueItems.findFirst({
      where: and(
        eq(reviewQueueItems.orgId, "org_demo"),
        eq(reviewQueueItems.itemType, "MESSAGE"),
        eq(reviewQueueItems.itemId, messageId),
      ),
    });
    expect(review).toBeDefined();
  });

  it("classifie un fichier connu et envoie les cas faibles en review", async () => {
    const now = new Date();
    const fileIdGood = crypto.randomUUID();
    const fileIdUnknown = crypto.randomUUID();

    await db.insert(files).values({
      id: fileIdGood,
      orgId: "org_demo",
      propertyId: null,
      typeDocument: null,
      fileName: "dpe-appartement.pdf",
      mimeType: "application/pdf",
      size: 1000,
      status: "UPLOADED",
      storageKey: `org_demo/${fileIdGood}/dpe-appartement.pdf`,
      sourceProvider: null,
      externalId: null,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(files).values({
      id: fileIdUnknown,
      orgId: "org_demo",
      propertyId: null,
      typeDocument: null,
      fileName: "document-inconnu.bin",
      mimeType: "application/octet-stream",
      size: 1000,
      status: "UPLOADED",
      storageKey: `org_demo/${fileIdUnknown}/document-inconnu.bin`,
      sourceProvider: null,
      externalId: null,
      createdAt: now,
      updatedAt: now,
    });

    const goodResult = await aiJobsService.processFile({
      orgId: "org_demo",
      fileId: fileIdGood,
    });
    expect(goodResult.status).toBe("CLASSIFIED");

    const classified = await db.query.files.findFirst({
      where: and(eq(files.id, fileIdGood), eq(files.orgId, "org_demo")),
    });
    expect(classified?.status).toBe("CLASSIFIED");
    expect(classified?.typeDocument).toBe("DPE");

    const unknownResult = await aiJobsService.processFile({
      orgId: "org_demo",
      fileId: fileIdUnknown,
    });
    expect(unknownResult.status).toBe("REVIEW_REQUIRED");

    const review = await db.query.reviewQueueItems.findFirst({
      where: and(
        eq(reviewQueueItems.orgId, "org_demo"),
        eq(reviewQueueItems.itemType, "FILE"),
        eq(reviewQueueItems.itemId, fileIdUnknown),
      ),
    });
    expect(review).toBeDefined();
  });
});
