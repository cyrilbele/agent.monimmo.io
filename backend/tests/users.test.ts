import { beforeAll, describe, expect, it } from "bun:test";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { organizations, users } from "../src/db/schema";
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

const ensureOrganization = async (orgId: string): Promise<void> => {
  const now = new Date();
  await db
    .insert(organizations)
    .values({
      id: orgId,
      name: `Organisation ${orgId}`,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: organizations.id });
};

describe("users endpoints", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("liste les utilisateurs de l'organisation", async () => {
    const token = await loginAndGetAccessToken();

    const response = await createApp().fetch(
      new Request("http://localhost/users?limit=20", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items.length).toBeGreaterThan(0);
    expect(payload.items[0].orgId).toBe("org_demo");
    expect(typeof payload.items[0].email).toBe("string");
    expect("phone" in payload.items[0]).toBe(true);
    expect("personalNotes" in payload.items[0]).toBe(true);
  });

  it("filtre les contacts avec le paramètre q", async () => {
    const token = await loginAndGetAccessToken();
    const marker = crypto.randomUUID();

    const matchingCreateResponse = await createApp().fetch(
      new Request("http://localhost/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          accountType: "CLIENT",
          firstName: `Claire-${marker}`,
          lastName: "Martin",
          email: `contact.${marker}@monimmo.fr`,
        }),
      }),
    );
    expect(matchingCreateResponse.status).toBe(201);
    const matchingUser = await matchingCreateResponse.json();

    const otherCreateResponse = await createApp().fetch(
      new Request("http://localhost/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          accountType: "CLIENT",
          firstName: `Louis-${crypto.randomUUID()}`,
          lastName: "Dupont",
          email: `contact.${crypto.randomUUID()}@monimmo.fr`,
        }),
      }),
    );
    expect(otherCreateResponse.status).toBe(201);
    const otherUser = await otherCreateResponse.json();

    const searchResponse = await createApp().fetch(
      new Request(`http://localhost/users?limit=100&q=${encodeURIComponent(marker)}`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(searchResponse.status).toBe(200);
    const payload = await searchResponse.json();
    expect(payload.items.some((item: { id: string }) => item.id === matchingUser.id)).toBe(true);
    expect(payload.items.some((item: { id: string }) => item.id === otherUser.id)).toBe(false);
  }, 15000);

  it("n'expose pas en recherche les utilisateurs indexes d'une autre organisation", async () => {
    const token = await loginAndGetAccessToken();
    const marker = `cross-org-${crypto.randomUUID()}`;
    const otherOrgId = `org_other_${crypto.randomUUID()}`;
    const now = new Date();

    await ensureOrganization(otherOrgId);
    await db.insert(users).values({
      id: crypto.randomUUID(),
      orgId: otherOrgId,
      email: `outside.${marker}@monimmo.fr`,
      firstName: `Externe-${marker}`,
      lastName: "Org",
      phone: null,
      address: null,
      postalCode: null,
      city: null,
      personalNotes: null,
      accountType: "CLIENT",
      role: "OWNER",
      passwordHash: "hash",
      createdAt: now,
      updatedAt: now,
    });

    const response = await createApp().fetch(
      new Request(`http://localhost/users?limit=100&q=${encodeURIComponent(marker)}`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(
      payload.items.some(
        (item: { firstName: string; email: string | null }) =>
          String(item.firstName).toLowerCase().includes(marker.toLowerCase()) ||
          String(item.email ?? "").toLowerCase().includes(marker.toLowerCase()),
      ),
    ).toBe(false);
  });

  it("retourne le détail d'un utilisateur", async () => {
    const token = await loginAndGetAccessToken();
    const ownerEmail = `owner.${crypto.randomUUID()}@monimmo.fr`;

    const createOwnerResponse = await createApp().fetch(
      new Request("http://localhost/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: "Lea",
          lastName: "Owner",
          phone: "0600000001",
          email: ownerEmail,
          accountType: "CLIENT",
        }),
      }),
    );
    expect(createOwnerResponse.status).toBe(201);
    const ownerUser = await createOwnerResponse.json();

    const createPropertyResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Bien proprietaire user detail",
          city: "Paris",
          postalCode: "75011",
          address: "19 rue Saint-Maur",
        }),
      }),
    );
    expect(createPropertyResponse.status).toBe(201);
    const createdProperty = await createPropertyResponse.json();

    const linkResponse = await createApp().fetch(
      new Request(`http://localhost/properties/${createdProperty.id}/clients`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: ownerUser.id,
          relationRole: "OWNER",
        }),
      }),
    );
    expect(linkResponse.status).toBe(201);
    const userId = ownerUser.id as string;

    const detailResponse = await createApp().fetch(
      new Request(`http://localhost/users/${userId}`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(detailResponse.status).toBe(200);

    const detailPayload = await detailResponse.json();
    expect(detailPayload.id).toBe(userId);
    expect(detailPayload.orgId).toBe("org_demo");
    expect(typeof detailPayload.updatedAt).toBe("string");
    expect(Array.isArray(detailPayload.linkedProperties)).toBe(true);
    expect(
      detailPayload.linkedProperties.some(
        (item: { relationRole: string; title: string }) =>
          item.relationRole === "OWNER" && item.title === "Bien proprietaire user detail",
      ),
    ).toBe(true);
  });

  it("met a jour les informations utilisateur", async () => {
    const token = await loginAndGetAccessToken();

    const listResponse = await createApp().fetch(
      new Request("http://localhost/users?limit=1", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    const listPayload = await listResponse.json();
    const userId = listPayload.items[0].id as string;

    const patchResponse = await createApp().fetch(
      new Request(`http://localhost/users/${userId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone: "0611122233",
          address: "24 rue de la Republique",
          postalCode: "69002",
          city: "Lyon",
          personalNotes: "Contact prioritaire le soir.",
        }),
      }),
    );

    expect(patchResponse.status).toBe(200);

    const patchPayload = await patchResponse.json();
    expect(patchPayload.phone).toBe("0611122233");
    expect(patchPayload.address).toBe("24 rue de la Republique");
    expect(patchPayload.postalCode).toBe("69002");
    expect(patchPayload.city).toBe("Lyon");
    expect(patchPayload.personalNotes).toBe("Contact prioritaire le soir.");
  });

  it("cree un client avec telephone uniquement", async () => {
    const token = await loginAndGetAccessToken();

    const createResponse = await createApp().fetch(
      new Request("http://localhost/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          accountType: "CLIENT",
          phone: "0610101010",
        }),
      }),
    );

    expect(createResponse.status).toBe(201);
    const payload = await createResponse.json();
    expect(payload.accountType).toBe("CLIENT");
    expect(payload.phone).toBe("0610101010");
    expect(payload.email).toBeNull();
    expect(payload.firstName).toBe("");
    expect(payload.lastName).toBe("");
    expect(payload.personalNotes).toBeNull();
  });
});
