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

const ownerPayload = () => ({
  firstName: "Alice",
  lastName: "Bernier",
  phone: "0610101010",
  email: `owner.${crypto.randomUUID()}@monimmo.fr`,
});

const createProperty = async (token: string): Promise<{ id: string }> => {
  const createPropertyResponse = await createApp().fetch(
    new Request("http://localhost/properties", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: `Bien fichier ${crypto.randomUUID()}`,
        city: "Paris",
        postalCode: "75011",
        address: "6 rue Oberkampf",
        owner: ownerPayload(),
      }),
    }),
  );

  return (await createPropertyResponse.json()) as { id: string };
};

const smallPdfBuffer = Buffer.from("%PDF-1.4 test");
const smallPdfBase64 = smallPdfBuffer.toString("base64");
const smallPdfSize = smallPdfBuffer.byteLength;

describe("files endpoints", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("upload un fichier et le lit", async () => {
    const token = await loginAndGetAccessToken();
    const property = await createProperty(token);

    const uploadResponse = await createApp().fetch(
      new Request("http://localhost/files/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: property.id,
          typeDocument: "MANDAT_VENTE_SIGNE",
          fileName: "mandat-vente.pdf",
          mimeType: "application/pdf",
          size: smallPdfSize,
          contentBase64: smallPdfBase64,
        }),
      }),
    );

    expect(uploadResponse.status).toBe(201);
    const uploaded = await uploadResponse.json();
    expect(uploaded.fileName).toBe("mandat-vente.pdf");
    expect(uploaded.status).toBe("UPLOADED");
    expect(uploaded.typeDocument).toBe("MANDAT_VENTE_SIGNE");
    expect(uploaded.propertyId).toBe(property.id);

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
    const property = await createProperty(token);

    const uploadResponse = await createApp().fetch(
      new Request("http://localhost/files/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: property.id,
          typeDocument: "DPE",
          fileName: "dpe.pdf",
          mimeType: "application/pdf",
          size: smallPdfSize,
          contentBase64: smallPdfBase64,
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

    const storageResponse = await createApp().fetch(new Request(payload.url, { method: "GET" }));
    expect(storageResponse.status).toBe(200);
    expect(await storageResponse.text()).toContain("%PDF-1.4");
  });

  it("rejette une download-url tamperée", async () => {
    const token = await loginAndGetAccessToken();
    const property = await createProperty(token);

    const uploadResponse = await createApp().fetch(
      new Request("http://localhost/files/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: property.id,
          typeDocument: "DPE",
          fileName: "dpe-secure.pdf",
          mimeType: "application/pdf",
          size: smallPdfSize,
          contentBase64: smallPdfBase64,
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
    const tamperedUrl = new URL(payload.url as string);
    tamperedUrl.searchParams.set(
      "expiresAt",
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    );

    const tamperedResponse = await createApp().fetch(
      new Request(tamperedUrl.toString(), { method: "GET" }),
    );

    expect(tamperedResponse.status).toBe(403);
    expect(await tamperedResponse.json()).toEqual({
      code: "INVALID_STORAGE_SIGNATURE",
      message: "Signature de téléchargement invalide",
    });
  });

  it("liste les fichiers par bien", async () => {
    const token = await loginAndGetAccessToken();
    const propertyA = await createProperty(token);
    const propertyB = await createProperty(token);

    await createApp().fetch(
      new Request("http://localhost/files/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: propertyA.id,
          typeDocument: "DPE",
          fileName: "a.pdf",
          mimeType: "application/pdf",
          size: smallPdfSize,
          contentBase64: smallPdfBase64,
        }),
      }),
    );

    await createApp().fetch(
      new Request("http://localhost/files/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: propertyB.id,
          typeDocument: "AMIANTE",
          fileName: "b.pdf",
          mimeType: "application/pdf",
          size: smallPdfSize,
          contentBase64: smallPdfBase64,
        }),
      }),
    );

    const listResponse = await createApp().fetch(
      new Request(`http://localhost/files?propertyId=${encodeURIComponent(propertyA.id)}&limit=50`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    expect(Array.isArray(listPayload.items)).toBe(true);
    expect(listPayload.items.length).toBeGreaterThan(0);
    expect(
      (listPayload.items as Array<{ propertyId?: string }>).every(
        (file) => file.propertyId === propertyA.id,
      ),
    ).toBe(true);
  });

  it("met à jour propertyId/typeDocument/status", async () => {
    const token = await loginAndGetAccessToken();

    const property = await createProperty(token);

    const uploadResponse = await createApp().fetch(
      new Request("http://localhost/files/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: property.id,
          typeDocument: "PIECE_IDENTITE",
          fileName: "piece-identite.pdf",
          mimeType: "application/pdf",
          size: smallPdfSize,
          contentBase64: smallPdfBase64,
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

  it("déclenche un traitement IA sur un fichier", async () => {
    const token = await loginAndGetAccessToken();
    const property = await createProperty(token);

    const uploadResponse = await createApp().fetch(
      new Request("http://localhost/files/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: property.id,
          typeDocument: "DPE",
          fileName: "dpe-run-ai.pdf",
          mimeType: "application/pdf",
          size: smallPdfSize,
          contentBase64: smallPdfBase64,
        }),
      }),
    );
    const uploaded = await uploadResponse.json();

    const runAiResponse = await createApp().fetch(
      new Request(`http://localhost/files/${uploaded.id}/run-ai`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(runAiResponse.status).toBe(202);
    const queued = await runAiResponse.json();
    expect(queued.status).toBe("QUEUED");
    expect(typeof queued.jobId).toBe("string");
  });

  it("rejette un upload avec taille incohérente", async () => {
    const token = await loginAndGetAccessToken();
    const property = await createProperty(token);

    const response = await createApp().fetch(
      new Request("http://localhost/files/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: property.id,
          typeDocument: "DPE",
          fileName: "taille-incoherente.pdf",
          mimeType: "application/pdf",
          size: 99999,
          contentBase64: smallPdfBase64,
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "FILE_SIZE_MISMATCH",
      message: "La taille declaree ne correspond pas au contenu du fichier",
    });
  });
});
