import { beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { aiCallLogsService } from "../src/ai/call-logs";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { aiCallLogs, organizations } from "../src/db/schema";
import { createApp } from "../src/server";

const registerAndGetToken = async (email: string): Promise<string> => {
  const response = await createApp().fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: "MonimmoPwd123!",
        firstName: "Agent",
        lastName: "Test",
      }),
    }),
  );

  expect(response.status).toBe(201);
  const payload = await response.json();
  return payload.accessToken as string;
};

const getOrgId = async (accessToken: string): Promise<string> => {
  const response = await createApp().fetch(
    new Request("http://localhost/me", {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    }),
  );

  expect(response.status).toBe(200);
  const payload = await response.json();
  return payload.user.orgId as string;
};

describe("GET /me/ai-calls", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("retourne uniquement les appels IA de l'organisation courante", async () => {
    const tokenOrgA = await registerAndGetToken(`ai.logs.a.${crypto.randomUUID()}@monimmo.fr`);
    const tokenOrgB = await registerAndGetToken(`ai.logs.b.${crypto.randomUUID()}@monimmo.fr`);
    const orgA = await getOrgId(tokenOrgA);
    const orgB = await getOrgId(tokenOrgB);

    await aiCallLogsService.create({
      orgId: orgA,
      useCase: "PROPERTY_VALUATION",
      prompt: "prompt org a",
      textResponse: "response org a",
      price: 0.0123,
    });
    await aiCallLogsService.create({
      orgId: orgB,
      useCase: "PROPERTY_VALUATION",
      prompt: "prompt org b",
      textResponse: "response org b",
      price: 0.0456,
    });

    const responseOrgA = await createApp().fetch(
      new Request("http://localhost/me/ai-calls?limit=50", {
        method: "GET",
        headers: {
          authorization: `Bearer ${tokenOrgA}`,
        },
      }),
    );
    expect(responseOrgA.status).toBe(200);
    const payloadOrgA = await responseOrgA.json();

    expect(Array.isArray(payloadOrgA.items)).toBe(true);
    expect(payloadOrgA.items.length).toBeGreaterThan(0);
    expect(payloadOrgA.items.some((item: { prompt: string }) => item.prompt === "prompt org a")).toBe(
      true,
    );
    expect(payloadOrgA.items.some((item: { prompt: string }) => item.prompt === "prompt org b")).toBe(
      false,
    );
    expect(payloadOrgA.items.every((item: { orgId: string }) => item.orgId === orgA)).toBe(true);
  });

  it("autorise l'accès aux agents", async () => {
    const token = await registerAndGetToken(`ai.logs.agent.${crypto.randomUUID()}@monimmo.fr`);
    const response = await createApp().fetch(
      new Request("http://localhost/me/ai-calls?limit=20", {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.items)).toBe(true);
  });
});

describe("aiCallLogsService", () => {
  it("conserve le brut en base et expose la version caviardée", async () => {
    const orgId = `org_ai_${crypto.randomUUID()}`;
    await db.insert(organizations).values({
      id: orgId,
      name: "Org AI logs test",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const now = new Date("2026-03-01T00:00:00.000Z");

    const created = await aiCallLogsService.create({
      orgId,
      useCase: "PROPERTY_VALUATION",
      prompt: "Contact: lea.dupont@monimmo.fr - 0611223344 - 15 rue de la Paix 75002 Paris",
      textResponse: "Réponse pour lea.dupont@monimmo.fr",
      price: 0.01,
      createdAt: now,
    });

    expect(created.prompt).toContain("[EMAIL_REDACTED]");
    expect(created.textResponse).toContain("[EMAIL_REDACTED]");

    const row = await db.query.aiCallLogs.findFirst({
      where: eq(aiCallLogs.id, created.id),
    });
    expect(row).not.toBeNull();
    expect(row?.prompt).toContain("lea.dupont@monimmo.fr");
    expect(row?.promptRedacted).toContain("[EMAIL_REDACTED]");
    expect(row?.responseTextRedacted).toContain("[EMAIL_REDACTED]");

    const listed = await aiCallLogsService.list({
      orgId,
      limit: 10,
    });
    const listedItem = listed.items.find((item) => item.id === created.id);
    expect(listedItem).toBeDefined();
    expect(listedItem?.prompt).toContain("[EMAIL_REDACTED]");
    expect(listedItem?.prompt).not.toContain("lea.dupont@monimmo.fr");
  });

  it("supprime les logs expirés", async () => {
    const orgId = `org_ai_${crypto.randomUUID()}`;
    await db.insert(organizations).values({
      id: orgId,
      name: "Org AI logs purge test",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const createdAt = new Date("2025-10-01T00:00:00.000Z");
    const now = new Date("2026-03-01T00:00:00.000Z");

    const created = await aiCallLogsService.create({
      orgId,
      useCase: "PROPERTY_VALUATION",
      prompt: "prompt",
      textResponse: "response",
      price: 0.01,
      createdAt,
    });

    const purge = await aiCallLogsService.purgeExpired({ now });
    expect(purge.deleted).toBeGreaterThan(0);

    const row = await db.query.aiCallLogs.findFirst({
      where: eq(aiCallLogs.id, created.id),
    });
    expect(row).toBeUndefined();
  });
});
