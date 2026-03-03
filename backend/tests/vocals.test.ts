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

const withMockedFetch = async (
  handler: (url: string, init: RequestInit | undefined) => Promise<Response>,
  callback: () => Promise<void>,
): Promise<void> => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      return handler(url, init);
    },
    { preconnect: previousFetch.preconnect },
  ) as typeof fetch;

  try {
    await callback();
  } finally {
    globalThis.fetch = previousFetch;
  }
};

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
    const vocalContent = Buffer.from("fake-vocal-note");

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
          size: vocalContent.byteLength,
          contentBase64: vocalContent.toString("base64"),
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

  it("rejette un upload vocal non audio", async () => {
    const token = await loginAndGetAccessToken();
    const invalidContent = Buffer.from("%PDF-1.4");

    const uploadResponse = await createApp().fetch(
      new Request("http://localhost/vocals/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileName: "contrat.pdf",
          mimeType: "application/pdf",
          size: invalidContent.byteLength,
          contentBase64: invalidContent.toString("base64"),
        }),
      }),
    );

    expect(uploadResponse.status).toBe(400);
    const payload = await uploadResponse.json();
    expect(payload.code).toBe("INVALID_VOCAL_AUDIO_FORMAT");
  });

  it("applique les règles review queue sur transcript vide/faible confiance et parse les insights", async () => {
    const token = await loginAndGetAccessToken();
    const silenceContent = Buffer.from("silence-audio");

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
          size: silenceContent.byteLength,
          contentBase64: silenceContent.toString("base64"),
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

  it("n'envoie pas a la transcription les vocaux legacy invalides", async () => {
    const now = new Date();
    const invalidFileId = crypto.randomUUID();
    const invalidVocalId = crypto.randomUUID();

    await db.insert(files).values({
      id: invalidFileId,
      orgId: "org_demo",
      propertyId: "property_demo",
      typeDocument: null,
      fileName: "piece-jointe.pdf",
      mimeType: "application/pdf",
      size: 10,
      status: "UPLOADED",
      storageKey: `org_demo/${invalidFileId}/piece-jointe.pdf`,
      sourceProvider: null,
      externalId: null,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(vocals).values({
      id: invalidVocalId,
      orgId: "org_demo",
      propertyId: "property_demo",
      fileId: invalidFileId,
      status: "UPLOADED",
      vocalType: null,
      processingError: null,
      processingAttempts: 0,
      transcript: null,
      summary: null,
      insights: null,
      confidence: null,
      createdAt: now,
      updatedAt: now,
    });

    const result = await aiJobsService.transcribeVocal({
      orgId: "org_demo",
      vocalId: invalidVocalId,
    });
    expect(result.status).toBe("REVIEW_REQUIRED");

    const updated = await db.query.vocals.findFirst({
      where: and(eq(vocals.id, invalidVocalId), eq(vocals.orgId, "org_demo")),
    });
    expect(updated?.status).toBe("REVIEW_REQUIRED");
    expect(updated?.vocalType).toBe("ERREUR_TRAITEMENT");
    expect(updated?.processingError).toContain("TRANSCRIBE");

    const review = await db.query.reviewQueueItems.findFirst({
      where: and(
        eq(reviewQueueItems.orgId, "org_demo"),
        eq(reviewQueueItems.itemType, "VOCAL"),
        eq(reviewQueueItems.itemId, invalidVocalId),
        eq(reviewQueueItems.reason, "VOCAL_INVALID_AUDIO_SOURCE"),
      ),
    });
    expect(review).toBeDefined();
  });

  it("bascule en review sans retry quand OpenAI refuse le format audio", async () => {
    const token = await loginAndGetAccessToken();
    const invalidAudioContent = Buffer.from("not-audio-container");

    const uploadResponse = await createApp().fetch(
      new Request("http://localhost/vocals/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileName: "source.m4a",
          mimeType: "audio/m4a",
          size: invalidAudioContent.byteLength,
          contentBase64: invalidAudioContent.toString("base64"),
        }),
      }),
    );

    expect(uploadResponse.status).toBe(201);
    const uploaded = (await uploadResponse.json()) as { id: string };

    const previousEnv = {
      AI_PROVIDER: process.env.AI_PROVIDER,
      AI_ENGINE: process.env.AI_ENGINE,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    };

    process.env.AI_PROVIDER = "openai";
    delete process.env.AI_ENGINE;
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_BASE_URL = "https://openai.example.test/v1";

    try {
      await withMockedFetch(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                message:
                  "Invalid file format. Supported formats: ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm']",
              },
            }),
            {
              status: 400,
              headers: { "content-type": "application/json; charset=utf-8" },
            },
          ),
        async () => {
          const result = await aiJobsService.transcribeVocal({
            orgId: "org_demo",
            vocalId: uploaded.id,
          });
          expect(result.status).toBe("REVIEW_REQUIRED");
        },
      );
    } finally {
      if (previousEnv.AI_PROVIDER === undefined) {
        delete process.env.AI_PROVIDER;
      } else {
        process.env.AI_PROVIDER = previousEnv.AI_PROVIDER;
      }

      if (previousEnv.AI_ENGINE === undefined) {
        delete process.env.AI_ENGINE;
      } else {
        process.env.AI_ENGINE = previousEnv.AI_ENGINE;
      }

      if (previousEnv.OPENAI_API_KEY === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousEnv.OPENAI_API_KEY;
      }

      if (previousEnv.OPENAI_BASE_URL === undefined) {
        delete process.env.OPENAI_BASE_URL;
      } else {
        process.env.OPENAI_BASE_URL = previousEnv.OPENAI_BASE_URL;
      }
    }

    const updated = await db.query.vocals.findFirst({
      where: and(eq(vocals.id, uploaded.id), eq(vocals.orgId, "org_demo")),
    });
    expect(updated?.status).toBe("REVIEW_REQUIRED");
    expect(updated?.vocalType).toBe("ERREUR_TRAITEMENT");
    expect(updated?.processingError).toContain("Invalid file format");

    const review = await db.query.reviewQueueItems.findFirst({
      where: and(
        eq(reviewQueueItems.orgId, "org_demo"),
        eq(reviewQueueItems.itemType, "VOCAL"),
        eq(reviewQueueItems.itemId, uploaded.id),
        eq(reviewQueueItems.reason, "VOCAL_INVALID_AUDIO_SOURCE"),
      ),
    });
    expect(review).toBeDefined();
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
