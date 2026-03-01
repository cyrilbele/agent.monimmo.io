import { describe, expect, it, vi, afterEach } from "vitest";

import { InseeCityService } from "./insee-city.service";

const asServiceInternals = (service: InseeCityService) => service as unknown as Record<string, (...args: unknown[]) => unknown>;

describe("InseeCityService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retourne un objet minimal quand la commune ne peut pas être résolue", async () => {
    const service = new InseeCityService();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const indicators = await service.getCityIndicators({
      inseeCode: null,
      city: null,
      postalCode: "75011",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(indicators).toEqual({
      inseeCode: null,
      city: null,
      postalCode: "75011",
      populationCurrent: null,
      populationCurrentYear: null,
      populationGrowthPct: null,
      populationGrowthAbs: null,
      populationStartYear: null,
      populationEndYear: null,
      populationDensityPerKm2: null,
      medianIncome: null,
      medianIncomeYear: null,
      ownersRatePct: null,
      ownersRateYear: null,
      ownersRateScope: null,
      unemploymentRatePct: null,
      unemploymentYear: null,
      averageAge: null,
      averageAgeYear: null,
      povertyRatePct: null,
      giniIndex: null,
    });
  });

  it("calcule les indicateurs complets à partir des jeux de données", async () => {
    const service = new InseeCityService();

    const responsesByMatcher: Array<{
      match: string;
      payload: unknown;
    }> = [
      {
        match: "/communes/75111",
        payload: {
          code: "75111",
          nom: "Paris 11e",
          population: 147_000,
          surface: 366,
          codesPostaux: ["75011"],
        },
      },
      {
        match: "historique-des-populations-legales",
        payload: {
          results: [
            { annee: "2010", population_municipale: 140000 },
            { annee: "2024", population_municipale: 147500 },
          ],
        },
      },
      {
        match: "demographyref-france-pop-active-sexe-activite-commune-millesime",
        payload: {
          results: [
            { year: "2024", variable_label: "Actifs ayant un emploi", value: 80000 },
            { year: "2024", variable_label: "Chomeurs", value: 10000 },
            { year: "2023", variable_label: "Actifs ayant un emploi", value: 78000 },
          ],
        },
      },
      {
        match: "revenus-declares-pauvrete-et-niveau-de-vie-en-2015-iris",
        payload: {
          results: [{ pop: 1000, weighted_income: 23500000, poverty_rate: 16.2, gini: 0.41 }],
        },
      },
      {
        match: "pop-sexe-age-nationalite-2014",
        payload: {
          results: [
            { age4: "Moins de 15 ans", population: 100 },
            { age4: "15 a 24 ans", population: 120 },
            { age4: "25 a 54 ans", population: 400 },
            { age4: "55 ans ou plus", population: 180 },
          ],
        },
      },
      {
        match: "logements-en-2015-maille-iris",
        payload: {
          results: [{ owners: 5500, rp: 10000 }],
        },
      },
    ];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const match = responsesByMatcher.find((candidate) => url.includes(candidate.match));
      if (!match) {
        throw new Error(`unexpected url: ${url}`);
      }

      return new Response(JSON.stringify(match.payload), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    const indicators = await service.getCityIndicators({
      inseeCode: "75111",
      city: "Paris",
      postalCode: "75011",
    });

    expect(indicators.inseeCode).toBe("75111");
    expect(indicators.city).toBe("Paris 11e");
    expect(indicators.postalCode).toBe("75011");
    expect(indicators.populationCurrent).toBe(147000);
    expect(indicators.populationCurrentYear).toBe(2024);
    expect(indicators.populationGrowthAbs).toBe(7500);
    expect(indicators.populationGrowthPct).toBe(5.4);
    expect(indicators.populationDensityPerKm2).toBe(40164);
    expect(indicators.unemploymentRatePct).toBe(11.1);
    expect(indicators.unemploymentYear).toBe(2024);
    expect(indicators.medianIncome).toBe(23500);
    expect(indicators.medianIncomeYear).toBe(2014);
    expect(indicators.averageAge).toBe(38.6);
    expect(indicators.averageAgeYear).toBe(2014);
    expect(indicators.ownersRatePct).toBe(55);
    expect(indicators.ownersRateYear).toBe(2015);
    expect(indicators.ownersRateScope).toBe("Commune");
    expect(indicators.povertyRatePct).toBe(16.2);
    expect(indicators.giniIndex).toBe(0.41);
  });

  it("résout la commune par nom et gère les jeux de données incomplets", async () => {
    const service = new InseeCityService();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/communes?")) {
        return new Response(
          JSON.stringify([
            {
              code: "06004",
              nom: "Antibes",
              population: 74500,
              surface: 2680,
              codesPostaux: ["06600"],
            },
          ]),
          { status: 200 },
        );
      }

      if (url.includes("historique-des-populations-legales")) {
        return new Response(JSON.stringify({ results: [{ annee: "2024", population_municipale: 74000 }] }), {
          status: 200,
        });
      }

      if (url.includes("demographyref-france-pop-active-sexe-activite-commune-millesime")) {
        return new Response(JSON.stringify({ results: [{ year: "2024", variable_label: "Actifs", value: 0 }] }), {
          status: 200,
        });
      }

      if (url.includes("revenus-declares-pauvrete-et-niveau-de-vie-en-2015-iris")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }

      if (url.includes("pop-sexe-age-nationalite-2014")) {
        return new Response(JSON.stringify({ results: [{ age4: "Inconnu", population: 50 }] }), {
          status: 200,
        });
      }

      if (url.includes("logements-en-2015-maille-iris")) {
        return new Response(JSON.stringify({ results: [{ owners: 0, rp: 0 }] }), { status: 200 });
      }

      return new Response("{}", { status: 404 });
    });

    const indicators = await service.getCityIndicators({
      city: "Antibes",
      postalCode: "06600",
    });

    expect(indicators.inseeCode).toBe("06004");
    expect(indicators.populationCurrent).toBe(74500);
    expect(indicators.populationGrowthPct).toBeNull();
    expect(indicators.unemploymentRatePct).toBeNull();
    expect(indicators.medianIncome).toBeNull();
    expect(indicators.averageAge).toBeNull();
    expect(indicators.ownersRatePct).toBeNull();
    expect(indicators.ownersRateYear).toBe(2015);
  });

  it("couvre les helpers internes (normalisation, croissance, fetchJson)", async () => {
    const service = new InseeCityService();
    const internals = asServiceInternals(service);

    const growth = internals["computePopulationGrowth"]([
      { annee: "2000", population_municipale: 1000 },
      { annee: "2010", population_municipale: 1200 },
      { annee: "2024", population_municipale: 1500 },
    ]);
    expect(growth).toEqual({
      startYear: 2010,
      endYear: 2024,
      endPopulation: 1500,
      growthAbs: 300,
      growthPct: 25,
    });
    expect(internals["computePopulationGrowth"]([{ annee: "2024", population_municipale: 1500 }])).toBeNull();

    expect(internals["computeDensityPerKm2"]({ population: 1000, surfaceHectares: 250 })).toBe(400);
    expect(internals["computeDensityPerKm2"]({ population: null, surfaceHectares: 250 })).toBeNull();
    expect(internals["computeDensityPerKm2"]({ population: 1000, surfaceHectares: 0 })).toBeNull();

    expect(internals["resolveAgeBucketMidpoint"]("moins de 15 ans")).toBe(7);
    expect(internals["resolveAgeBucketMidpoint"]("15 a 24 ans")).toBe(19.5);
    expect(internals["resolveAgeBucketMidpoint"]("25 a 54 ans")).toBe(39.5);
    expect(internals["resolveAgeBucketMidpoint"]("55 ans ou plus")).toBe(67);
    expect(internals["resolveAgeBucketMidpoint"]("autre")).toBeNull();

    expect(internals["parseYear"]("millesime 2024")).toBe(2024);
    expect(internals["parseYear"]("n/a")).toBeNull();
    expect(internals["normalizeInseeCode"](" 75111 ")).toBe("75111");
    expect(internals["normalizeInseeCode"]("x")).toBeNull();
    expect(internals["normalizeText"]("  Paris ")).toBe("Paris");
    expect(internals["normalizeText"]("   ")).toBeNull();
    expect(internals["normalizeLabel"]("Île-de-France")).toBe("ile-de-france");
    expect(internals["toFiniteNumber"](123)).toBe(123);
    expect(internals["toFiniteNumber"](Number.NaN)).toBeNull();
    expect(internals["round"](12.3456, 2)).toBe(12.35);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 500 }));
    expect(await internals["fetchJson"]("https://example.com/ko")).toBeNull();

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));
    expect(await internals["fetchJson"]("https://example.com/error")).toBeNull();
  });
});
