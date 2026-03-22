import { beforeAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { businessLinks, calendarEvents, organizations, properties, users } from "../src/db/schema";
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

describe("calendar events endpoints", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("cree puis liste un rendez-vous manuel", async () => {
    const token = await loginDemoAndGetToken();
    const now = new Date();
    const marker = `calendar-rdv-${crypto.randomUUID().slice(0, 8)}`;
    const propertyId = crypto.randomUUID();

    await db.insert(properties).values({
      id: propertyId,
      orgId: "org_demo",
      title: `${marker} Bien`,
      city: "Paris",
      postalCode: "75001",
      address: "10 rue de Rivoli",
      status: "PROSPECTION",
      createdAt: now,
      updatedAt: now,
    });

    const startsAt = new Date("2026-03-10T09:00:00.000Z");
    const endsAt = new Date("2026-03-10T10:00:00.000Z");

    const createResponse = await createApp().fetch(
      new Request("http://localhost/calendar-events", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: `${marker} Notaire`,
          propertyId,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          address: "Etude notariale, 8 rue du Notariat",
          comment: "Signature du compromis",
        }),
      }),
    );

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.propertyId).toBe(propertyId);
    expect(created.propertyTitle).toBe(`${marker} Bien`);
    expect(created.title).toBe(`${marker} Notaire`);
    expect(created.address).toBe("Etude notariale, 8 rue du Notariat");
    expect(created.comment).toBe("Signature du compromis");

    const listResponse = await createApp().fetch(
      new Request(
        `http://localhost/calendar-events?from=${encodeURIComponent("2026-03-10T00:00:00.000Z")}&to=${encodeURIComponent("2026-03-11T00:00:00.000Z")}`,
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      ),
    );

    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    expect(listPayload.items.some((item: { id: string }) => item.id === created.id)).toBe(true);

    const byIdResponse = await createApp().fetch(
      new Request(`http://localhost/calendar-events/${encodeURIComponent(created.id as string)}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );
    expect(byIdResponse.status).toBe(200);
    const byIdPayload = await byIdResponse.json();
    expect(byIdPayload.id).toBe(created.id);
  });

  it("expose un rdv unifié pour une visite via /rdv et /rdv/{id}", async () => {
    const token = await loginDemoAndGetToken();
    const now = new Date();
    const marker = `calendar-rdv-unified-${crypto.randomUUID().slice(0, 8)}`;
    const propertyId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const passwordHash = await Bun.password.hash("temporary-password");

    await db.insert(properties).values({
      id: propertyId,
      orgId: "org_demo",
      title: `${marker} Bien`,
      city: "Nice",
      postalCode: "06000",
      address: "7 rue basse",
      status: "PROSPECTION",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(users).values({
      id: userId,
      orgId: "org_demo",
      firstName: "Lina",
      lastName: "Client",
      email: `${marker}@example.test`,
      phone: "0601020304",
      address: null,
      postalCode: null,
      city: null,
      personalNotes: null,
      accountType: "CLIENT",
      role: "CLIENT",
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    const createVisitResponse = await createApp().fetch(
      new Request(`http://localhost/properties/${encodeURIComponent(propertyId)}/visits`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          prospectUserId: userId,
          startsAt: "2026-03-12T09:00:00.000Z",
          endsAt: "2026-03-12T09:45:00.000Z",
        }),
      }),
    );
    expect(createVisitResponse.status).toBe(201);
    const createdVisit = await createVisitResponse.json();

    const rdvByIdResponse = await createApp().fetch(
      new Request(`http://localhost/rdv/${encodeURIComponent(createdVisit.id as string)}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );
    expect(rdvByIdResponse.status).toBe(200);
    const rdvByIdPayload = await rdvByIdResponse.json();
    expect(rdvByIdPayload.id).toBe(createdVisit.id);
    expect(rdvByIdPayload.rdvType).toBe("VISITE_BIEN");
    expect(rdvByIdPayload.userId).toBe(userId);

    const rdvListResponse = await createApp().fetch(
      new Request(
        "http://localhost/rdv?from=2026-03-12T00:00:00.000Z&to=2026-03-13T00:00:00.000Z",
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      ),
    );
    expect(rdvListResponse.status).toBe(200);
    const rdvListPayload = await rdvListResponse.json();
    expect(
      rdvListPayload.items.some(
        (item: { id: string; rdvType: string }) =>
          item.id === createdVisit.id && item.rdvType === "VISITE_BIEN",
      ),
    ).toBe(true);
  });

  it("n'expose pas les rendez-vous d'une autre organisation", async () => {
    const token = await loginDemoAndGetToken();
    const now = new Date();

    const foreignOrgId = `org_${crypto.randomUUID()}`;
    const foreignPropertyId = crypto.randomUUID();
    const foreignEventId = crypto.randomUUID();

    await db.insert(organizations).values({
      id: foreignOrgId,
      name: "Org externe calendrier",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(properties).values({
      id: foreignPropertyId,
      orgId: foreignOrgId,
      title: "Bien org externe",
      city: "Lyon",
      postalCode: "69001",
      address: "1 rue externe",
      status: "PROSPECTION",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(calendarEvents).values({
      id: foreignEventId,
      orgId: foreignOrgId,
      provider: "MANUAL",
      externalId: `manual_${crypto.randomUUID()}`,
      title: "RDV externe",
      startsAt: new Date("2026-03-10T11:00:00.000Z"),
      endsAt: new Date("2026-03-10T12:00:00.000Z"),
      payload: JSON.stringify({
        kind: "MANUAL_APPOINTMENT",
        propertyId: foreignPropertyId,
        addressOverride: null,
        comment: null,
      }),
      createdAt: now,
      updatedAt: now,
    });

    const listResponse = await createApp().fetch(
      new Request(
        `http://localhost/calendar-events?from=${encodeURIComponent("2026-03-10T00:00:00.000Z")}&to=${encodeURIComponent("2026-03-11T00:00:00.000Z")}`,
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      ),
    );

    expect(listResponse.status).toBe(200);
    const payload = await listResponse.json();
    expect(payload.items.some((item: { id: string }) => item.id === foreignEventId)).toBe(false);
  });

  it("cree un rendez-vous sans créer de lien utilisateur implicite sur le bien", async () => {
    const token = await loginDemoAndGetToken();
    const now = new Date();
    const marker = `calendar-client-${crypto.randomUUID().slice(0, 8)}`;
    const propertyId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const passwordHash = await Bun.password.hash("temporary-password");

    await db.insert(properties).values({
      id: propertyId,
      orgId: "org_demo",
      title: `${marker} Bien`,
      city: "Paris",
      postalCode: "75001",
      address: "14 rue de Rivoli",
      status: "PROSPECTION",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(users).values({
      id: userId,
      orgId: "org_demo",
      firstName: "Nina",
      lastName: "Martin",
      email: `${marker}@example.test`,
      phone: "0601020304",
      address: null,
      postalCode: null,
      city: null,
      personalNotes: null,
      accountType: "CLIENT",
      role: "CLIENT",
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    const createResponse = await createApp().fetch(
      new Request("http://localhost/calendar-events", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: `${marker} Rendez-vous`,
          propertyId,
          userId,
          startsAt: "2026-03-12T13:00:00.000Z",
          endsAt: "2026-03-12T14:00:00.000Z",
          address: null,
          comment: "Visite de suivi",
        }),
      }),
    );

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.userId).toBe(userId);
    expect(created.userFirstName).toBe("Nina");
    expect(created.userLastName).toBe("Martin");

    const links = await db
      .select()
      .from(businessLinks)
      .where(
        and(
          eq(businessLinks.orgId, "org_demo"),
          eq(businessLinks.typeLien, "bien_user"),
          eq(businessLinks.objectId1, propertyId),
          eq(businessLinks.objectId2, userId),
        ),
      );
    expect(links).toHaveLength(0);

    const rdvPropertyLinks = await db
      .select()
      .from(businessLinks)
      .where(
        and(
          eq(businessLinks.orgId, "org_demo"),
          eq(businessLinks.typeLien, "rdv_bien"),
          eq(businessLinks.objectId1, created.id),
          eq(businessLinks.objectId2, propertyId),
        ),
      );
    expect(rdvPropertyLinks).toHaveLength(1);

    const rdvUserLinks = await db
      .select()
      .from(businessLinks)
      .where(
        and(
          eq(businessLinks.orgId, "org_demo"),
          eq(businessLinks.typeLien, "rdv_user"),
          eq(businessLinks.objectId1, created.id),
          eq(businessLinks.objectId2, userId),
        ),
      );
    expect(rdvUserLinks).toHaveLength(1);
  });
});
