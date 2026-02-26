import { beforeAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { aiJobsService } from "../src/ai";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { reviewQueueItems, vocals } from "../src/db/schema";
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

describe("vocals endpoints + AI rules", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("upload/list/get/patch un vocal", async () => {
    const token = await loginAndGetAccessToken();

    const uploadResponse = await createApp().fetch(
      new Request("http://localhost/vocals/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileName: "note-client.m4a",
          mimeType: "audio/m4a",
          size: 2048,
        }),
      }),
    );

    expect(uploadResponse.status).toBe(201);
    const uploaded = await uploadResponse.json();
    expect(uploaded.status).toBe("UPLOADED");

    const listResponse = await createApp().fetch(
      new Request("http://localhost/vocals?limit=20", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(listResponse.status).toBe(200);
    const listed = await listResponse.json();
    expect(listed.items.some((item: { id: string }) => item.id === uploaded.id)).toBeTrue();

    const patchResponse = await createApp().fetch(
      new Request(`http://localhost/vocals/${uploaded.id}`, {
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

    const transcribeResponse = await createApp().fetch(
      new Request(`http://localhost/vocals/${uploaded.id}/transcribe`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(transcribeResponse.status).toBe(202);

    const insightsResponse = await createApp().fetch(
      new Request(`http://localhost/vocals/${uploaded.id}/extract-insights`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(insightsResponse.status).toBe(202);
  });

  it("applique les règles review queue sur transcript vide/faible confiance et parse les insights", async () => {
    const token = await loginAndGetAccessToken();

    const uploadSilence = await createApp().fetch(
      new Request("http://localhost/vocals/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileName: "silence-note.m4a",
          mimeType: "audio/m4a",
          size: 1024,
        }),
      }),
    );
    const silenceVocal = await uploadSilence.json();

    const transcribeResult = await aiJobsService.transcribeVocal({
      orgId: "org_demo",
      vocalId: silenceVocal.id,
    });
    expect(transcribeResult.status).toBe("REVIEW_REQUIRED");

    const emptyReview = await db.query.reviewQueueItems.findFirst({
      where: and(
        eq(reviewQueueItems.orgId, "org_demo"),
        eq(reviewQueueItems.itemType, "VOCAL"),
        eq(reviewQueueItems.itemId, silenceVocal.id),
        eq(reviewQueueItems.reason, "VOCAL_EMPTY_TRANSCRIPT"),
      ),
    });
    expect(emptyReview).toBeDefined();

    const extractResult = await aiJobsService.extractVocalInsights({
      orgId: "org_demo",
      vocalId: silenceVocal.id,
    });
    expect(extractResult.status).toBe("REVIEW_REQUIRED");

    const uploadNormal = await createApp().fetch(
      new Request("http://localhost/vocals/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: "property_demo",
          fileName: "appel-client-budget-350000.m4a",
          mimeType: "audio/m4a",
          size: 2048,
        }),
      }),
    );
    const normalVocal = await uploadNormal.json();

    const transcribed = await aiJobsService.transcribeVocal({
      orgId: "org_demo",
      vocalId: normalVocal.id,
    });
    expect(transcribed.status).toBe("TRANSCRIBED");

    const insights = await aiJobsService.extractVocalInsights({
      orgId: "org_demo",
      vocalId: normalVocal.id,
    });
    expect(["INSIGHTS_READY", "REVIEW_REQUIRED"]).toContain(insights.status);

    const dbVocal = await db.query.vocals.findFirst({
      where: and(eq(vocals.id, normalVocal.id), eq(vocals.orgId, "org_demo")),
    });
    expect(dbVocal?.insights).toBeString();
  });
});
