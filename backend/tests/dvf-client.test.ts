import { afterEach, describe, expect, it } from "bun:test";
import { fetchOpenDataComparables } from "../src/properties/dvf-client";

const previousApiBaseUrl = process.env.DF_API_BASE_URL;
const previousApiTimeoutMs = process.env.DF_API_TIMEOUT_MS;
const previousApiToken = process.env.DF_API_TOKEN;

afterEach(() => {
  process.env.DF_API_BASE_URL = previousApiBaseUrl;
  process.env.DF_API_TIMEOUT_MS = previousApiTimeoutMs;
  process.env.DF_API_TOKEN = previousApiToken;
});

describe("fetchOpenDataComparables", () => {
  it("compose la requete et normalise les lignes DVF", async () => {
    process.env.DF_API_BASE_URL = "https://dvf.example.test/records";

    let calledUrl = "";

    const rows = await fetchOpenDataComparables({
      latitude: 48.8566,
      longitude: 2.3522,
      radiusM: 1000,
      propertyType: "APPARTEMENT",
      fromDate: new Date("2018-01-01T00:00:00.000Z"),
      toDate: new Date("2026-01-01T00:00:00.000Z"),
      limit: 120,
      fetchImpl: (async (input: RequestInfo | URL): Promise<Response> => {
        calledUrl = typeof input === "string" ? input : input.toString();

        return new Response(
          JSON.stringify({
            records: [
              {
                id: "row-1",
                date_mutation: "2024-03-10",
                valeur_fonciere: "250000",
                codtypbien: 2,
                surface_reelle_bati: "52",
                surface_carrez_du_1er_lot: "49",
                latitude: "48.857",
                longitude: "2.353",
                code_postal: "75011",
                nom_commune: "Paris",
                code_commune: "75111",
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          },
        );
      }) as typeof fetch,
    });

    expect(rows.length).toBe(1);
    expect(rows[0]?.propertyType).toBe("APPARTEMENT");
    expect(rows[0]?.salePrice).toBe(250000);
    expect(rows[0]?.surfaceM2).toBe(49);
    expect(rows[0]?.postalCode).toBe("75011");
    expect(rows[0]?.city).toBe("Paris");
    expect(rows[0]?.inseeCode).toBe("75111");

    const endpoint = new URL(calledUrl);
    expect(endpoint.origin).toBe("https://dvf.example.test");
    expect(endpoint.pathname).toBe("/records");
    expect(endpoint.searchParams.get("lat")).toBe("48.8566");
    expect(endpoint.searchParams.get("lon")).toBe("2.3522");
    expect(endpoint.searchParams.get("radius_m")).toBe("1000");
    expect(endpoint.searchParams.get("property_type")).toBe("APPARTEMENT");
    expect(endpoint.searchParams.get("date_from")).toBe("2018-01-01");
    expect(endpoint.searchParams.get("date_to")).toBe("2026-01-01");
    expect(endpoint.searchParams.get("datemut_min")).toBe("2018-01-01");
    expect(endpoint.searchParams.get("datemut_max")).toBe("2026-01-01");
    expect(endpoint.searchParams.get("limit")).toBe("120");
  });

  it("filtre les lignes hors type demandé et prend la surface terrain pour TERRAIN", async () => {
    const previousFetch = globalThis.fetch;

    const rows = await fetchOpenDataComparables({
      latitude: 43.3,
      longitude: 5.4,
      radiusM: 3000,
      propertyType: "TERRAIN",
      fromDate: new Date("2018-01-01T00:00:00.000Z"),
      toDate: new Date("2026-01-01T00:00:00.000Z"),
      fetchImpl: Object.assign(
        async (): Promise<Response> => {
          return new Response(
            JSON.stringify({
              results: [
                {
                  id: "maison-1",
                  date_mutation: "2023-02-10",
                  valeur_fonciere: "420000",
                  codtypbien: 1,
                  surface_reelle_bati: "120",
                  surface_terrain: "300",
                },
                {
                  id: "terrain-1",
                  date_mutation: "2022-11-18",
                  valeur_fonciere: "180000",
                  type_local: "Terrain",
                  surface_terrain: "640",
                  code_postal: "13011",
                },
              ],
            }),
            {
              status: 200,
              headers: { "content-type": "application/json; charset=utf-8" },
            },
          );
        },
        { preconnect: previousFetch.preconnect },
      ) as typeof fetch,
    });

    expect(rows.length).toBe(1);
    expect(rows[0]?.propertyType).toBe("TERRAIN");
    expect(rows[0]?.surfaceM2).toBe(640);
    expect(rows[0]?.salePrice).toBe(180000);
    expect(rows[0]?.postalCode).toBe("13011");
  });

  it("remonte une erreur quand la source repond en echec", async () => {
    const previousFetch = globalThis.fetch;

    await expect(
      fetchOpenDataComparables({
        latitude: 45.76,
        longitude: 4.84,
        radiusM: 1000,
        propertyType: "MAISON",
        fromDate: new Date("2018-01-01T00:00:00.000Z"),
        toDate: new Date("2026-01-01T00:00:00.000Z"),
        fetchImpl: Object.assign(
          async (): Promise<Response> => {
            return new Response("Service unavailable", { status: 503 });
          },
          { preconnect: previousFetch.preconnect },
        ) as typeof fetch,
      }),
    ).rejects.toThrow("dvf_request_failed_503");
  });

  it("borne in_bbox a 0.02 degre x 0.02 degre maximum", async () => {
    process.env.DF_API_BASE_URL = "https://dvf.example.test/records";
    let calledUrl = "";

    await fetchOpenDataComparables({
      latitude: 43.2965,
      longitude: 5.3698,
      radiusM: 5000,
      propertyType: "APPARTEMENT",
      fromDate: new Date("2018-01-01T00:00:00.000Z"),
      toDate: new Date("2026-01-01T00:00:00.000Z"),
      fetchImpl: (async (input: RequestInfo | URL): Promise<Response> => {
        calledUrl = typeof input === "string" ? input : input.toString();
        return new Response(JSON.stringify({ records: [] }), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }) as typeof fetch,
    });

    const endpoint = new URL(calledUrl);
    const rawBbox = endpoint.searchParams.get("in_bbox");
    expect(rawBbox).toBeTruthy();
    const [lonMin, latMin, lonMax, latMax] = (rawBbox ?? "")
      .split(",")
      .map((value) => Number(value));

    expect(lonMax - lonMin).toBeLessThanOrEqual(0.02);
    expect(latMax - latMin).toBeLessThanOrEqual(0.02);
  });

  it("mappe APPARTEMENT avec codtypbien/libtypbien DVF+ et suit la pagination", async () => {
    process.env.DF_API_BASE_URL = "https://dvf.example.test/records";
    const calledUrls: string[] = [];

    const rows = await fetchOpenDataComparables({
      latitude: 43.586952,
      longitude: 7.040819,
      radiusM: 10000,
      propertyType: "APPARTEMENT",
      fromDate: new Date("2016-02-28T00:00:00.000Z"),
      toDate: new Date("2026-02-28T00:00:00.000Z"),
      fetchImpl: (async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();
        calledUrls.push(url);
        const endpoint = new URL(url);
        const page = endpoint.searchParams.get("page") ?? "1";

        if (page === "1") {
          return new Response(
            JSON.stringify({
              next: "http://dvf.example.test/records?page=2",
              results: [
                {
                  idmutation: "mut-dep",
                  datemut: "2014-08-29",
                  valeurfonc: "202000.00",
                  codtypbien: "132",
                  libtypbien: "DES DEPENDANCES",
                  sbati: "0.00",
                },
                {
                  idmutation: "mut-app-1",
                  datemut: "2023-07-03",
                  valeurfonc: "253000.00",
                  codtypbien: "121",
                  libtypbien: "UN APPARTEMENT",
                  sbati: "61.00",
                  codpost: "06130",
                  libcom: "Grasse",
                },
              ],
            }),
            {
              status: 200,
              headers: { "content-type": "application/json; charset=utf-8" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            next: null,
            results: [
              {
                idmutation: "mut-app-2",
                datemut: "2023-02-27",
                valeurfonc: "134500.00",
                codtypbien: "999",
                libtypbien: "UN APPARTEMENT",
                sbati: "36.00",
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          },
        );
      }) as typeof fetch,
    });

    expect(calledUrls.length).toBe(2);
    expect(calledUrls[0]).toContain("https://dvf.example.test/records?");
    expect(calledUrls[1]).toBe("https://dvf.example.test/records?page=2");
    expect(rows.length).toBe(2);
    expect(rows[0]?.propertyType).toBe("APPARTEMENT");
    expect(rows[1]?.propertyType).toBe("APPARTEMENT");
    expect(rows[0]?.surfaceM2).toBe(61);
    expect(rows[1]?.surfaceM2).toBe(36);
  });
});
