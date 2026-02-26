import { beforeAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { db } from "../src/db/client";
import { files, messageFileLinks, messages } from "../src/db/schema";
import { createApp } from "../src/server";

const loginAndGetAccessToken = async (): Promise<string> => {
  const response = await createApp().fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: DEMO_AUTH_EMAIL,
        password: DEMO_AUTH_PASSWORD,
      }),
    }),
  );

  const payload = await response.json();
  return payload.accessToken as string;
};

describe("messages endpoints", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("liste les messages avec filtres et expose les attachments fileIds", async () => {
    const now = new Date();
    const messageId = crypto.randomUUID();
    const fileId = crypto.randomUUID();

    await db.insert(messages).values({
      id: messageId,
      orgId: "org_demo",
      propertyId: null,
      channel: "GMAIL",
      sourceProvider: "GMAIL",
      externalId: `test_${messageId}`,
      subject: "Test Gmail",
      body: "Corps du message",
      aiStatus: "PENDING",
      receivedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(files).values({
      id: fileId,
      orgId: "org_demo",
      propertyId: null,
      typeDocument: null,
      fileName: "piece-identite.jpg",
      mimeType: "image/jpeg",
      size: 1000,
      status: "UPLOADED",
      storageKey: `org_demo/${fileId}/piece-identite.jpg`,
      sourceProvider: null,
      externalId: null,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(messageFileLinks).values({
      id: crypto.randomUUID(),
      orgId: "org_demo",
      messageId,
      fileId,
      createdAt: now,
    });

    const token = await loginAndGetAccessToken();
    const response = await createApp().fetch(
      new Request("http://localhost/messages?channel=GMAIL&aiStatus=PENDING&limit=20", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    const target = payload.items.find((item: { id: string }) => item.id === messageId);
    expect(target).toBeDefined();
    expect(target.fileIds).toContain(fileId);
  });

  it("rattache un message à un bien et peut déclencher /run-ai", async () => {
    const now = new Date();
    const messageId = crypto.randomUUID();

    await db.insert(messages).values({
      id: messageId,
      orgId: "org_demo",
      propertyId: null,
      channel: "WHATSAPP",
      sourceProvider: "WHATSAPP",
      externalId: `test_${messageId}`,
      subject: null,
      body: "Message à rattacher",
      aiStatus: "PENDING",
      receivedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const token = await loginAndGetAccessToken();

    const patchResponse = await createApp().fetch(
      new Request(`http://localhost/messages/${messageId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: "property_demo",
        }),
      }),
    );
    expect(patchResponse.status).toBe(200);
    const patched = await patchResponse.json();
    expect(patched.propertyId).toBe("property_demo");
    expect(patched.aiStatus).toBe("PROCESSED");

    const runAiResponse = await createApp().fetch(
      new Request(`http://localhost/messages/${messageId}/run-ai`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(runAiResponse.status).toBe(202);
    const queued = await runAiResponse.json();
    expect(queued.status).toBe("QUEUED");
    expect(typeof queued.jobId).toBe("string");

    const dbMessage = await db.query.messages.findFirst({
      where: and(eq(messages.id, messageId), eq(messages.orgId, "org_demo")),
    });
    expect(dbMessage?.propertyId).toBe("property_demo");
  });
});
