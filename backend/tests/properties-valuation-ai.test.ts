import { beforeAll, describe, expect, it } from "bun:test";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { createApp } from "../src/server";

const previousApiBaseUrl = process.env.DF_API_BASE_URL;

const ownerPayload = () => ({
  firstName: "Lina",
  lastName: "Roux",
  phone: "0611223344",
  email: `valuation.owner.${crypto.randomUUID()}@monimmo.fr`,
});

const toJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const buildDvfRows = (count: number): Array<Record<string, unknown>> =>
  Array.from({ length: count }, (_value, index) => ({
    id: `valuation-dvf-${index}`,
    date_mutation: `2024-0${(index % 9) + 1}-10`,
    valeur_fonciere: 520000 + index * 5000,
    codtypbien: 1,
    surface_reelle_bati: 100 + (index % 30),
    surface_carrez_du_1er_lot: null,
    surface_terrain: 650 + (index % 200),
    latitude: 43.66,
    longitude: 7.15,
    code_postal: "06800",
    nom_commune: "Cagnes-sur-Mer",
    code_commune: "06027",
  }));

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

describe("POST /properties/:id/valuation-ai", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("genere une valorisation IA et persiste le snapshot dans les details du bien", async () => {
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
                  coordinates: [7.15, 43.66],
                },
              },
            ],
          });
        }

        if (url.startsWith("https://dvf.api.test/records")) {
          return toJsonResponse({ records: buildDvfRows(45) });
        }

        return toJsonResponse({}, 404);
      },
      { preconnect: previousFetch.preconnect },
    ) as typeof fetch;

    try {
      const token = await loginAndGetAccessToken();
      const configuredOutputFormat = "## Format personnalisé sortie IA\n\n- Bloc test A\n- Bloc test B";

      const updateSettingsResponse = await createApp().fetch(
        new Request("http://localhost/me/settings", {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            valuationAiOutputFormat: configuredOutputFormat,
          }),
        }),
      );
      expect(updateSettingsResponse.status).toBe(200);

      const createPropertyResponse = await createApp().fetch(
        new Request("http://localhost/properties", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: "Maison valorisation IA",
            city: "Cagnes-sur-Mer",
            postalCode: "06800",
            address: "22 avenue des Oliviers",
            owner: ownerPayload(),
            details: {
              general: {
                propertyType: "MAISON",
              },
              characteristics: {
                livingArea: 120,
                landArea: 780,
                rooms: 5,
                standing: "HAUT_DE_GAMME",
                condition: "RENOVE",
                lastRenovationYear: 2019,
                agentAdditionalDetails:
                  "Toiture refaite en 2021, façade reprise et isolation renforcée.",
                hasCracks: "true",
                hasVisAVis: "false",
                noiseLevel: "MODERE",
                crawlSpacePresence: "PARTIEL",
                sanitationType: "FOSSE_SEPTIQUE",
                septicTankCompliant: "true",
                foundationUnderpinningDone: "false",
              },
              amenities: {
                pool: "PISCINABLE",
                coveredGarage: "true",
                carport: "false",
                photovoltaicPanels: "true",
                photovoltaicAnnualIncome: 2400,
              },
              copropriete: {
                sharedPool: "true",
                sharedTennis: "true",
                sharedMiniGolf: "false",
                privateSeaAccess: "false",
                guardedResidence: "true",
                fencedResidence: "true",
              },
              regulation: {
                dpeClass: "C",
                asbestos: "true",
              },
            },
          }),
        }),
      );

      expect(createPropertyResponse.status).toBe(201);
      const created = await createPropertyResponse.json();

      const valuationResponse = await createApp().fetch(
        new Request(`http://localhost/properties/${created.id}/valuation-ai`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            comparableFilters: {
              propertyType: "MAISON",
              surfaceMinM2: 100,
              surfaceMaxM2: 140,
            },
            agentAdjustedPrice: 640000,
          }),
        }),
      );

      expect(valuationResponse.status).toBe(200);
      const valuationPayload = await valuationResponse.json();
      expect(valuationPayload.propertyId).toBe(created.id);
      expect(valuationPayload.promptUsed).toContain("Critères clés");
      expect(valuationPayload.promptUsed).toContain("DPE");
      expect(valuationPayload.promptUsed).toContain("Tous les critères renseignés du bien");
      expect(valuationPayload.promptUsed).toContain("Reprise des fondations faite: Non");
      expect(valuationPayload.promptUsed).toContain("Facteurs complémentaires influençant la valorisation");
      expect(valuationPayload.promptUsed).toContain("Surface terrain: 780 m²");
      expect(valuationPayload.promptUsed).toContain("Piscine: Piscinable");
      expect(valuationPayload.promptUsed).toContain("Présence vide sanitaire: Partiel");
      expect(valuationPayload.promptUsed).toContain("Garage couvert: Oui");
      expect(valuationPayload.promptUsed).toContain("Carport: Non");
      expect(valuationPayload.promptUsed).toContain("Panneaux photovoltaïques: Oui");
      expect(valuationPayload.promptUsed).toContain("Revenu annuel panneaux photovoltaïques");
      expect(valuationPayload.promptUsed).toContain("€/an");
      expect(valuationPayload.promptUsed).toContain("Assainissement: Fosse septique");
      expect(valuationPayload.promptUsed).toContain("Fosse septique aux normes: Oui");
      expect(valuationPayload.promptUsed).toContain("Piscine copropriété: Oui");
      expect(valuationPayload.promptUsed).toContain("Tennis copropriété: Oui");
      expect(valuationPayload.promptUsed).toContain("Mini-golf copropriété: Non");
      expect(valuationPayload.promptUsed).toContain("Accès mer privé: Non");
      expect(valuationPayload.promptUsed).toContain("Résidence gardée: Oui");
      expect(valuationPayload.promptUsed).toContain("Résidence clôturée: Oui");
      expect(valuationPayload.promptUsed).toContain("Présence d'amiante: Oui");
      expect(valuationPayload.promptUsed).toContain("Problème de fissures: Oui");
      expect(valuationPayload.promptUsed).toContain("Vis-à-vis: Non");
      expect(valuationPayload.promptUsed).toContain("Niveau de bruit: Modéré");
      expect(valuationPayload.promptUsed).toMatch(/Année de dernière rénovation: 2.?019/);
      expect(valuationPayload.promptUsed).toContain("Détails complémentaires agent:");
      expect(valuationPayload.promptUsed).toContain("Toiture refaite en 2021");
      expect(valuationPayload.promptUsed).toContain("Évolution du marché sur 5 ans");
      expect(valuationPayload.promptUsed).toContain("Format de sortie attendu pour la clé justification");
      expect(valuationPayload.promptUsed).toContain(
        "Le format ci-dessous définit uniquement la structure de la clé justification",
      );
      expect(valuationPayload.promptUsed).toContain(configuredOutputFormat);
      expect(valuationPayload.valuationJustification).toContain("comparables");
      expect(valuationPayload.comparableCountUsed).toBeGreaterThan(0);
      expect(Array.isArray(valuationPayload.criteriaUsed)).toBe(true);

      const propertyResponse = await createApp().fetch(
        new Request(`http://localhost/properties/${created.id}`, {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`,
          },
        }),
      );

      expect(propertyResponse.status).toBe(200);
      const propertyPayload = await propertyResponse.json();
      expect(propertyPayload.details.valuationAiSnapshot).toBeDefined();
      expect(propertyPayload.details.valuationAiSnapshot.promptUsed).toBeUndefined();
      expect(propertyPayload.details.valuationAiSnapshot.criteriaUsed.length).toBeGreaterThan(0);

      const promptResponse = await createApp().fetch(
        new Request(`http://localhost/properties/${created.id}/valuation-ai/prompt`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            comparableFilters: {
              propertyType: "MAISON",
              surfaceMinM2: 100,
              surfaceMaxM2: 140,
            },
            agentAdjustedPrice: 640000,
          }),
        }),
      );
      expect(promptResponse.status).toBe(200);
      const promptPayload = await promptResponse.json();
      expect(promptPayload.propertyId).toBe(created.id);
      expect(promptPayload.promptUsed).toContain("Synthèse comparables filtrés");
      expect(promptPayload.promptUsed).toContain(configuredOutputFormat);
    } finally {
      globalThis.fetch = previousFetch;
      process.env.DF_API_BASE_URL = previousApiBaseUrl;
    }
  });

  it("retourne 401 sans token", async () => {
    const response = await createApp().fetch(
      new Request("http://localhost/properties/property_unknown/valuation-ai", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(401);
  });
});
