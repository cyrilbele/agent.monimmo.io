import { beforeAll, describe, expect, it } from "bun:test";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { calendarEvents, organizations, properties, users } from "../src/db/schema";
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

  it("cree un rendez-vous sans créer de lien client implicite sur le bien", async () => {
    const token = await loginDemoAndGetToken();
    const now = new Date();
    const marker = `calendar-client-${crypto.randomUUID().slice(0, 8)}`;
    const propertyId = crypto.randomUUID();
    const clientUserId = crypto.randomUUID();
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
      id: clientUserId,
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
          clientUserId,
          startsAt: "2026-03-12T13:00:00.000Z",
          endsAt: "2026-03-12T14:00:00.000Z",
          address: null,
          comment: "Visite de suivi",
        }),
      }),
    );

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.clientUserId).toBe(clientUserId);
    expect(created.clientFirstName).toBe("Nina");
    expect(created.clientLastName).toBe("Martin");

    const links = await db.query.propertyUserLinks.findMany({
      where: (fields, operators) =>
        operators.and(
          operators.eq(fields.orgId, "org_demo"),
          operators.eq(fields.propertyId, propertyId),
          operators.eq(fields.userId, clientUserId),
        ),
    });
    expect(links).toHaveLength(0);
  });
});
