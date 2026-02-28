import { beforeAll, describe, expect, it } from "bun:test";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { propertiesService } from "../src/properties/service";

const previousApiBaseUrl = process.env.DF_API_BASE_URL;

const ownerPayload = () => ({
  firstName: "Iris",
  lastName: "Garnier",
  phone: "0601020304",
  email: `regression.owner.${crypto.randomUUID()}@monimmo.fr`,
});

const toJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const buildLinearRows = () => {
  const rows: Array<Record<string, unknown>> = [];

  for (let surface = 30; surface <= 129; surface += 1) {
    rows.push({
      id: `reg-${surface}`,
      date_mutation: "2024-06-15",
      valeur_fonciere: surface * 2000,
      codtypbien: 2,
      surface_reelle_bati: surface,
      latitude: 48.8566,
      longitude: 2.3522,
      code_postal: "75004",
      nom_commune: "Paris",
      code_commune: "75104",
    });
  }

  return rows;
};

const buildLinearRowsWithOutlier = () => [
  ...buildLinearRows(),
  {
    id: "reg-outlier-1",
    date_mutation: "2024-06-15",
    valeur_fonciere: 2_000_000,
    codtypbien: 2,
    surface_reelle_bati: 350,
    latitude: 48.8566,
    longitude: 2.3522,
    code_postal: "75004",
    nom_commune: "Paris",
    code_commune: "75104",
  },
];

describe("comparables regression", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("calcule la regression et classe correctement la position prix", async () => {
    process.env.DF_API_BASE_URL = "https://dvf.regression.test/records";
    const previousFetch = globalThis.fetch;

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

        if (url.startsWith("https://dvf.regression.test/records")) {
          return toJsonResponse({ records: buildLinearRows() });
        }

        return toJsonResponse({}, 404);
      },
      { preconnect: previousFetch.preconnect },
    ) as typeof fetch;

    try {
      const normalProperty = await propertiesService.create({
        orgId: "org_demo",
        title: "Regression normal",
        city: "Paris",
        postalCode: "75004",
        address: "3 rue de Rivoli",
        owner: ownerPayload(),
        details: {
          general: {
            propertyType: "APPARTEMENT",
          },
          characteristics: {
            carrezArea: 100,
          },
          finance: {
            salePriceTtc: 200000,
          },
        },
      });

      const normalComparables = await propertiesService.getComparables({
        orgId: "org_demo",
        propertyId: normalProperty.id,
      });

      expect(normalComparables.regression.slope).toBe(2000);
      expect(normalComparables.regression.intercept).toBe(0);
      expect(normalComparables.subject.predictedPrice).toBe(200000);
      expect(normalComparables.subject.pricingPosition).toBe("NORMAL");

      const overPricedProperty = await propertiesService.create({
        orgId: "org_demo",
        title: "Regression over",
        city: "Paris",
        postalCode: "75004",
        address: "5 rue de Rivoli",
        owner: ownerPayload(),
        details: {
          general: {
            propertyType: "APPARTEMENT",
          },
          characteristics: {
            carrezArea: 100,
          },
          finance: {
            salePriceTtc: 250000,
          },
        },
      });

      const overPricedComparables = await propertiesService.getComparables({
        orgId: "org_demo",
        propertyId: overPricedProperty.id,
      });

      expect(overPricedComparables.subject.predictedPrice).toBe(200000);
      expect(overPricedComparables.subject.pricingPosition).toBe("OVER_PRICED");
      expect(overPricedComparables.subject.deviationPct).toBe(25);
    } finally {
      globalThis.fetch = previousFetch;
      process.env.DF_API_BASE_URL = previousApiBaseUrl;
    }
  });

  it("exclut les outliers surface/prix et expose le calcul affine a surface du bien", async () => {
    process.env.DF_API_BASE_URL = "https://dvf.regression.test/records";
    const previousFetch = globalThis.fetch;

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

        if (url.startsWith("https://dvf.regression.test/records")) {
          return toJsonResponse({ records: buildLinearRowsWithOutlier() });
        }

        return toJsonResponse({}, 404);
      },
      { preconnect: previousFetch.preconnect },
    ) as typeof fetch;

    try {
      const property = await propertiesService.create({
        orgId: "org_demo",
        title: "Regression outlier",
        city: "Paris",
        postalCode: "75004",
        address: "8 rue de Rivoli",
        owner: ownerPayload(),
        details: {
          general: {
            propertyType: "APPARTEMENT",
          },
          characteristics: {
            carrezArea: 100,
          },
          finance: {
            salePriceTtc: 210000,
          },
        },
      });

      const comparables = await propertiesService.getComparables({
        orgId: "org_demo",
        propertyId: property.id,
        forceRefresh: true,
      });

      expect(comparables.summary.count).toBe(100);
      expect(comparables.regression.pointsUsed).toBe(100);
      expect(comparables.regression.slope).toBe(2000);
      expect(comparables.regression.intercept).toBe(0);
      expect(comparables.subject.predictedPrice).toBe(200000);
      expect(comparables.subject.affinePriceAtSubjectSurface).toBe(200000);
      expect(comparables.points.some((point) => point.surfaceM2 === 350)).toBe(false);
    } finally {
      globalThis.fetch = previousFetch;
      process.env.DF_API_BASE_URL = previousApiBaseUrl;
    }
  });
});
