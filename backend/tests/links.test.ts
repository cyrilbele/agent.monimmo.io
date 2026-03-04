import { beforeAll, describe, expect, it } from "bun:test";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { createApp } from "../src/server";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";

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

  expect(response.status).toBe(200);
  const payload = await response.json();
  return payload.accessToken as string;
};

describe("links endpoints", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("liste les types de liens et la structure d'un type", async () => {
    const token = await loginAndGetAccessToken();

    const listResponse = await createApp().fetch(
      new Request("http://localhost/data-structure/lien", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    expect(Array.isArray(listPayload.items)).toBe(true);
    expect(listPayload.items.some((item: { typeLien: string }) => item.typeLien === "bien_user")).toBe(true);

    const detailResponse = await createApp().fetch(
      new Request("http://localhost/data-structure/lien/bien_user", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(detailResponse.status).toBe(200);
    const detailPayload = await detailResponse.json();
    expect(detailPayload.typeLien).toBe("bien_user");
    expect(Array.isArray(detailPayload.paramsSchema)).toBe(true);
  });

  it("gère le CRUD /links et l'upsert unique", async () => {
    const token = await loginAndGetAccessToken();
    const marker = crypto.randomUUID().slice(0, 8);

    const createPropertyResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `Bien liens ${marker}`,
          city: "Antibes",
          postalCode: "06600",
          address: "11 rue des Tertres",
        }),
      }),
    );
    expect(createPropertyResponse.status).toBe(201);
    const property = await createPropertyResponse.json();

    const createUserResponse = await createApp().fetch(
      new Request("http://localhost/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          accountType: "CLIENT",
          firstName: "Link",
          lastName: "Owner",
          email: `link.owner.${crypto.randomUUID()}@monimmo.fr`,
        }),
      }),
    );
    expect(createUserResponse.status).toBe(201);
    const user = await createUserResponse.json();

    const createLinkResponse = await createApp().fetch(
      new Request("http://localhost/links", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          typeLien: "bien_user",
          objectId1: property.id,
          objectId2: user.id,
          params: {
            relationRole: "OWNER",
          },
        }),
      }),
    );
    expect(createLinkResponse.status).toBe(201);
    const createdLink = await createLinkResponse.json();
    expect(createdLink.typeLien).toBe("bien_user");

    const upsertResponse = await createApp().fetch(
      new Request("http://localhost/links", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          typeLien: "bien_user",
          objectId1: property.id,
          objectId2: user.id,
          params: {
            relationRole: "ACHETEUR",
          },
        }),
      }),
    );
    expect(upsertResponse.status).toBe(200);
    const upsertedLink = await upsertResponse.json();
    expect(upsertedLink.id).toBe(createdLink.id);
    expect(upsertedLink.params.relationRole).toBe("ACHETEUR");

    const patchResponse = await createApp().fetch(
      new Request(`http://localhost/links/${createdLink.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          params: {
            relationRole: "OWNER",
          },
        }),
      }),
    );
    expect(patchResponse.status).toBe(200);
    const patched = await patchResponse.json();
    expect(patched.params.relationRole).toBe("OWNER");

    const listResponse = await createApp().fetch(
      new Request(`http://localhost/links?typeLien=bien_user&objectId=${property.id}`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(listResponse.status).toBe(200);
    const listed = await listResponse.json();
    expect(listed.items.some((item: { id: string }) => item.id === createdLink.id)).toBe(true);

    const deleteResponse = await createApp().fetch(
      new Request(`http://localhost/links/${createdLink.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(deleteResponse.status).toBe(204);

    const getAfterDeleteResponse = await createApp().fetch(
      new Request(`http://localhost/links/${createdLink.id}`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(getAfterDeleteResponse.status).toBe(404);
  });

  it("retourne les objets liés hydratés via /links/related", async () => {
    const token = await loginAndGetAccessToken();
    const marker = crypto.randomUUID().slice(0, 8);

    const createPropertyResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `Bien related ${marker}`,
          city: "Cannes",
          postalCode: "06400",
          address: "1 boulevard Carnot",
        }),
      }),
    );
    expect(createPropertyResponse.status).toBe(201);
    const property = await createPropertyResponse.json();

    const createUserResponse = await createApp().fetch(
      new Request("http://localhost/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          accountType: "CLIENT",
          firstName: "Hydrate",
          lastName: "User",
          email: `hydrate.user.${crypto.randomUUID()}@monimmo.fr`,
        }),
      }),
    );
    expect(createUserResponse.status).toBe(201);
    const user = await createUserResponse.json();

    const createLinkResponse = await createApp().fetch(
      new Request("http://localhost/links", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          typeLien: "bien_user",
          objectId1: property.id,
          objectId2: user.id,
          params: {
            relationRole: "OWNER",
          },
        }),
      }),
    );
    expect(createLinkResponse.status).toBe(201);

    const relatedResponse = await createApp().fetch(
      new Request(`http://localhost/links/related/bien/${property.id}`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(relatedResponse.status).toBe(200);
    const relatedPayload = await relatedResponse.json();

    expect(Array.isArray(relatedPayload.items)).toBe(true);
    expect(Array.isArray(relatedPayload.grouped.user)).toBe(true);
    expect(
      relatedPayload.items.some(
        (item: {
          otherSideObjectType: string;
          otherSideObjectId: string;
          link: { params?: Record<string, unknown> };
        }) =>
          item.otherSideObjectType === "user" &&
          item.otherSideObjectId === user.id &&
          item.link.params?.relationRole === "OWNER",
      ),
    ).toBe(true);
  });
});
