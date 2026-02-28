import { beforeAll, describe, expect, it } from "bun:test";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { createApp } from "../src/server";

const previousApiBaseUrl = process.env.DF_API_BASE_URL;

const ownerPayload = () => ({
  firstName: "Mila",
  lastName: "Berger",
  phone: "0611223344",
  email: `comparables.api.${crypto.randomUUID()}@monimmo.fr`,
});

const toJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const buildDvfRows = (count: number, startIndex: number) => {
  const rows: Array<Record<string, unknown>> = [];

  for (let offset = 0; offset < count; offset += 1) {
    const index = startIndex + offset;
    rows.push({
      id: `api-dvf-${index}`,
      date_mutation: `2023-04-${String((offset % 28) + 1).padStart(2, "0")}`,
      valeur_fonciere: 150000 + index * 700,
      codtypbien: 2,
      surface_reelle_bati: 35 + (index % 70),
      surface_carrez_du_1er_lot: 34 + (index % 65),
      latitude: 43.2965,
      longitude: 5.3698,
      code_postal: "13001",
      nom_commune: "Marseille",
      code_commune: "13201",
    });
  }

  return rows;
};

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

describe("GET /properties/:id/comparables", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("retourne les comparables DVF pour un bien", async () => {
    process.env.DF_API_BASE_URL = "https://dvf.api.test/records";
    const previousFetch = globalThis.fetch;

    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.startsWith("https://data.geopf.fr/geocodage/search")) {
          return toJsonResponse({
            features: [
              {
                geometry: {
                  coordinates: [5.3698, 43.2965],
                },
              },
            ],
          });
        }

        if (url.startsWith("https://dvf.api.test/records")) {
          const endpoint = new URL(url);
          const radiusM = Number(endpoint.searchParams.get("radius_m") ?? "0");
          if (radiusM === 1000) {
            return toJsonResponse({ records: buildDvfRows(60, 0) });
          }

          return toJsonResponse({ records: buildDvfRows(60, 1000) });
        }

        return toJsonResponse({}, 404);
      },
      { preconnect: previousFetch.preconnect },
    ) as typeof fetch;

    try {
      const token = await loginAndGetAccessToken();

      const createPropertyResponse = await createApp().fetch(
        new Request("http://localhost/properties", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: "Bien comparables endpoint",
            city: "Marseille",
            postalCode: "13001",
            address: "10 quai du Port",
            owner: ownerPayload(),
            details: {
              general: {
                propertyType: "APPARTEMENT",
              },
              characteristics: {
                carrezArea: 61,
              },
              finance: {
                salePriceTtc: 290000,
              },
            },
          }),
        }),
      );

      expect(createPropertyResponse.status).toBe(201);
      const created = await createPropertyResponse.json();

      const comparablesResponse = await createApp().fetch(
        new Request(`http://localhost/properties/${created.id}/comparables?propertyType=APPARTEMENT`, {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`,
          },
        }),
      );

      expect(comparablesResponse.status).toBe(200);
      const payload = await comparablesResponse.json();
      expect(payload.propertyId).toBe(created.id);
      expect(payload.source).toBe("LIVE");
      expect(payload.summary.count).toBeGreaterThanOrEqual(100);
      expect(payload.search.finalRadiusM).toBe(2000);
      expect(payload.subject.pricingPosition).toMatch(/UNDER_PRICED|NORMAL|OVER_PRICED|UNKNOWN/);
      expect(Array.isArray(payload.points)).toBe(true);
      expect(payload.points.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = previousFetch;
      process.env.DF_API_BASE_URL = previousApiBaseUrl;
    }
  });

  it("retourne 401 sans token", async () => {
    const response = await createApp().fetch(
      new Request("http://localhost/properties/property_unknown/comparables", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("retourne 400 si propertyType query est invalide", async () => {
    const token = await loginAndGetAccessToken();
    const response = await createApp().fetch(
      new Request("http://localhost/properties/property_unknown/comparables?propertyType=INVALID", {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("INVALID_PROPERTY_TYPE");
  });

  it("retourne 502 avec details quand la source DVF est indisponible", async () => {
    process.env.DF_API_BASE_URL = "https://dvf.api.test/records";
    const previousFetch = globalThis.fetch;

    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("https://data.geopf.fr/geocodage/search")) {
          return toJsonResponse({
            features: [
              {
                geometry: {
                  coordinates: [5.3698, 43.2965],
                },
              },
            ],
          });
        }

        if (url.startsWith("https://dvf.api.test/records")) {
          return new Response("Unavailable", { status: 503 });
        }

        return toJsonResponse({}, 404);
      },
      { preconnect: previousFetch.preconnect },
    ) as typeof fetch;

    try {
      const token = await loginAndGetAccessToken();

      const createPropertyResponse = await createApp().fetch(
        new Request("http://localhost/properties", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: "Bien comparables endpoint unavailable",
            city: "Marseille",
            postalCode: "13001",
            address: "10 quai du Port",
            owner: ownerPayload(),
            details: {
              general: {
                propertyType: "APPARTEMENT",
              },
            },
          }),
        }),
      );

      expect(createPropertyResponse.status).toBe(201);
      const created = await createPropertyResponse.json();

      const comparablesResponse = await createApp().fetch(
        new Request(`http://localhost/properties/${created.id}/comparables?propertyType=APPARTEMENT`, {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`,
          },
        }),
      );

      expect(comparablesResponse.status).toBe(502);
      const payload = await comparablesResponse.json();
      expect(payload.code).toBe("DVF_UNAVAILABLE");
      expect(payload.details.kind).toBe("HTTP");
      expect(payload.details.message).toBe("dvf_request_failed_503");
      expect(payload.details.endpoint).toContain("https://dvf.api.test/records");
      expect(payload.details.status).toBe(503);
    } finally {
      globalThis.fetch = previousFetch;
      process.env.DF_API_BASE_URL = previousApiBaseUrl;
    }
  });

  it("retourne 404 si bien introuvable", async () => {
    const token = await loginAndGetAccessToken();
    const response = await createApp().fetch(
      new Request("http://localhost/properties/property_unknown/comparables?propertyType=APPARTEMENT", {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );

    expect(response.status).toBe(404);
  });
});
