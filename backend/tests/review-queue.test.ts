import { beforeAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { messages, reviewQueueItems } from "../src/db/schema";
import { createApp } from "../src/server";
import { reviewQueueService } from "../src/review-queue/service";

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

describe("review queue endpoints", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("liste puis résout un item review", async () => {
    const now = new Date();
    const messageId = crypto.randomUUID();
    await db.insert(messages).values({
      id: messageId,
      orgId: "org_demo",
      propertyId: null,
      channel: "GMAIL",
      sourceProvider: "GMAIL",
      externalId: `rq_${messageId}`,
      subject: "Aide review",
      body: "Message ambigu",
      aiStatus: "REVIEW_REQUIRED",
      receivedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const reviewItem = await reviewQueueService.createOpenItem({
      orgId: "org_demo",
      itemType: "MESSAGE",
      itemId: messageId,
      reason: "MESSAGE_PROPERTY_AMBIGUOUS",
      payload: { confidence: 0.4 },
    });

    const token = await loginAndGetAccessToken();

    const listResponse = await createApp().fetch(
      new Request("http://localhost/review-queue?limit=20", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    expect(listPayload.items.some((item: { id: string }) => item.id === reviewItem.id)).toBeTrue();

    const resolveResponse = await createApp().fetch(
      new Request(`http://localhost/review-queue/${reviewItem.id}/resolve`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resolution: "Rattaché manuellement",
          propertyId: "property_demo",
          note: "Validé agent",
        }),
      }),
    );

    expect(resolveResponse.status).toBe(200);
    const resolved = await resolveResponse.json();
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.resolvedAt).toBeString();

    const dbReview = await db.query.reviewQueueItems.findFirst({
      where: and(eq(reviewQueueItems.id, reviewItem.id), eq(reviewQueueItems.orgId, "org_demo")),
    });
    expect(dbReview?.status).toBe("RESOLVED");

    const dbMessage = await db.query.messages.findFirst({
      where: and(eq(messages.id, messageId), eq(messages.orgId, "org_demo")),
    });
    expect(dbMessage?.propertyId).toBe("property_demo");
    expect(dbMessage?.aiStatus).toBe("PROCESSED");
  });
});
