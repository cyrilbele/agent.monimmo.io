import { beforeAll, describe, expect, it } from "bun:test";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
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
  });

  it("retourne le détail d'un utilisateur", async () => {
    const token = await loginAndGetAccessToken();
    const ownerEmail = `owner.${crypto.randomUUID()}@monimmo.fr`;

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
          owner: {
            firstName: "Lea",
            lastName: "Owner",
            phone: "0600000001",
            email: ownerEmail,
          },
        }),
      }),
    );
    expect(createPropertyResponse.status).toBe(201);

    const listResponse = await createApp().fetch(
      new Request("http://localhost/users?limit=100", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    const listPayload = await listResponse.json();
    const ownerUser = listPayload.items.find((item: { email: string }) => item.email === ownerEmail);
    expect(ownerUser).toBeDefined();
    if (!ownerUser) {
      throw new Error("Owner user should exist");
    }
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
        }),
      }),
    );

    expect(patchResponse.status).toBe(200);

    const patchPayload = await patchResponse.json();
    expect(patchPayload.phone).toBe("0611122233");
    expect(patchPayload.address).toBe("24 rue de la Republique");
    expect(patchPayload.postalCode).toBe("69002");
    expect(patchPayload.city).toBe("Lyon");
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
  });
});
