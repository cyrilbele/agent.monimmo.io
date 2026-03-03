import { beforeAll, describe, expect, it } from "bun:test";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import {
  files,
  organizations,
  properties,
  propertyVisits,
  users,
  vocals,
} from "../src/db/schema";
import { createApp } from "../src/server";

const loginDemoAndGetToken = async (): Promise<string> => {
  const loginResponse = await createApp().fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: DEMO_AUTH_EMAIL,
        password: DEMO_AUTH_PASSWORD,
      }),
    }),
  );
  expect(loginResponse.status).toBe(200);
  const payload = await loginResponse.json();
  return payload.accessToken as string;
};

describe("GET /search", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("retourne des résultats multi-objets", async () => {
    const token = await loginDemoAndGetToken();
    const now = new Date();
    const marker = `global-search-${crypto.randomUUID().slice(0, 8)}`;

    const userId = crypto.randomUUID();
    const propertyId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    const vocalId = crypto.randomUUID();
    const visitId = crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      orgId: "org_demo",
      email: `${marker}@monimmo.fr`,
      firstName: marker,
      lastName: "Contact",
      accountType: "CLIENT",
      role: "AGENT",
      passwordHash: "hash",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(properties).values({
      id: propertyId,
      orgId: "org_demo",
      title: `${marker} - Appartement`,
      city: "Lyon",
      postalCode: "69003",
      address: "10 rue de la République",
      status: "PROSPECTION",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(files).values({
      id: fileId,
      orgId: "org_demo",
      propertyId,
      typeDocument: null,
      fileName: `${marker}-vocal.m4a`,
      mimeType: "audio/mp4",
      size: 4200,
      status: "UPLOADED",
      storageKey: `org_demo/${fileId}/${marker}-vocal.m4a`,
      sourceProvider: null,
      externalId: null,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(vocals).values({
      id: vocalId,
      orgId: "org_demo",
      propertyId,
      fileId,
      status: "TRANSCRIBED",
      transcript: `Transcription ${marker}`,
      summary: `Résumé ${marker}`,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(propertyVisits).values({
      id: visitId,
      orgId: "org_demo",
      propertyId,
      prospectUserId: userId,
      startsAt: now,
      endsAt: new Date(now.getTime() + 30 * 60 * 1000),
      compteRendu: null,
      bonDeVisiteFileId: null,
      createdAt: now,
      updatedAt: now,
    });

    const response = await createApp().fetch(
      new Request(`http://localhost/search?q=${encodeURIComponent(marker)}&limit=20`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.items.some((item: { type: string; id: string }) => item.type === "PROPERTY" && item.id === propertyId)).toBe(true);
    expect(payload.items.some((item: { type: string; id: string }) => item.type === "USER" && item.id === userId)).toBe(true);
    expect(payload.items.some((item: { type: string; id: string }) => item.type === "VOCAL" && item.id === vocalId)).toBe(true);
    expect(payload.items.some((item: { type: string; id: string }) => item.type === "VISIT" && item.id === visitId)).toBe(true);
  });

  it("n'expose pas les objets d'une autre organisation", async () => {
    const token = await loginDemoAndGetToken();
    const now = new Date();
    const marker = `global-scope-${crypto.randomUUID().slice(0, 8)}`;

    const foreignOrgId = `org_${crypto.randomUUID()}`;
    const foreignPropertyId = crypto.randomUUID();

    await db.insert(organizations).values({
      id: foreignOrgId,
      name: "Org étrangère recherche",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(properties).values({
      id: foreignPropertyId,
      orgId: foreignOrgId,
      title: `${marker} bien externe`,
      city: "Paris",
      postalCode: "75001",
      address: "1 rue externe",
      status: "PROSPECTION",
      createdAt: now,
      updatedAt: now,
    });

    const response = await createApp().fetch(
      new Request(`http://localhost/search?q=${encodeURIComponent(marker)}&limit=20`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items.some((item: { id: string }) => item.id === foreignPropertyId)).toBe(false);
  });
});

