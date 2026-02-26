import { beforeAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import {
  properties,
  propertyParties,
  propertyTimelineEvents,
  propertyUserLinks,
  users,
} from "../src/db/schema";
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

const ownerPayload = () => ({
  firstName: "Lucie",
  lastName: "Moreau",
  phone: "0611223344",
  email: `owner.${crypto.randomUUID()}@monimmo.fr`,
});

describe("properties endpoints", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("crée un bien avec propriétaire et force le statut PROSPECTION", async () => {
    const token = await loginAndGetAccessToken();
    const owner = ownerPayload();
    const response = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Maison de ville",
          city: "Bordeaux",
          postalCode: "33000",
          address: "10 rue du Port",
          owner,
        }),
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.title).toBe("Maison de ville");
    expect(payload.orgId).toBe("org_demo");
    expect(payload.status).toBe("PROSPECTION");

    const ownerUser = await db.query.users.findFirst({
      where: eq(users.email, owner.email.toLowerCase()),
    });
    expect(ownerUser?.phone).toBe(owner.phone);

    const ownerLink = await db.query.propertyUserLinks.findFirst({
      where: and(
        eq(propertyUserLinks.propertyId, payload.id),
        eq(propertyUserLinks.userId, ownerUser?.id ?? ""),
      ),
    });
    expect(ownerLink?.role).toBe("OWNER");
  });

  it("liste les biens avec pagination cursor", async () => {
    const token = await loginAndGetAccessToken();

    await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `Bien A ${crypto.randomUUID()}`,
          city: "Lyon",
          postalCode: "69001",
          address: "1 quai Jules Courmont",
          owner: ownerPayload(),
        }),
      }),
    );
    await Bun.sleep(2);

    await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `Bien B ${crypto.randomUUID()}`,
          city: "Lyon",
          postalCode: "69002",
          address: "12 rue de Brest",
          owner: ownerPayload(),
        }),
      }),
    );
    await Bun.sleep(2);

    await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `Bien C ${crypto.randomUUID()}`,
          city: "Lyon",
          postalCode: "69003",
          address: "3 rue Paul Bert",
          owner: ownerPayload(),
        }),
      }),
    );

    const page1 = await createApp().fetch(
      new Request("http://localhost/properties?limit=2", {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );
    expect(page1.status).toBe(200);
    const page1Payload = await page1.json();
    expect(page1Payload.items.length).toBe(2);
    expect(typeof page1Payload.nextCursor).toBe("string");

    const page2 = await createApp().fetch(
      new Request(`http://localhost/properties?limit=2&cursor=${page1Payload.nextCursor}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );
    expect(page2.status).toBe(200);
    const page2Payload = await page2.json();
    expect(page2Payload.items.length).toBeGreaterThan(0);
  });

  it("lit et met à jour un bien", async () => {
    const token = await loginAndGetAccessToken();
    const createResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Bien à modifier",
          city: "Nantes",
          postalCode: "44000",
          address: "9 allée Flesselles",
          owner: ownerPayload(),
        }),
      }),
    );
    const created = await createResponse.json();

    const getResponse = await createApp().fetch(
      new Request(`http://localhost/properties/${created.id}`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(getResponse.status).toBe(200);

    const patchResponse = await createApp().fetch(
      new Request(`http://localhost/properties/${created.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Bien modifié",
          city: "Rennes",
          address: "11 rue Le Bastard",
        }),
      }),
    );

    expect(patchResponse.status).toBe(200);
    const patched = await patchResponse.json();
    expect(patched.title).toBe("Bien modifié");
    expect(patched.city).toBe("Rennes");
  });

  it("met à jour le statut et crée un événement timeline", async () => {
    const token = await loginAndGetAccessToken();
    const createResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Bien statut",
          city: "Lille",
          postalCode: "59000",
          address: "4 rue Faidherbe",
          owner: ownerPayload(),
        }),
      }),
    );
    const created = await createResponse.json();

    const statusResponse = await createApp().fetch(
      new Request(`http://localhost/properties/${created.id}/status`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: "MANDAT_SIGNE",
        }),
      }),
    );

    expect(statusResponse.status).toBe(200);
    const statusPayload = await statusResponse.json();
    expect(statusPayload.status).toBe("MANDAT_SIGNE");

    const dbProperty = await db.query.properties.findFirst({
      where: eq(properties.id, created.id),
    });
    expect(dbProperty?.status).toBe("MANDAT_SIGNE");

    const timelineEvent = await db.query.propertyTimelineEvents.findFirst({
      where: and(
        eq(propertyTimelineEvents.propertyId, created.id),
        eq(propertyTimelineEvents.eventType, "PROPERTY_STATUS_CHANGED"),
      ),
      orderBy: (fields, operators) => [operators.desc(fields.createdAt)],
    });

    expect(timelineEvent).not.toBeNull();
    expect(timelineEvent?.payload).toContain("\"from\":\"PROSPECTION\"");
    expect(timelineEvent?.payload).toContain("\"to\":\"MANDAT_SIGNE\"");
  });

  it("retourne 401 sans token", async () => {
    const response = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("ajoute un participant à un bien", async () => {
    const token = await loginAndGetAccessToken();

    const createResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Bien participant",
          city: "Nice",
          postalCode: "06000",
          address: "18 avenue Jean Médecin",
          owner: ownerPayload(),
        }),
      }),
    );
    const created = await createResponse.json();

    const participantResponse = await createApp().fetch(
      new Request(`http://localhost/properties/${created.id}/participants`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contactId: "contact_123",
          role: "VENDEUR",
        }),
      }),
    );

    expect(participantResponse.status).toBe(201);
    const participantPayload = await participantResponse.json();
    expect(participantPayload.propertyId).toBe(created.id);
    expect(participantPayload.contactId).toBe("contact_123");
    expect(participantPayload.role).toBe("VENDEUR");

    const dbParticipant = await db.query.propertyParties.findFirst({
      where: and(
        eq(propertyParties.propertyId, created.id),
        eq(propertyParties.contactId, "contact_123"),
      ),
    });
    expect(dbParticipant).not.toBeNull();
  });

  it("retourne 404 sur un bien inexistant", async () => {
    const token = await loginAndGetAccessToken();
    const response = await createApp().fetch(
      new Request("http://localhost/properties/inconnu", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      code: "PROPERTY_NOT_FOUND",
      message: "Bien introuvable",
    });
  });
});
