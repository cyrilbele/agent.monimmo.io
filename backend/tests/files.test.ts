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

describe("files endpoints", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("upload un fichier et le lit", async () => {
    const token = await loginAndGetAccessToken();

    const uploadResponse = await createApp().fetch(
      new Request("http://localhost/files/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileName: "mandat-vente.pdf",
          mimeType: "application/pdf",
          size: 123456,
        }),
      }),
    );

    expect(uploadResponse.status).toBe(201);
    const uploaded = await uploadResponse.json();
    expect(uploaded.fileName).toBe("mandat-vente.pdf");
    expect(uploaded.status).toBe("UPLOADED");

    const getResponse = await createApp().fetch(
      new Request(`http://localhost/files/${uploaded.id}`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(getResponse.status).toBe(200);
    const fetched = await getResponse.json();
    expect(fetched.id).toBe(uploaded.id);
  });

  it("retourne une download-url", async () => {
    const token = await loginAndGetAccessToken();

    const uploadResponse = await createApp().fetch(
      new Request("http://localhost/files/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileName: "dpe.pdf",
          mimeType: "application/pdf",
          size: 2048,
        }),
      }),
    );
    const uploaded = await uploadResponse.json();

    const urlResponse = await createApp().fetch(
      new Request(`http://localhost/files/${uploaded.id}/download-url`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(urlResponse.status).toBe(200);
    const payload = await urlResponse.json();
    expect(typeof payload.url).toBe("string");
    expect(typeof payload.expiresAt).toBe("string");
  });

  it("met à jour propertyId/typeDocument/status", async () => {
    const token = await loginAndGetAccessToken();

    const createPropertyResponse = await createApp().fetch(
      new Request("http://localhost/properties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: "Bien fichier",
          city: "Paris",
          postalCode: "75011",
          status: "PROSPECTION",
        }),
      }),
    );
    const property = await createPropertyResponse.json();

    const uploadResponse = await createApp().fetch(
      new Request("http://localhost/files/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileName: "piece-identite.pdf",
          mimeType: "application/pdf",
          size: 999,
        }),
      }),
    );
    const uploaded = await uploadResponse.json();

    const patchResponse = await createApp().fetch(
      new Request(`http://localhost/files/${uploaded.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: property.id,
          typeDocument: "PIECE_IDENTITE",
          status: "CLASSIFIED",
        }),
      }),
    );

    expect(patchResponse.status).toBe(200);
    const patched = await patchResponse.json();
    expect(patched.propertyId).toBe(property.id);
    expect(patched.typeDocument).toBe("PIECE_IDENTITE");
    expect(patched.status).toBe("CLASSIFIED");
  });
});

