import { createHash } from "node:crypto";
import { externalFetch } from "../http/external-fetch";

export const MARKET_PROPERTY_TYPES = [
  "APPARTEMENT",
  "MAISON",
  "IMMEUBLE",
  "TERRAIN",
  "LOCAL_COMMERCIAL",
  "AUTRE",
] as const;

export type MarketPropertyType = (typeof MARKET_PROPERTY_TYPES)[number];

export type DvfComparableTransaction = {
  source: "CEREMA_DVF_OPENDATA";
  sourceRowHash: string;
  saleDate: Date;
  salePrice: number;
  surfaceM2: number;
  builtSurfaceM2: number | null;
  landSurfaceM2: number | null;
  propertyType: MarketPropertyType;
  longitude: number | null;
  latitude: number | null;
  postalCode: string | null;
  city: string | null;
  inseeCode: string | null;
  rawPayload: Record<string, unknown>;
};

type FetchLike = typeof fetch;

type DvfSearchInput = {
  latitude: number;
  longitude: number;
  radiusM: number;
  propertyType: MarketPropertyType;
  fromDate: Date;
  toDate: Date;
  limit?: number;
  fetchImpl?: FetchLike;
};

const DEFAULT_DF_API_BASE_URL = "https://apidf-preprod.cerema.fr/dvf_opendata/mutations/";
const DEFAULT_DF_TIMEOUT_MS = 20000;
const METERS_PER_DEGREE = 111_320;
const DVF_MAX_BBOX_DEGREES = 0.02;
const DVF_MAX_PAGES = 6;

export type DvfClientErrorKind = "TIMEOUT" | "NETWORK" | "HTTP" | "INVALID_PAYLOAD";

export class DvfClientError extends Error {
  readonly kind: DvfClientErrorKind;
  readonly details: Record<string, unknown>;

  constructor(
    kind: DvfClientErrorKind,
    message: string,
    details: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DvfClientError";
    this.kind = kind;
    this.details = details;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizeText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const normalized = trimmed.replace(/\s+/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const parseDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const ddMmYyyyMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddMmYyyyMatch) {
    const [, dayRaw, monthRaw, yearRaw] = ddMmYyyyMatch;
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year = Number(yearRaw);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const getField = (row: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (key in row) {
      return row[key];
    }
  }

  return undefined;
};

const sumPositiveNumbers = (values: Array<number | null>): number | null => {
  const filtered = values.filter((value): value is number =>
    typeof value === "number" && Number.isFinite(value) && value > 0,
  );

  if (filtered.length === 0) {
    return null;
  }

  return filtered.reduce((sum, value) => sum + value, 0);
};

const resolvePropertyType = (row: Record<string, unknown>): MarketPropertyType => {
  const codeRaw = getField(row, ["codtypbien", "code_type_local", "type_bien_code"]);
  const numericCode = toFiniteNumber(codeRaw);

  if (numericCode === 1 || numericCode === 111) {
    return "MAISON";
  }

  if (numericCode === 2 || numericCode === 121) {
    return "APPARTEMENT";
  }

  if (
    typeof numericCode === "number" &&
    Number.isFinite(numericCode) &&
    numericCode >= 210 &&
    numericCode < 300
  ) {
    return "TERRAIN";
  }

  if (numericCode === 4 || numericCode === 5) {
    return "LOCAL_COMMERCIAL";
  }

  const labelRaw = sanitizeText(
    getField(row, [
      "type_local",
      "typedelocal",
      "libtypbien",
      "nature_mutation",
      "naturemut",
      "type_bien",
    ]),
  );
  if (!labelRaw) {
    return "AUTRE";
  }

  const normalized = labelRaw
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase();

  if (normalized.includes("appartement")) {
    return "APPARTEMENT";
  }

  if (normalized.includes("maison")) {
    return "MAISON";
  }

  if (normalized.includes("terrain")) {
    return "TERRAIN";
  }

  if (normalized.includes("immeuble")) {
    return "IMMEUBLE";
  }

  if (
    normalized.includes("local") ||
    normalized.includes("commerce") ||
    normalized.includes("commercial") ||
    normalized.includes("industrie")
  ) {
    return "LOCAL_COMMERCIAL";
  }

  return "AUTRE";
};

const resolveSurfaces = (row: Record<string, unknown>): {
  builtSurfaceM2: number | null;
  landSurfaceM2: number | null;
  carrezSurfaceM2: number | null;
} => {
  const builtSurfaceM2 =
    toFiniteNumber(
      getField(row, [
        "surface_reelle_bati",
        "surface_reelle_bati_1er_lot",
        "surface_bati",
        "sbati",
        "built_surface_m2",
      ]),
    ) ?? null;

  const landSurfaceM2 =
    toFiniteNumber(getField(row, ["surface_terrain", "land_surface_m2", "sterr", "stot"])) ?? null;

  const carrezSurfaceM2 = sumPositiveNumbers([
    toFiniteNumber(getField(row, ["surface_carrez_du_1er_lot"])),
    toFiniteNumber(getField(row, ["surface_carrez_du_2eme_lot"])),
    toFiniteNumber(getField(row, ["surface_carrez_du_3eme_lot"])),
    toFiniteNumber(getField(row, ["surface_carrez_du_4eme_lot"])),
    toFiniteNumber(getField(row, ["surface_carrez_du_5eme_lot"])),
  ]);

  return {
    builtSurfaceM2: builtSurfaceM2 && builtSurfaceM2 > 0 ? builtSurfaceM2 : null,
    landSurfaceM2: landSurfaceM2 && landSurfaceM2 > 0 ? landSurfaceM2 : null,
    carrezSurfaceM2,
  };
};

const resolveComparableSurface = (input: {
  propertyType: MarketPropertyType;
  builtSurfaceM2: number | null;
  landSurfaceM2: number | null;
  carrezSurfaceM2: number | null;
}): number | null => {
  const builtLike = input.carrezSurfaceM2 ?? input.builtSurfaceM2;

  if (input.propertyType === "TERRAIN") {
    return input.landSurfaceM2 ?? builtLike;
  }

  return builtLike ?? input.landSurfaceM2;
};

const createRowHash = (row: Record<string, unknown>, fallbackIndex: number): string => {
  const idValue = sanitizeText(
    getField(row, ["id", "idmutation", "mutation_id", "id_mutation", "clef"]),
  );
  const payload = idValue
    ? idValue
    : JSON.stringify({
        mutationDate: getField(row, ["date_mutation", "sale_date", "dateMutation", "datemut"]),
        salePrice: getField(row, ["valeur_fonciere", "sale_price", "salePrice", "valeurfonc"]),
        latitude: getField(row, ["latitude", "lat", "geolat"]),
        longitude: getField(row, ["longitude", "lon", "geolong"]),
        fallbackIndex,
      });

  return createHash("sha256").update(payload).digest("hex");
};

const normalizeFeatureRow = (value: unknown): Record<string, unknown> | null => {
  if (!isRecord(value)) {
    return null;
  }

  const row: Record<string, unknown> = isRecord(value.properties)
    ? { ...value.properties }
    : { ...value };

  if (row.id === undefined && value.id !== undefined) {
    row.id = value.id;
  }

  if (isRecord(value.geometry) && Array.isArray(value.geometry.coordinates)) {
    const [lon, lat] = value.geometry.coordinates;
    if (row.longitude === undefined && row.geolong === undefined) {
      row.longitude = lon;
    }
    if (row.latitude === undefined && row.geolat === undefined) {
      row.latitude = lat;
    }
  }

  return row;
};

const normalizeRows = (rows: unknown[]): unknown[] =>
  rows
    .map((row) => normalizeFeatureRow(row) ?? row)
    .filter((row) => isRecord(row));

const extractRows = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return normalizeRows(payload);
  }

  if (!isRecord(payload)) {
    return [];
  }

  const candidates = [
    payload.results,
    payload.records,
    payload.features,
    payload.data,
    payload.rows,
    isRecord(payload.result) ? payload.result.records : undefined,
    isRecord(payload.result) ? payload.result.results : undefined,
    isRecord(payload.result) ? payload.result.features : undefined,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return normalizeRows(candidate);
    }
  }

  return [];
};

const getTimeoutMs = (): number => {
  const raw = process.env.DF_API_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : DEFAULT_DF_TIMEOUT_MS;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_DF_TIMEOUT_MS;
  }

  return Math.round(parsed);
};

const toIsoDate = (value: Date): string => value.toISOString().slice(0, 10);

const toBoundingBox = (input: {
  latitude: number;
  longitude: number;
  radiusM: number;
}): {
  lonMin: number;
  latMin: number;
  lonMax: number;
  latMax: number;
} => {
  const maxHalfSpanDegrees = DVF_MAX_BBOX_DEGREES / 2;
  const latitudeDelta = Math.min(input.radiusM / METERS_PER_DEGREE, maxHalfSpanDegrees);
  const cosLat = Math.cos((input.latitude * Math.PI) / 180);
  const longitudeDelta = Math.min(
    input.radiusM / (METERS_PER_DEGREE * Math.max(Math.abs(cosLat), 0.01)),
    maxHalfSpanDegrees,
  );

  return {
    lonMin: input.longitude - longitudeDelta,
    latMin: input.latitude - latitudeDelta,
    lonMax: input.longitude + longitudeDelta,
    latMax: input.latitude + latitudeDelta,
  };
};

const buildEndpoint = (input: DvfSearchInput): URL => {
  const endpoint = new URL(process.env.DF_API_BASE_URL ?? DEFAULT_DF_API_BASE_URL);
  const bbox = toBoundingBox({
    latitude: input.latitude,
    longitude: input.longitude,
    radiusM: input.radiusM,
  });

  const fromIso = toIsoDate(input.fromDate);
  const toIso = toIsoDate(input.toDate);

  endpoint.searchParams.set("lat", String(input.latitude));
  endpoint.searchParams.set("lon", String(input.longitude));
  endpoint.searchParams.set("radius_m", String(input.radiusM));
  endpoint.searchParams.set("lon_lat", `${input.longitude},${input.latitude}`);
  endpoint.searchParams.set(
    "in_bbox",
    `${bbox.lonMin},${bbox.latMin},${bbox.lonMax},${bbox.latMax}`,
  );
  endpoint.searchParams.set("property_type", input.propertyType);
  endpoint.searchParams.set("date_from", fromIso);
  endpoint.searchParams.set("date_to", toIso);
  endpoint.searchParams.set("datemut_min", fromIso);
  endpoint.searchParams.set("datemut_max", toIso);
  endpoint.searchParams.set("format_date", "%Y-%m-%d");
  endpoint.searchParams.set("limit", String(input.limit ?? 500));
  endpoint.searchParams.set("page_size", String(input.limit ?? 500));

  return endpoint;
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const extractNextPageUrl = (payload: unknown, currentUrl: string): string | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const nextRaw = payload.next;
  if (typeof nextRaw !== "string" || !nextRaw.trim()) {
    return null;
  }

  try {
    const current = new URL(currentUrl);
    const next = new URL(nextRaw, current);

    // L'API renvoie parfois un next en http; on force le schéma de la requête initiale.
    next.protocol = current.protocol;
    return next.toString();
  } catch {
    return null;
  }
};

export const fetchOpenDataComparables = async (
  input: DvfSearchInput,
): Promise<DvfComparableTransaction[]> => {
  const fetchImpl = input.fetchImpl ?? fetch;
  const endpoint = buildEndpoint(input);
  const timeoutMs = getTimeoutMs();
  const headers = new Headers({
    accept: "application/json",
  });

  const token = process.env.DF_API_TOKEN?.trim();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const allRows: unknown[] = [];
  let nextUrl: string | null = endpoint.toString();
  let pageCount = 0;
  const visitedUrls = new Set<string>();

  while (nextUrl && pageCount < DVF_MAX_PAGES) {
    if (visitedUrls.has(nextUrl)) {
      break;
    }

    visitedUrls.add(nextUrl);
    pageCount += 1;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      try {
        response = await externalFetch({
          service: "dvf",
          url: nextUrl,
          method: "GET",
          headers,
          signal: controller.signal,
          fetchImpl,
        });
      } catch (error) {
        const message = getErrorMessage(error);
        const kind: DvfClientErrorKind =
          error instanceof DOMException && error.name === "AbortError" ? "TIMEOUT" : "NETWORK";
        const fallbackMessage =
          kind === "TIMEOUT" ? "dvf_request_timeout" : "dvf_request_network_error";
        throw new DvfClientError(kind, fallbackMessage, {
          endpoint: nextUrl,
          timeoutMs,
          page: pageCount,
          cause: message,
        });
      }

      if (!response.ok) {
        throw new DvfClientError("HTTP", `dvf_request_failed_${response.status}`, {
          endpoint: nextUrl,
          status: response.status,
          page: pageCount,
        });
      }

      let payload: unknown;
      try {
        payload = (await response.json()) as unknown;
      } catch (error) {
        throw new DvfClientError("INVALID_PAYLOAD", "dvf_invalid_payload", {
          endpoint: nextUrl,
          page: pageCount,
          cause: getErrorMessage(error),
        });
      }

      allRows.push(...extractRows(payload));
      nextUrl = extractNextPageUrl(payload, nextUrl);
    } finally {
      clearTimeout(timeout);
    }
  }

  const transactions: DvfComparableTransaction[] = [];

  for (let index = 0; index < allRows.length; index += 1) {
    const rawRow = allRows[index];
    if (!isRecord(rawRow)) {
      continue;
    }

    const row = rawRow as Record<string, unknown>;

    const saleDate = parseDate(
      getField(row, ["sale_date", "date_mutation", "dateMutation", "datemut"]),
    );
    if (!saleDate) {
      continue;
    }

    const salePrice = toFiniteNumber(
      getField(row, ["sale_price", "valeur_fonciere", "salePrice", "valeurfonc"]),
    );
    if (!salePrice || salePrice <= 0) {
      continue;
    }

    const propertyType = resolvePropertyType(row);
    if (propertyType !== input.propertyType) {
      continue;
    }

    const { builtSurfaceM2, landSurfaceM2, carrezSurfaceM2 } = resolveSurfaces(row);
    const surfaceM2 = resolveComparableSurface({
      propertyType,
      builtSurfaceM2,
      landSurfaceM2,
      carrezSurfaceM2,
    });

    if (!surfaceM2 || surfaceM2 <= 0) {
      continue;
    }

    transactions.push({
      source: "CEREMA_DVF_OPENDATA",
      sourceRowHash: createRowHash(row, index),
      saleDate,
      salePrice: Math.round(salePrice),
      surfaceM2,
      builtSurfaceM2,
      landSurfaceM2,
      propertyType,
      longitude: toFiniteNumber(getField(row, ["longitude", "lon", "geolong"])),
      latitude: toFiniteNumber(getField(row, ["latitude", "lat", "geolat"])),
      postalCode: sanitizeText(getField(row, ["code_postal", "postal_code", "codpost"])),
      city: sanitizeText(getField(row, ["nom_commune", "city", "commune", "libcom"])),
      inseeCode: sanitizeText(
        getField(row, ["code_commune", "code_insee", "insee_code", "codcom"]),
      ),
      rawPayload: row,
    });
  }

  return transactions;
};
