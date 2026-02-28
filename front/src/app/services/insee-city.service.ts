import { Injectable } from "@angular/core";

type GeoApiCommuneResponse = {
  code?: string;
  nom?: string;
  population?: number;
  surface?: number;
  codesPostaux?: string[];
};

type OdsResponse<T> = {
  results?: T[];
};

type PopulationHistoryRecord = {
  annee?: string;
  population_municipale?: number;
};

type ActivePopulationRecord = {
  variable_label?: string;
  value?: number;
  year?: string;
};

type IncomeRecord = {
  pop?: number;
  weighted_income?: number;
  poverty_rate?: number;
  gini?: number;
};

type AgeRecord = {
  age4?: string;
  population?: number;
};

export interface InseeCityIndicators {
  inseeCode: string | null;
  city: string | null;
  postalCode: string | null;
  populationCurrent: number | null;
  populationCurrentYear: number | null;
  populationGrowthPct: number | null;
  populationGrowthAbs: number | null;
  populationStartYear: number | null;
  populationEndYear: number | null;
  populationDensityPerKm2: number | null;
  medianIncome: number | null;
  medianIncomeYear: number | null;
  ownersRatePct: number | null;
  ownersRateYear: number | null;
  ownersRateScope: string | null;
  unemploymentRatePct: number | null;
  unemploymentYear: number | null;
  averageAge: number | null;
  averageAgeYear: number | null;
  povertyRatePct: number | null;
  giniIndex: number | null;
}

@Injectable({ providedIn: "root" })
export class InseeCityService {
  private static readonly GEO_API_BASE = "https://geo.api.gouv.fr";
  private static readonly ODS_BASE = "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets";
  private static readonly POPULATION_GROWTH_WINDOW_YEARS = 15;

  async getCityIndicators(input: {
    inseeCode?: string | null;
    city?: string | null;
    postalCode?: string | null;
  }): Promise<InseeCityIndicators> {
    const commune = await this.resolveCommune(input);
    const resolvedInseeCode = commune?.code ?? this.normalizeInseeCode(input.inseeCode);
    const resolvedCity = commune?.nom ?? this.normalizeText(input.city);
    const resolvedPostalCode = this.resolvePostalCode(commune, input.postalCode);
    const currentPopulation = this.toFiniteNumber(commune?.population);
    const densityPerKm2 = this.computeDensityPerKm2({
      population: currentPopulation,
      surfaceHectares: this.toFiniteNumber(commune?.surface),
    });

    if (!resolvedInseeCode) {
      return {
        inseeCode: null,
        city: resolvedCity,
        postalCode: resolvedPostalCode,
        populationCurrent: currentPopulation,
        populationCurrentYear: null,
        populationGrowthPct: null,
        populationGrowthAbs: null,
        populationStartYear: null,
        populationEndYear: null,
        populationDensityPerKm2: densityPerKm2,
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
      };
    }

    const [populationHistory, unemployment, income, averageAge, ownersRate] =
      await Promise.all([
        this.fetchPopulationHistory(resolvedInseeCode),
        this.fetchUnemploymentRate(resolvedInseeCode),
        this.fetchIncomeAndInequality(resolvedInseeCode),
        this.fetchAverageAge(resolvedInseeCode),
        this.fetchOwnersRate(resolvedInseeCode),
      ]);

    const growth = this.computePopulationGrowth(populationHistory);
    const populationCurrentYear = growth?.endYear ?? null;
    const populationCurrentValue = currentPopulation ?? growth?.endPopulation ?? null;

    return {
      inseeCode: resolvedInseeCode,
      city: resolvedCity,
      postalCode: resolvedPostalCode,
      populationCurrent: populationCurrentValue,
      populationCurrentYear,
      populationGrowthPct: growth?.growthPct ?? null,
      populationGrowthAbs: growth?.growthAbs ?? null,
      populationStartYear: growth?.startYear ?? null,
      populationEndYear: growth?.endYear ?? null,
      populationDensityPerKm2: densityPerKm2,
      medianIncome: income?.medianIncome ?? null,
      medianIncomeYear: income?.year ?? null,
      ownersRatePct: ownersRate?.ratePct ?? null,
      ownersRateYear: ownersRate?.year ?? null,
      ownersRateScope: ownersRate?.scope ?? null,
      unemploymentRatePct: unemployment?.ratePct ?? null,
      unemploymentYear: unemployment?.year ?? null,
      averageAge: averageAge?.value ?? null,
      averageAgeYear: averageAge?.year ?? null,
      povertyRatePct: income?.povertyRatePct ?? null,
      giniIndex: income?.giniIndex ?? null,
    };
  }

  private async resolveCommune(input: {
    inseeCode?: string | null;
    city?: string | null;
    postalCode?: string | null;
  }): Promise<GeoApiCommuneResponse | null> {
    const inseeCode = this.normalizeInseeCode(input.inseeCode);
    if (inseeCode) {
      const byCode = await this.fetchJson<GeoApiCommuneResponse>(
        `${InseeCityService.GEO_API_BASE}/communes/${inseeCode}?fields=nom,code,population,surface,codesPostaux&format=json&geometry=centre`,
      );
      if (byCode && this.normalizeInseeCode(byCode.code)) {
        return byCode;
      }
    }

    const city = this.normalizeText(input.city);
    if (!city) {
      return null;
    }

    const searchParams = new URLSearchParams({
      nom: city,
      fields: "nom,code,population,surface,codesPostaux",
      boost: "population",
      limit: "1",
      format: "json",
      geometry: "centre",
    });
    const postalCode = this.normalizeText(input.postalCode);
    if (postalCode) {
      searchParams.set("codePostal", postalCode);
    }

    const byName = await this.fetchJson<GeoApiCommuneResponse[]>(
      `${InseeCityService.GEO_API_BASE}/communes?${searchParams.toString()}`,
    );
    if (!byName || byName.length === 0) {
      return null;
    }

    return byName[0] ?? null;
  }

  private async fetchPopulationHistory(code: string): Promise<PopulationHistoryRecord[]> {
    const where = encodeURIComponent(`code_insee="${code}"`);
    const url =
      `${InseeCityService.ODS_BASE}/historique-des-populations-legales/records` +
      `?select=annee,population_municipale&where=${where}&order_by=annee%20asc&limit=100`;
    const response = await this.fetchJson<OdsResponse<PopulationHistoryRecord>>(url);
    return response?.results ?? [];
  }

  private async fetchUnemploymentRate(
    code: string,
  ): Promise<{ ratePct: number | null; year: number | null }> {
    const where = encodeURIComponent(`com_arm_code="${code}"`);
    const url =
      `${InseeCityService.ODS_BASE}/demographyref-france-pop-active-sexe-activite-commune-millesime/records` +
      `?select=variable_label,value,year&where=${where}&limit=100`;
    const response = await this.fetchJson<OdsResponse<ActivePopulationRecord>>(url);
    const rows = response?.results ?? [];
    if (rows.length === 0) {
      return { ratePct: null, year: null };
    }

    const latestYear = rows
      .map((row) => this.parseYear(row.year))
      .filter((value): value is number => value !== null)
      .reduce<number | null>((latest, current) => {
        if (latest === null) {
          return current;
        }
        return current > latest ? current : latest;
      }, null);

    if (latestYear === null) {
      return { ratePct: null, year: null };
    }

    const latestRows = rows.filter((row) => this.parseYear(row.year) === latestYear);
    let employed = 0;
    let unemployed = 0;

    for (const row of latestRows) {
      const label = this.normalizeLabel(row.variable_label);
      const value = this.toFiniteNumber(row.value);
      if (value === null) {
        continue;
      }

      if (label.includes("actifs ayant un emploi")) {
        employed += value;
      }
      if (label.includes("chomeurs")) {
        unemployed += value;
      }
    }

    const laborPool = employed + unemployed;
    if (laborPool <= 0) {
      return { ratePct: null, year: latestYear };
    }

    return {
      ratePct: this.round((unemployed / laborPool) * 100, 1),
      year: latestYear,
    };
  }

  private async fetchIncomeAndInequality(
    code: string,
  ): Promise<{
    medianIncome: number | null;
    povertyRatePct: number | null;
    giniIndex: number | null;
    year: number | null;
  }> {
    const where = encodeURIComponent(`com="${code}"`);
    const select = encodeURIComponent(
      "sum(pop_menages_en_2014_princ) as pop,sum(dec_med14 * pop_menages_en_2014_princ) as weighted_income,avg(dec_tp6014) as poverty_rate,avg(dec_gi14) as gini",
    );
    const url =
      `${InseeCityService.ODS_BASE}/revenus-declares-pauvrete-et-niveau-de-vie-en-2015-iris/records` +
      `?select=${select}&where=${where}&limit=1`;
    const response = await this.fetchJson<OdsResponse<IncomeRecord>>(url);
    const row = response?.results?.[0];
    if (!row) {
      return {
        medianIncome: null,
        povertyRatePct: null,
        giniIndex: null,
        year: null,
      };
    }

    const pop = this.toFiniteNumber(row.pop);
    const weightedIncome = this.toFiniteNumber(row.weighted_income);
    const medianIncome =
      pop !== null && weightedIncome !== null && pop > 0
        ? this.round(weightedIncome / pop, 0)
        : null;

    return {
      medianIncome,
      povertyRatePct: this.toFiniteNumber(row.poverty_rate),
      giniIndex: this.toFiniteNumber(row.gini),
      year: 2014,
    };
  }

  private async fetchAverageAge(
    code: string,
  ): Promise<{ value: number | null; year: number | null }> {
    const where = encodeURIComponent(`codgeo="${code}"`);
    const select = encodeURIComponent("age4,sum(nb) as population");
    const groupBy = encodeURIComponent("age4");
    const url =
      `${InseeCityService.ODS_BASE}/pop-sexe-age-nationalite-2014/records` +
      `?select=${select}&where=${where}&group_by=${groupBy}&limit=10`;
    const response = await this.fetchJson<OdsResponse<AgeRecord>>(url);
    const rows = response?.results ?? [];
    if (rows.length === 0) {
      return { value: null, year: null };
    }

    let weightedTotal = 0;
    let populationTotal = 0;

    for (const row of rows) {
      const bucketLabel = this.normalizeLabel(row.age4);
      const midpoint = this.resolveAgeBucketMidpoint(bucketLabel);
      const population = this.toFiniteNumber(row.population);
      if (midpoint === null || population === null || population <= 0) {
        continue;
      }
      weightedTotal += midpoint * population;
      populationTotal += population;
    }

    if (populationTotal <= 0) {
      return { value: null, year: 2014 };
    }

    return {
      value: this.round(weightedTotal / populationTotal, 1),
      year: 2014,
    };
  }

  private async fetchOwnersRate(
    inseeCode: string,
  ): Promise<{ ratePct: number | null; year: number | null; scope: string | null }> {
    const where = encodeURIComponent(`commune_ou_arm="${inseeCode}"`);
    const url =
      `${InseeCityService.ODS_BASE}/logements-en-2015-maille-iris/records` +
      `?select=sum(res_princ_occupees_proprietaires_en_2015_princ)%20as%20owners,sum(residences_principales_en_2015_princ)%20as%20rp` +
      `&where=${where}&limit=1`;
    const response = await this.fetchJson<
      OdsResponse<{
        owners?: number;
        rp?: number;
      }>
    >(url);
    const row = response?.results?.[0];
    if (!row) {
      return {
        ratePct: null,
        year: null,
        scope: null,
      };
    }

    const owners = this.toFiniteNumber(row.owners);
    const principalResidences = this.toFiniteNumber(row.rp);
    if (owners === null || principalResidences === null || principalResidences <= 0) {
      return {
        ratePct: null,
        year: 2015,
        scope: "Commune",
      };
    }

    return {
      ratePct: this.round((owners / principalResidences) * 100, 1),
      year: 2015,
      scope: "Commune",
    };
  }

  private computePopulationGrowth(rows: PopulationHistoryRecord[]): {
    startYear: number;
    endYear: number;
    endPopulation: number;
    growthAbs: number;
    growthPct: number;
  } | null {
    const normalized = rows
      .map((row) => ({
        year: this.parseYear(row.annee),
        population: this.toFiniteNumber(row.population_municipale),
      }))
      .filter(
        (row): row is { year: number; population: number } =>
          row.year !== null && row.population !== null,
      )
      .sort((a, b) => a.year - b.year);

    if (normalized.length < 2) {
      return null;
    }

    const last = normalized[normalized.length - 1];
    if (!last) {
      return null;
    }

    const minStartYear = last.year - InseeCityService.POPULATION_GROWTH_WINDOW_YEARS;
    const candidates = normalized.filter((row) => row.year >= minStartYear && row.year <= last.year);
    const scopedRows = candidates.length >= 2 ? candidates : normalized;
    const first = scopedRows[0];
    const scopedLast = scopedRows[scopedRows.length - 1];
    if (!first || !scopedLast || first.population <= 0) {
      return null;
    }

    const growthAbs = scopedLast.population - first.population;
    const growthPct = (growthAbs / first.population) * 100;

    return {
      startYear: first.year,
      endYear: scopedLast.year,
      endPopulation: scopedLast.population,
      growthAbs: this.round(growthAbs, 0),
      growthPct: this.round(growthPct, 1),
    };
  }

  private computeDensityPerKm2(input: {
    population: number | null;
    surfaceHectares: number | null;
  }): number | null {
    if (input.population === null || input.surfaceHectares === null || input.surfaceHectares <= 0) {
      return null;
    }

    const surfaceKm2 = input.surfaceHectares / 100;
    if (surfaceKm2 <= 0) {
      return null;
    }

    return this.round(input.population / surfaceKm2, 0);
  }

  private resolvePostalCode(
    commune: GeoApiCommuneResponse | null,
    fallbackPostalCode?: string | null,
  ): string | null {
    const firstCommunePostal = commune?.codesPostaux?.[0];
    if (this.normalizeText(firstCommunePostal)) {
      return this.normalizeText(firstCommunePostal);
    }
    return this.normalizeText(fallbackPostalCode);
  }

  private resolveAgeBucketMidpoint(label: string): number | null {
    if (label.includes("moins de 15")) {
      return 7;
    }
    if (label.includes("15 a 24")) {
      return 19.5;
    }
    if (label.includes("25 a 54")) {
      return 39.5;
    }
    if (label.includes("55 ans ou plus")) {
      return 67;
    }
    return null;
  }

  private parseYear(value: string | null | undefined): number | null {
    const normalized = this.normalizeText(value);
    if (!normalized) {
      return null;
    }
    const match = normalized.match(/\d{4}/);
    if (!match) {
      return null;
    }
    const year = Number(match[0]);
    if (!Number.isFinite(year)) {
      return null;
    }
    return year;
  }

  private normalizeInseeCode(value: string | null | undefined): string | null {
    const normalized = this.normalizeText(value)?.toUpperCase() ?? null;
    if (!normalized) {
      return null;
    }
    return /^[0-9A-Z]{5}$/.test(normalized) ? normalized : null;
  }

  private normalizeText(value: string | null | undefined): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeLabel(value: string | null | undefined): string {
    if (!value) {
      return "";
    }
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  private toFiniteNumber(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  private round(value: number, digits: number): number {
    return Number(value.toFixed(digits));
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

}
