import { beforeAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { aiJobsService } from "../src/ai";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { files, properties, reviewQueueItems, vocals } from "../src/db/schema";
import { createApp } from "../src/server";
import { vocalsService } from "../src/vocals/service";

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
          fileName: "visite-initiale-budget-350000.m4a",
          mimeType: "audio/m4a",
          size: Buffer.from("audio-test").byteLength,
          contentBase64: Buffer.from("audio-test").toString("base64"),
        }),
      }),
    );
    const normalVocal = await uploadNormal.json();

    const transcribed = await aiJobsService.transcribeVocal({
      orgId: "org_demo",
      vocalId: normalVocal.id,
    });
    expect(transcribed.status).toBe("TRANSCRIBED");

    const typeDetection = await aiJobsService.detectVocalType({
      orgId: "org_demo",
      vocalId: normalVocal.id,
    });
    expect(typeDetection.status).toBe("TYPE_CLASSIFIED");

    const propertyExtraction = await aiJobsService.extractInitialVisitPropertyParams({
      orgId: "org_demo",
      vocalId: normalVocal.id,
    });
    expect(propertyExtraction.status).toBe("UPDATED");

    const insights = await aiJobsService.extractVocalInsights({
      orgId: "org_demo",
      vocalId: normalVocal.id,
    });
    expect(["INSIGHTS_READY", "REVIEW_REQUIRED"]).toContain(insights.status);

    const dbVocal = await db.query.vocals.findFirst({
      where: and(eq(vocals.id, normalVocal.id), eq(vocals.orgId, "org_demo")),
    });
    expect(dbVocal?.insights).toBeString();
    expect(dbVocal?.vocalType).toBe("VISITE_INITIALE");

    const updatedProperty = await db.query.properties.findFirst({
      where: and(eq(properties.id, "property_demo"), eq(properties.orgId, "org_demo")),
    });
    expect(updatedProperty?.details).toContain("aiInitialVisit");
  });

  it("marque un vocal abandonné en erreur de traitement finale", async () => {
    const staleDate = new Date(Date.now() - 15 * 60 * 1000);
    const propertyId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    const vocalId = crypto.randomUUID();

    await db.insert(properties).values({
      id: propertyId,
      orgId: "org_demo",
      title: "Bien recovery",
      status: "A_ESTIMER",
      city: "Lyon",
      postalCode: "69003",
      address: "1 rue Test",
      details: "{}",
      createdAt: staleDate,
      updatedAt: staleDate,
    });

    await db.insert(files).values({
      id: fileId,
      orgId: "org_demo",
      propertyId,
      typeDocument: null,
      fileName: "stale-recovery-test.m4a",
      mimeType: "audio/m4a",
      size: 512,
      status: "UPLOADED",
      storageKey: `org_demo/${fileId}/stale-recovery-test.m4a`,
      sourceProvider: null,
      externalId: null,
      createdAt: staleDate,
      updatedAt: staleDate,
    });

    await db.insert(vocals).values({
      id: vocalId,
      orgId: "org_demo",
      propertyId,
      fileId,
      status: "UPLOADED",
      vocalType: null,
      processingError: null,
      processingAttempts: 3,
      transcript: null,
      summary: null,
      insights: null,
      confidence: null,
      createdAt: staleDate,
      updatedAt: staleDate,
    });

    const exhausted = await vocalsService.listRecoveryExhausted({
      staleBefore: new Date(Date.now() - 5 * 60 * 1000),
      minAttempts: 3,
      limit: 20,
    });

    expect(exhausted.some((item) => item.id === vocalId)).toBeTrue();

    await vocalsService.markProcessingFailure({
      orgId: "org_demo",
      id: vocalId,
      step: "TRANSCRIBE",
      message: "Aucune progression depuis plusieurs cycles",
      isFinal: true,
    });

    const updated = await db.query.vocals.findFirst({
      where: and(eq(vocals.id, vocalId), eq(vocals.orgId, "org_demo")),
    });

    expect(updated?.status).toBe("REVIEW_REQUIRED");
    expect(updated?.vocalType).toBe("ERREUR_TRAITEMENT");
    expect(updated?.processingError).toContain("TRANSCRIBE");
  });
});
