import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { marketDvfQueryCache } from "../src/db/schema";
import { propertiesService } from "../src/properties/service";

const previousApiBaseUrl = process.env.DF_API_BASE_URL;
const previousCacheTtlDays = process.env.DF_CACHE_TTL_DAYS;

const ownerPayload = () => ({
  firstName: "Theo",
  lastName: "Dupont",
  phone: "0601020304",
  email: `comparables.owner.${crypto.randomUUID()}@monimmo.fr`,
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
      id: `dvf-${index}`,
      date_mutation: `2024-03-${String((offset % 28) + 1).padStart(2, "0")}`,
      valeur_fonciere: 180000 + index * 500,
      codtypbien: 2,
      surface_reelle_bati: 40 + (index % 80),
      surface_carrez_du_1er_lot: 38 + (index % 75),
      latitude: 48.85 + (offset % 10) * 0.001,
      longitude: 2.35 + (offset % 10) * 0.001,
      code_postal: "75011",
      nom_commune: "Paris",
      code_commune: "75111",
    });
  }

  return rows;
};

describe("propertiesService.getComparables", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  afterEach(() => {
    process.env.DF_API_BASE_URL = previousApiBaseUrl;
    process.env.DF_CACHE_TTL_DAYS = previousCacheTtlDays;
  });

  it("adapte le rayon puis repond depuis le cache", async () => {
    process.env.DF_API_BASE_URL = "https://dvf.example.test/records";
    process.env.DF_CACHE_TTL_DAYS = "30";

    const previousFetch = globalThis.fetch;
    const radiiCalls: number[] = [];

    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.startsWith("https://data.geopf.fr/geocodage/search")) {
          return toJsonResponse({
            features: [
              {
                geometry: {
                  coordinates: [2.3522, 48.8566],
                },
              },
            ],
          });
        }

        if (url.startsWith("https://dvf.example.test/records")) {
          const endpoint = new URL(url);
          const radiusM = Number(endpoint.searchParams.get("radius_m") ?? "0");
          radiiCalls.push(radiusM);

          if (radiusM === 1000) {
            return toJsonResponse({ records: buildDvfRows(35, 0) });
          }

          if (radiusM === 2000) {
            return toJsonResponse({ records: buildDvfRows(35, 1000) });
          }

          return toJsonResponse({ records: buildDvfRows(40, 2000) });
        }

        return toJsonResponse({}, 404);
      },
      { preconnect: previousFetch.preconnect },
    ) as typeof fetch;

    try {
      const created = await propertiesService.create({
        orgId: "org_demo",
        title: "Bien comparables cache",
        city: "Paris",
        postalCode: "75011",
        address: "12 rue Oberkampf",
        owner: ownerPayload(),
        details: {
          general: {
            propertyType: "APPARTEMENT",
          },
          characteristics: {
            carrezArea: 65,
          },
          finance: {
            salePriceTtc: 420000,
          },
        },
      });

      const live = await propertiesService.getComparables({
        orgId: "org_demo",
        propertyId: created.id,
      });

      expect(live.source).toBe("LIVE");
      expect(live.propertyType).toBe("APPARTEMENT");
      expect(live.search.finalRadiusM).toBe(3000);
      expect(live.search.targetReached).toBe(true);
      expect(live.summary.count).toBeGreaterThanOrEqual(100);
      expect(radiiCalls).toEqual([1000, 2000, 3000]);

      const cached = await propertiesService.getComparables({
        orgId: "org_demo",
        propertyId: created.id,
      });

      expect(cached.source).toBe("CACHE");
      expect(cached.summary.count).toBe(live.summary.count);
      expect(radiiCalls).toEqual([1000, 2000, 3000]);

      const cacheRow = await db.query.marketDvfQueryCache.findFirst({
        where: and(
          eq(marketDvfQueryCache.orgId, "org_demo"),
          eq(marketDvfQueryCache.propertyId, created.id),
        ),
      });
      expect(cacheRow).not.toBeNull();
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("ignore le cache quand forceRefresh=true", async () => {
    process.env.DF_API_BASE_URL = "https://dvf.example.test/records";
    process.env.DF_CACHE_TTL_DAYS = "30";

    const previousFetch = globalThis.fetch;
    let dvfCallCount = 0;

    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.startsWith("https://data.geopf.fr/geocodage/search")) {
          return toJsonResponse({
            features: [
              {
                geometry: {
                  coordinates: [2.3522, 48.8566],
                },
              },
            ],
          });
        }

        if (url.startsWith("https://dvf.example.test/records")) {
          dvfCallCount += 1;
          const endpoint = new URL(url);
          const radiusM = Number(endpoint.searchParams.get("radius_m") ?? "0");

          if (radiusM === 1000) {
            return toJsonResponse({ records: buildDvfRows(55, 4000) });
          }

          return toJsonResponse({ records: buildDvfRows(55, 5000) });
        }

        return toJsonResponse({}, 404);
      },
      { preconnect: previousFetch.preconnect },
    ) as typeof fetch;

    try {
      const created = await propertiesService.create({
        orgId: "org_demo",
        title: "Bien comparables refresh",
        city: "Paris",
        postalCode: "75011",
        address: "7 rue Jean-Pierre Timbaud",
        owner: ownerPayload(),
        details: {
          general: {
            propertyType: "APPARTEMENT",
          },
          characteristics: {
            livingArea: 58,
          },
          finance: {
            salePriceTtc: 370000,
          },
        },
      });

      const first = await propertiesService.getComparables({
        orgId: "org_demo",
        propertyId: created.id,
      });
      expect(first.source).toBe("LIVE");
      const callsAfterFirst = dvfCallCount;

      const second = await propertiesService.getComparables({
        orgId: "org_demo",
        propertyId: created.id,
        forceRefresh: true,
      });

      expect(second.source).toBe("LIVE");
      expect(dvfCallCount).toBeGreaterThan(callsAfterFirst);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
