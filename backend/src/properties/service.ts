import { createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "../db/client";
import {
  files,
  marketDvfQueryCache,
  marketDvfTransactions,
  organizations,
  properties,
  propertyParties,
  propertyTimelineEvents,
  propertyUserLinks,
  propertyVisits,
  users,
} from "../db/schema";
import { HttpError } from "../http/errors";
import { resolveValuationAiOutputFormat } from "../config/valuation-ai-output-format";
import {
  DvfClientError,
  MARKET_PROPERTY_TYPES,
  fetchOpenDataComparables,
  type MarketPropertyType,
} from "./dvf-client";
import { findCoordinatesForAddress, type PropertyCoordinates } from "./geocoding";
import { getPropertyRisks, type PropertyRisksResponse } from "./georisques";
import { getAIProvider } from "../ai/factory";

type PropertyRow = typeof properties.$inferSelect;

type ListPropertiesInput = {
  orgId: string;
  limit: number;
  cursor?: string;
};

type OwnerContactInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
};

type ProspectContactInput = OwnerContactInput;

type PropertyDetailsInput = Record<string, unknown>;

const COMPARABLE_WINDOW_YEARS = 10;
const COMPARABLE_TARGET_COUNT = 100;
const COMPARABLE_RADIUS_STEPS = [1000, 2000, 3000, 5000, 7000, 10000] as const;
const COMPARABLE_PRICE_TOLERANCE = 0.1;
const COMPARABLE_SUBJECT_SURFACE_MIN_FACTOR = 0.5;
const COMPARABLE_SUBJECT_SURFACE_MAX_FACTOR = 2;
const COMPARABLE_MIN_PRICE_PER_M2 = 500;
const COMPARABLE_CACHE_VERSION = "dvf-open-v5-min-price-per-m2-500";
const VALUATION_AI_SNAPSHOT_KEY = "valuationAiSnapshot";

const toDvfUnavailableDetails = (error: unknown): Record<string, unknown> => {
  if (error instanceof DvfClientError) {
    return {
      kind: error.kind,
      message: error.message,
      ...error.details,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  return {
    message: "unknown_error",
    raw: String(error),
  };
};

export type ComparablePricingPosition = "UNDER_PRICED" | "NORMAL" | "OVER_PRICED" | "UNKNOWN";

type ComparablePoint = {
  saleDate: string;
  surfaceM2: number;
  landSurfaceM2: number | null;
  salePrice: number;
  pricePerM2: number;
  distanceM: number | null;
  city: string | null;
  postalCode: string | null;
};

type PropertyValuationAIComparableFilters = {
  propertyType?: MarketPropertyType;
  radiusMaxM?: number | null;
  surfaceMinM2?: number | null;
  surfaceMaxM2?: number | null;
  landSurfaceMinM2?: number | null;
  landSurfaceMaxM2?: number | null;
};

type PropertyValuationCriterion = {
  label: string;
  value: string;
};

type PropertyValuationMarketTrendYear = {
  year: number;
  salesCount: number;
  avgPricePerM2: number | null;
  salesCountVariationPct: number | null;
  avgPricePerM2VariationPct: number | null;
};

export type PropertyValuationAIResponse = {
  propertyId: string;
  aiCalculatedValuation: number | null;
  valuationJustification: string;
  promptUsed: string;
  generatedAt: string;
  comparableCountUsed: number;
  criteriaUsed: PropertyValuationCriterion[];
};

export type PropertyValuationAIPromptResponse = {
  propertyId: string;
  promptUsed: string;
};

export type PropertyComparablesResponse = {
  propertyId: string;
  propertyType: MarketPropertyType;
  source: "CACHE" | "LIVE";
  windowYears: number;
  search: {
    center: {
      latitude: number;
      longitude: number;
    };
    finalRadiusM: number;
    radiiTried: number[];
    targetCount: number;
    targetReached: boolean;
  };
  summary: {
    count: number;
    medianPrice: number | null;
    medianPricePerM2: number | null;
    minPrice: number | null;
    maxPrice: number | null;
  };
  subject: {
    surfaceM2: number | null;
    askingPrice: number | null;
    affinePriceAtSubjectSurface: number | null;
    predictedPrice: number | null;
    deviationPct: number | null;
    pricingPosition: ComparablePricingPosition;
  };
  regression: {
    slope: number | null;
    intercept: number | null;
    r2: number | null;
    pointsUsed: number;
  };
  points: ComparablePoint[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const generateRandomPassword = (): string => {
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(randomBytes).toString("base64url");
};

const normalizeOptionalString = (value: string | null | undefined): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const resolveRoleFromAccountType = (accountType: "AGENT" | "CLIENT" | "NOTAIRE"): string => {
  switch (accountType) {
    case "AGENT":
      return "AGENT";
    case "NOTAIRE":
      return "NOTAIRE";
    default:
      return "OWNER";
  }
};

const parseDetails = (raw: string | null): Record<string, unknown> => {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
};

const sanitizeHiddenExpectedDocumentKeys = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  );
};

const parseHiddenExpectedDocumentKeys = (raw: string | null): string[] => {
  if (!raw) {
    return [];
  }

  try {
    return sanitizeHiddenExpectedDocumentKeys(JSON.parse(raw));
  } catch {
    return [];
  }
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

    const numeric = Number(trimmed.replace(",", "."));
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
};

const toBooleanLike = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "oui" || normalized === "yes" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "non" || normalized === "no" || normalized === "0") {
      return false;
    }
  }

  return null;
};

const getLocationDetails = (details: PropertyDetailsInput): Record<string, unknown> => {
  const rawLocation = details.location;
  if (!isRecord(rawLocation)) {
    return {};
  }

  return rawLocation;
};

const applyCoordinatesToDetails = (
  details: PropertyDetailsInput,
  coordinates: PropertyCoordinates | null,
): PropertyDetailsInput => {
  const location = getLocationDetails(details);

  return {
    ...details,
    location: {
      ...location,
      gpsLat: coordinates?.latitude ?? null,
      gpsLng: coordinates?.longitude ?? null,
    },
  };
};

const withGeocodedCoordinates = async (input: {
  details: PropertyDetailsInput;
  address: string;
  postalCode: string;
  city: string;
}): Promise<PropertyDetailsInput> => {
  const coordinates = await findCoordinatesForAddress({
    address: input.address,
    postalCode: input.postalCode,
    city: input.city,
  });

  return applyCoordinatesToDetails(input.details, coordinates);
};

const toPropertyResponse = (row: PropertyRow) => ({
  id: row.id,
  title: row.title,
  city: row.city,
  postalCode: row.postalCode,
  address: row.address,
  price: row.price,
  details: parseDetails(row.details),
  hiddenExpectedDocumentKeys: parseHiddenExpectedDocumentKeys(row.hiddenExpectedDocumentKeys),
  status: row.status,
  orgId: row.orgId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toPropertyVisitResponse = (row: {
  id: string;
  propertyId: string;
  propertyTitle: string;
  prospectUserId: string;
  prospectFirstName: string;
  prospectLastName: string;
  prospectEmail: string | null;
  prospectPhone: string | null;
  startsAt: Date;
  endsAt: Date;
  compteRendu: string | null;
  bonDeVisiteFileId: string | null;
  bonDeVisiteFileName: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: row.id,
  propertyId: row.propertyId,
  propertyTitle: row.propertyTitle,
  prospectUserId: row.prospectUserId,
  prospectFirstName: row.prospectFirstName,
  prospectLastName: row.prospectLastName,
  prospectEmail: row.prospectEmail,
  prospectPhone: row.prospectPhone,
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt.toISOString(),
  compteRendu: row.compteRendu,
  bonDeVisiteFileId: row.bonDeVisiteFileId,
  bonDeVisiteFileName: row.bonDeVisiteFileName,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const parseCursor = (cursor?: string): number | undefined => {
  if (!cursor) {
    return undefined;
  }

  const numericCursor = Number(cursor);
  if (Number.isNaN(numericCursor) || numericCursor <= 0) {
    throw new HttpError(400, "INVALID_CURSOR", "Cursor invalide");
  }

  return numericCursor;
};

const parseIsoDateTime = (
  rawValue: string,
  errorCode: string,
  errorMessage: string,
): Date => {
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, errorCode, errorMessage);
  }

  return parsed;
};

const normalizeMarketPropertyType = (value: unknown): MarketPropertyType | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toUpperCase();
  return MARKET_PROPERTY_TYPES.includes(trimmed as MarketPropertyType)
    ? (trimmed as MarketPropertyType)
    : null;
};

const getGeneralDetails = (details: PropertyDetailsInput): Record<string, unknown> => {
  const general = details.general;
  if (!isRecord(general)) {
    return {};
  }

  return general;
};

const getCharacteristicsDetails = (details: PropertyDetailsInput): Record<string, unknown> => {
  const characteristics = details.characteristics;
  if (!isRecord(characteristics)) {
    return {};
  }

  return characteristics;
};

const getFinanceDetails = (details: PropertyDetailsInput): Record<string, unknown> => {
  const finance = details.finance;
  if (!isRecord(finance)) {
    return {};
  }

  return finance;
};

const getRegulationDetails = (details: PropertyDetailsInput): Record<string, unknown> => {
  const regulation = details.regulation;
  if (!isRecord(regulation)) {
    return {};
  }

  return regulation;
};

const getAmenitiesDetails = (details: PropertyDetailsInput): Record<string, unknown> => {
  const amenities = details.amenities;
  if (!isRecord(amenities)) {
    return {};
  }

  return amenities;
};

const resolvePropertyTypeFromDetails = (details: PropertyDetailsInput): MarketPropertyType | null => {
  const general = getGeneralDetails(details);
  const fromGeneral = normalizeMarketPropertyType(general.propertyType);
  if (fromGeneral) {
    return fromGeneral;
  }

  return normalizeMarketPropertyType(details.propertyType);
};

const resolveSubjectSurface = (
  details: PropertyDetailsInput,
  propertyType: MarketPropertyType,
): number | null => {
  const characteristics = getCharacteristicsDetails(details);

  const livingArea = toFiniteNumber(characteristics.livingArea);
  const carrezArea = toFiniteNumber(characteristics.carrezArea);
  const landArea = toFiniteNumber(characteristics.landArea);

  if (propertyType === "TERRAIN") {
    return landArea ?? carrezArea ?? livingArea;
  }

  return carrezArea ?? livingArea ?? landArea;
};

const resolveSubjectAskingPrice = (
  property: PropertyRow,
  details: PropertyDetailsInput,
): number | null => {
  if (typeof property.price === "number" && Number.isFinite(property.price) && property.price > 0) {
    return property.price;
  }

  const finance = getFinanceDetails(details);
  const salePriceTtc = toFiniteNumber(finance.salePriceTtc);
  return salePriceTtc && salePriceTtc > 0 ? Math.round(salePriceTtc) : null;
};

const toCacheTtlDays = (): number => {
  const raw = process.env.DF_CACHE_TTL_DAYS;
  const parsed = raw ? Number(raw) : 30;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 30;
  }

  return Math.round(parsed);
};

const formatComparableNumber = (value: number): number => Number(value.toFixed(2));

const computeMedian = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }

  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return formatComparableNumber((sorted[mid - 1] + sorted[mid]) / 2);
  }

  return formatComparableNumber(sorted[mid]);
};

const normalizeValuationComparableFilters = (
  filters: PropertyValuationAIComparableFilters | undefined,
): PropertyValuationAIComparableFilters => {
  if (!filters) {
    return {};
  }

  const normalizePositive = (value: number | null | undefined): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return null;
    }

    return value;
  };

  const surfaceMin = normalizePositive(filters.surfaceMinM2);
  const surfaceMax = normalizePositive(filters.surfaceMaxM2);
  const landMin = normalizePositive(filters.landSurfaceMinM2);
  const landMax = normalizePositive(filters.landSurfaceMaxM2);

  return {
    propertyType: filters.propertyType,
    radiusMaxM: normalizePositive(filters.radiusMaxM),
    surfaceMinM2:
      surfaceMin !== null && surfaceMax !== null ? Math.min(surfaceMin, surfaceMax) : surfaceMin,
    surfaceMaxM2:
      surfaceMin !== null && surfaceMax !== null ? Math.max(surfaceMin, surfaceMax) : surfaceMax,
    landSurfaceMinM2: landMin !== null && landMax !== null ? Math.min(landMin, landMax) : landMin,
    landSurfaceMaxM2: landMin !== null && landMax !== null ? Math.max(landMin, landMax) : landMax,
  };
};

const filterComparablePoints = (
  points: ComparablePoint[],
  filters: PropertyValuationAIComparableFilters,
): ComparablePoint[] =>
  points.filter((point) => {
    if (filters.radiusMaxM !== null && typeof filters.radiusMaxM === "number") {
      if (typeof point.distanceM !== "number" || !Number.isFinite(point.distanceM) || point.distanceM > filters.radiusMaxM) {
        return false;
      }
    }

    if (filters.surfaceMinM2 !== null && typeof filters.surfaceMinM2 === "number" && point.surfaceM2 < filters.surfaceMinM2) {
      return false;
    }

    if (filters.surfaceMaxM2 !== null && typeof filters.surfaceMaxM2 === "number" && point.surfaceM2 > filters.surfaceMaxM2) {
      return false;
    }

    if (
      filters.landSurfaceMinM2 !== null &&
      typeof filters.landSurfaceMinM2 === "number" &&
      (typeof point.landSurfaceM2 !== "number" ||
        !Number.isFinite(point.landSurfaceM2) ||
        point.landSurfaceM2 < filters.landSurfaceMinM2)
    ) {
      return false;
    }

    if (
      filters.landSurfaceMaxM2 !== null &&
      typeof filters.landSurfaceMaxM2 === "number" &&
      (typeof point.landSurfaceM2 !== "number" ||
        !Number.isFinite(point.landSurfaceM2) ||
        point.landSurfaceM2 > filters.landSurfaceMaxM2)
    ) {
      return false;
    }

    return true;
  });

const summarizeComparablePoints = (points: ComparablePoint[]) => {
  const prices = points.map((point) => point.salePrice);
  const pricesPerM2 = points.map((point) => point.pricePerM2);

  return {
    count: points.length,
    medianPrice: computeMedian(prices),
    medianPricePerM2: computeMedian(pricesPerM2),
    minPrice: prices.length > 0 ? Math.min(...prices) : null,
    maxPrice: prices.length > 0 ? Math.max(...prices) : null,
  };
};

const STANDING_LABELS: Record<string, string> = {
  STANDARD: "Standard",
  HAUT_DE_GAMME: "Haut de gamme",
  LUXE: "Luxe",
};

const CONDITION_LABELS: Record<string, string> = {
  NEUF: "Neuf",
  RENOVE: "Rénové",
  A_RAFRAICHIR: "À rafraîchir",
  A_RENOVER: "À rénover",
};

const NOISE_LEVEL_LABELS: Record<string, string> = {
  FAIBLE: "Faible",
  MODERE: "Modéré",
  ELEVE: "Élevé",
};

const CRAWL_SPACE_LABELS: Record<string, string> = {
  NON: "Non",
  OUI: "Oui",
  PARTIEL: "Partiel",
};

const SANITATION_TYPE_LABELS: Record<string, string> = {
  TOUT_A_L_EGOUT: "Tout-à-l'égout",
  FOSSE_SEPTIQUE: "Fosse septique",
};

const GARDEN_LABELS: Record<string, string> = {
  NON: "Non",
  OUI_NU: "Oui nu",
  OUI_ARBORE: "Oui arboré",
  OUI_PAYSAGE: "Oui paysagé",
};

const POOL_LABELS: Record<string, string> = {
  NON: "Non",
  PISCINABLE: "Piscinable",
  OUI: "Oui",
};

const PROPERTY_DETAIL_CATEGORY_LABELS: Record<string, string> = {
  general: "Informations générales",
  location: "Localisation",
  characteristics: "Caractéristiques",
  amenities: "Prestations",
  copropriete: "Copropriété",
  finance: "Finance",
  regulation: "Réglementation",
  marketing: "Commercialisation",
};

const PROPERTY_DETAIL_FIELD_LABELS: Record<string, string> = {
  "characteristics.livingArea": "Surface habitable",
  "characteristics.landArea": "Surface terrain",
  "characteristics.rooms": "Nombre de pièces",
  "characteristics.standing": "Standing",
  "characteristics.condition": "État général",
  "characteristics.lastRenovationYear": "Année de dernière rénovation",
  "characteristics.hasCracks": "Problème de fissures",
  "characteristics.hasVisAVis": "Vis-à-vis",
  "characteristics.noiseLevel": "Niveau de bruit",
  "characteristics.crawlSpacePresence": "Présence vide sanitaire",
  "characteristics.sanitationType": "Assainissement",
  "characteristics.septicTankCompliant": "Fosse septique aux normes",
  "characteristics.foundationUnderpinningDone": "Reprise des fondations faite",
  "characteristics.agentAdditionalDetails": "Détails complémentaires agent",
  "amenities.garden": "Jardin",
  "amenities.pool": "Piscine",
  "amenities.fenced": "Bien clôturé",
  "amenities.coveredGarage": "Garage couvert",
  "amenities.carport": "Carport",
  "amenities.photovoltaicPanels": "Panneaux photovoltaïques",
  "amenities.photovoltaicAnnualIncome": "Revenu annuel panneaux photovoltaïques",
  "copropriete.sharedPool": "Piscine copropriété",
  "copropriete.sharedTennis": "Tennis copropriété",
  "copropriete.sharedMiniGolf": "Mini-golf copropriété",
  "copropriete.privateSeaAccess": "Accès mer privé",
  "copropriete.guardedResidence": "Résidence gardée",
  "copropriete.fencedResidence": "Résidence clôturée",
  "regulation.dpeClass": "DPE (classe énergie)",
  "regulation.asbestos": "Présence d'amiante",
};

const toFrInteger = (value: number): string =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
const toFrPercent = (value: number): string =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);

const toYesNo = (value: boolean | null): string | null => {
  if (value === null) {
    return null;
  }

  return value ? "Oui" : "Non";
};

const resolvePoolLabel = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (!normalized) {
      return null;
    }

    const mapped = POOL_LABELS[normalized];
    if (mapped) {
      return mapped;
    }
  }

  return toYesNo(toBooleanLike(value));
};

const resolvePointPricePerM2 = (point: ComparablePoint): number | null => {
  if (Number.isFinite(point.pricePerM2) && point.pricePerM2 > 0) {
    return point.pricePerM2;
  }

  if (
    Number.isFinite(point.salePrice) &&
    point.salePrice > 0 &&
    Number.isFinite(point.surfaceM2) &&
    point.surfaceM2 > 0
  ) {
    return point.salePrice / point.surfaceM2;
  }

  return null;
};

const computeValuationMarketTrendRows = (
  points: ComparablePoint[],
  yearsWindow = 5,
): PropertyValuationMarketTrendYear[] => {
  const saleYears = points
    .map((point) => new Date(point.saleDate).getFullYear())
    .filter((year) => Number.isInteger(year) && year > 0);
  const latestYear = saleYears.length > 0 ? Math.max(...saleYears) : new Date().getFullYear();
  const years = Array.from({ length: yearsWindow }, (_value, index) => latestYear - (yearsWindow - 1 - index));

  const aggregates = new Map<number, { salesCount: number; sumPricePerM2: number; priceCount: number }>();
  for (const year of years) {
    aggregates.set(year, { salesCount: 0, sumPricePerM2: 0, priceCount: 0 });
  }

  for (const point of points) {
    const saleTimestamp = new Date(point.saleDate).getTime();
    if (!Number.isFinite(saleTimestamp)) {
      continue;
    }

    const saleYear = new Date(saleTimestamp).getFullYear();
    const aggregate = aggregates.get(saleYear);
    if (!aggregate) {
      continue;
    }

    aggregate.salesCount += 1;
    const pricePerM2 = resolvePointPricePerM2(point);
    if (pricePerM2 !== null) {
      aggregate.sumPricePerM2 += pricePerM2;
      aggregate.priceCount += 1;
    }
  }

  const rows: PropertyValuationMarketTrendYear[] = [];
  let previousRow: { salesCount: number; avgPricePerM2: number | null } | null = null;

  for (const year of years) {
    const aggregate = aggregates.get(year) ?? { salesCount: 0, sumPricePerM2: 0, priceCount: 0 };
    const avgPricePerM2 =
      aggregate.priceCount > 0 ? formatComparableNumber(aggregate.sumPricePerM2 / aggregate.priceCount) : null;
    const salesCountVariationPct =
      previousRow !== null && previousRow.salesCount > 0
        ? formatComparableNumber(((aggregate.salesCount - previousRow.salesCount) / previousRow.salesCount) * 100)
        : null;
    const avgPricePerM2VariationPct =
      previousRow !== null &&
      previousRow.avgPricePerM2 !== null &&
      previousRow.avgPricePerM2 > 0 &&
      avgPricePerM2 !== null
        ? formatComparableNumber(((avgPricePerM2 - previousRow.avgPricePerM2) / previousRow.avgPricePerM2) * 100)
        : null;

    rows.push({
      year,
      salesCount: aggregate.salesCount,
      avgPricePerM2,
      salesCountVariationPct,
      avgPricePerM2VariationPct,
    });

    previousRow = {
      salesCount: aggregate.salesCount,
      avgPricePerM2,
    };
  }

  return rows;
};

const humanizeDetailFieldKey = (fieldKey: string): string =>
  fieldKey
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());

const formatDetailPromptLabel = (categoryId: string, fieldKey: string): string => {
  const mapped = PROPERTY_DETAIL_FIELD_LABELS[`${categoryId}.${fieldKey}`];
  if (mapped) {
    return mapped;
  }

  const categoryLabel = PROPERTY_DETAIL_CATEGORY_LABELS[categoryId] ?? categoryId;
  return `${categoryLabel} - ${humanizeDetailFieldKey(fieldKey)}`;
};

const formatDetailPromptValue = (value: unknown): string | null => {
  if (typeof value === "boolean") {
    return value ? "Oui" : "Non";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }

    return Number.isInteger(value)
      ? toFrInteger(value)
      : new Intl.NumberFormat("fr-FR", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }).format(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const normalized = trimmed.toLowerCase();
    if (normalized === "true") {
      return "Oui";
    }
    if (normalized === "false") {
      return "Non";
    }

    const mappedGarden = GARDEN_LABELS[trimmed.toUpperCase()];
    if (mappedGarden) {
      return mappedGarden;
    }

    const mappedPool = POOL_LABELS[trimmed.toUpperCase()];
    if (mappedPool) {
      return mappedPool;
    }

    if (/^[A-Z0-9_]+$/.test(trimmed)) {
      return trimmed
        .split("_")
        .filter((token) => token.length > 0)
        .map((token) => token.charAt(0) + token.slice(1).toLowerCase())
        .join(" ");
    }

    return trimmed.length > 320 ? `${trimmed.slice(0, 317)}...` : trimmed;
  }

  if (Array.isArray(value)) {
    const values = value
      .map((entry) => formatDetailPromptValue(entry))
      .filter((entry): entry is string => Boolean(entry));
    if (values.length === 0) {
      return null;
    }

    return values.join(", ");
  }

  return null;
};

const resolveAllPropertyCriteriaForPrompt = (details: PropertyDetailsInput): PropertyValuationCriterion[] => {
  const categories = [
    "general",
    "location",
    "characteristics",
    "amenities",
    "copropriete",
    "finance",
    "regulation",
    "marketing",
  ] as const;
  const criteria: PropertyValuationCriterion[] = [];

  for (const categoryId of categories) {
    const rawCategory = details[categoryId];
    if (!isRecord(rawCategory)) {
      continue;
    }

    for (const [fieldKey, rawValue] of Object.entries(rawCategory)) {
      const value = formatDetailPromptValue(rawValue);
      if (!value) {
        continue;
      }

      criteria.push({
        label: formatDetailPromptLabel(categoryId, fieldKey),
        value,
      });
    }
  }

  return criteria;
};

const resolveValuationCriteria = (
  details: PropertyDetailsInput,
  propertyType: MarketPropertyType,
): PropertyValuationCriterion[] => {
  const characteristics = getCharacteristicsDetails(details);
  const regulation = getRegulationDetails(details);
  const amenities = getAmenitiesDetails(details);
  const criteria: PropertyValuationCriterion[] = [];

  const pushCriterion = (label: string, value: string | null): void => {
    if (!value) {
      return;
    }
    criteria.push({ label, value });
  };

  const dpeClassRaw = typeof regulation.dpeClass === "string" ? regulation.dpeClass.trim().toUpperCase() : "";
  pushCriterion("DPE (classe énergie)", dpeClassRaw || null);

  const standingRaw =
    typeof characteristics.standing === "string" ? characteristics.standing.trim().toUpperCase() : "";
  pushCriterion("Standing", STANDING_LABELS[standingRaw] ?? (standingRaw || null));

  pushCriterion("Piscine", resolvePoolLabel(amenities.pool));

  const livingArea = toFiniteNumber(characteristics.livingArea);
  pushCriterion("Surface habitable", livingArea !== null && livingArea > 0 ? `${toFrInteger(livingArea)} m²` : null);

  const landArea = toFiniteNumber(characteristics.landArea);
  pushCriterion(
    "Surface terrain",
    propertyType === "MAISON" && landArea !== null && landArea > 0 ? `${toFrInteger(landArea)} m²` : null,
  );

  const hasCracks = toBooleanLike(characteristics.hasCracks);
  pushCriterion("Problème de fissures", toYesNo(hasCracks));

  const hasAsbestos = toBooleanLike(regulation.asbestos);
  pushCriterion("Présence d'amiante", toYesNo(hasAsbestos));

  const hasVisAVis = toBooleanLike(characteristics.hasVisAVis);
  pushCriterion("Vis-à-vis", toYesNo(hasVisAVis));

  const noiseLevelRaw =
    typeof characteristics.noiseLevel === "string"
      ? characteristics.noiseLevel.trim().toUpperCase()
      : "";
  pushCriterion("Niveau de bruit", NOISE_LEVEL_LABELS[noiseLevelRaw] ?? (noiseLevelRaw || null));

  const foundationUnderpinningDone = toBooleanLike(characteristics.foundationUnderpinningDone);
  pushCriterion("Reprise des fondations faite", toYesNo(foundationUnderpinningDone));

  const conditionRaw =
    typeof characteristics.condition === "string" ? characteristics.condition.trim().toUpperCase() : "";
  pushCriterion("État général", CONDITION_LABELS[conditionRaw] ?? (conditionRaw || null));

  const lastRenovationYear = toFiniteNumber(characteristics.lastRenovationYear);
  pushCriterion(
    "Année de dernière rénovation",
    lastRenovationYear !== null && lastRenovationYear > 1800
      ? toFrInteger(Math.round(lastRenovationYear))
      : null,
  );

  const rooms = toFiniteNumber(characteristics.rooms);
  pushCriterion("Nombre de pièces", rooms !== null && rooms > 0 ? `${toFrInteger(rooms)} pièces` : null);

  return criteria.slice(0, 5);
};

const resolveValuationAnalysisFactors = (
  details: PropertyDetailsInput,
  propertyType: MarketPropertyType,
): PropertyValuationCriterion[] => {
  const characteristics = getCharacteristicsDetails(details);
  const regulation = getRegulationDetails(details);
  const amenities = getAmenitiesDetails(details);
  const factors: PropertyValuationCriterion[] = [];

  const pushFactor = (label: string, value: string | null): void => {
    if (!value) {
      return;
    }

    factors.push({ label, value });
  };

  const landArea = toFiniteNumber(characteristics.landArea);
  pushFactor(
    "Surface terrain",
    propertyType === "MAISON" && landArea !== null && landArea > 0 ? `${toFrInteger(landArea)} m²` : null,
  );
  const crawlSpaceRaw =
    typeof characteristics.crawlSpacePresence === "string"
      ? characteristics.crawlSpacePresence.trim().toUpperCase()
      : "";
  pushFactor("Présence vide sanitaire", CRAWL_SPACE_LABELS[crawlSpaceRaw] ?? (crawlSpaceRaw || null));

  const sanitationRaw =
    typeof characteristics.sanitationType === "string"
      ? characteristics.sanitationType.trim().toUpperCase()
      : "";
  pushFactor("Assainissement", SANITATION_TYPE_LABELS[sanitationRaw] ?? (sanitationRaw || null));
  if (sanitationRaw === "FOSSE_SEPTIQUE") {
    pushFactor(
      "Fosse septique aux normes",
      toYesNo(toBooleanLike(characteristics.septicTankCompliant)),
    );
  }

  pushFactor("Garage couvert", toYesNo(toBooleanLike(amenities.coveredGarage)));
  pushFactor("Carport", toYesNo(toBooleanLike(amenities.carport)));
  const hasPhotovoltaicPanels = toBooleanLike(amenities.photovoltaicPanels);
  pushFactor("Panneaux photovoltaïques", toYesNo(hasPhotovoltaicPanels));
  const photovoltaicAnnualIncome = toFiniteNumber(amenities.photovoltaicAnnualIncome);
  pushFactor(
    "Revenu annuel panneaux photovoltaïques",
    hasPhotovoltaicPanels === true && photovoltaicAnnualIncome !== null && photovoltaicAnnualIncome > 0
      ? `${toFrInteger(photovoltaicAnnualIncome)} €/an`
      : null,
  );

  pushFactor("Piscine", resolvePoolLabel(amenities.pool));
  pushFactor("Bien clôturé", toYesNo(toBooleanLike(amenities.fenced)));
  pushFactor("Présence d'amiante", toYesNo(toBooleanLike(regulation.asbestos)));
  pushFactor("Problème de fissures", toYesNo(toBooleanLike(characteristics.hasCracks)));
  pushFactor("Vis-à-vis", toYesNo(toBooleanLike(characteristics.hasVisAVis)));

  const noiseLevelRaw =
    typeof characteristics.noiseLevel === "string"
      ? characteristics.noiseLevel.trim().toUpperCase()
      : "";
  pushFactor("Niveau de bruit", NOISE_LEVEL_LABELS[noiseLevelRaw] ?? (noiseLevelRaw || null));

  const lastRenovationYear = toFiniteNumber(characteristics.lastRenovationYear);
  pushFactor(
    "Année de dernière rénovation",
    lastRenovationYear !== null && lastRenovationYear > 1800
      ? toFrInteger(Math.round(lastRenovationYear))
      : null,
  );

  pushFactor(
    "Détails complémentaires agent",
    formatDetailPromptValue(characteristics.agentAdditionalDetails),
  );

  return factors;
};

const buildValuationPrompt = (input: {
  property: Pick<PropertyRow, "id" | "title" | "address" | "city" | "postalCode" | "price">;
  propertyType: MarketPropertyType;
  criteriaUsed: PropertyValuationCriterion[];
  allPropertyCriteria: PropertyValuationCriterion[];
  analysisFactors: PropertyValuationCriterion[];
  askingPrice: number | null;
  filteredSummary: {
    count: number;
    medianPrice: number | null;
    medianPricePerM2: number | null;
    minPrice: number | null;
    maxPrice: number | null;
  };
  predictedPrice: number | null;
  latestPoints: ComparablePoint[];
  marketTrendRows: PropertyValuationMarketTrendYear[];
  filters: PropertyValuationAIComparableFilters;
  outputFormatTemplate: string;
}): string => {
  const criteriaText =
    input.criteriaUsed.length > 0
      ? input.criteriaUsed.map((criterion) => `- ${criterion.label}: ${criterion.value}`).join("\n")
      : "- Aucun critère clé renseigné";
  const allPropertyCriteriaText =
    input.allPropertyCriteria.length > 0
      ? input.allPropertyCriteria.map((criterion) => `- ${criterion.label}: ${criterion.value}`).join("\n")
      : "- Aucun critère renseigné";
  const analysisFactorsText =
    input.analysisFactors.length > 0
      ? input.analysisFactors.map((factor) => `- ${factor.label}: ${factor.value}`).join("\n")
      : "- Aucun facteur complémentaire renseigné";
  const latestSalesText =
    input.latestPoints.length > 0
      ? input.latestPoints
          .map(
            (point) =>
              `- ${point.saleDate.slice(0, 10)} | ${toFrInteger(point.surfaceM2)} m² | ${toFrInteger(
                point.salePrice,
              )} € | ${toFrInteger(point.pricePerM2)} €/m²`,
          )
          .join("\n")
      : "- Aucune vente comparable disponible avec les filtres";
  const marketTrendText =
    input.marketTrendRows.length > 0
      ? input.marketTrendRows
          .map((row) => {
            const salesVariation =
              row.salesCountVariationPct === null
                ? "N/A"
                : `${row.salesCountVariationPct > 0 ? "+" : ""}${toFrPercent(row.salesCountVariationPct)} %`;
            const avgPricePerM2Value =
              row.avgPricePerM2 === null ? "N/A" : `${toFrInteger(row.avgPricePerM2)} €/m²`;
            const avgPricePerM2Variation =
              row.avgPricePerM2VariationPct === null
                ? "N/A"
                : `${row.avgPricePerM2VariationPct > 0 ? "+" : ""}${toFrPercent(row.avgPricePerM2VariationPct)} %`;

            return `- ${row.year}: ${toFrInteger(row.salesCount)} ventes (${salesVariation} vs année précédente), prix moyen m² ${avgPricePerM2Value} (${avgPricePerM2Variation} vs année précédente)`;
          })
          .join("\n")
      : "- Aucune tendance disponible";

  return [
    "Contexte: analyse de valorisation immobilière pour fixer un prix de vente réaliste en France.",
    "",
    "Données bien:",
    `- ID: ${input.property.id}`,
    `- Titre: ${input.property.title}`,
    `- Type: ${input.propertyType}`,
    `- Adresse: ${input.property.address ?? "N/A"}`,
    `- Ville: ${input.property.postalCode} ${input.property.city}`,
    `- Prix de vente actuel: ${input.askingPrice !== null ? `${toFrInteger(input.askingPrice)} €` : "N/A"}`,
    "",
    "Critères clés (max 5):",
    criteriaText,
    "",
    "Tous les critères renseignés du bien:",
    allPropertyCriteriaText,
    "",
    "Facteurs complémentaires influençant la valorisation:",
    analysisFactorsText,
    "",
    "Filtres comparables actifs:",
    `- Rayon max: ${input.filters.radiusMaxM !== null && typeof input.filters.radiusMaxM === "number" ? `${toFrInteger(input.filters.radiusMaxM)} m` : "N/A"}`,
    `- Surface min: ${input.filters.surfaceMinM2 !== null && typeof input.filters.surfaceMinM2 === "number" ? `${toFrInteger(input.filters.surfaceMinM2)} m²` : "N/A"}`,
    `- Surface max: ${input.filters.surfaceMaxM2 !== null && typeof input.filters.surfaceMaxM2 === "number" ? `${toFrInteger(input.filters.surfaceMaxM2)} m²` : "N/A"}`,
    `- Surface terrain min: ${input.filters.landSurfaceMinM2 !== null && typeof input.filters.landSurfaceMinM2 === "number" ? `${toFrInteger(input.filters.landSurfaceMinM2)} m²` : "N/A"}`,
    `- Surface terrain max: ${input.filters.landSurfaceMaxM2 !== null && typeof input.filters.landSurfaceMaxM2 === "number" ? `${toFrInteger(input.filters.landSurfaceMaxM2)} m²` : "N/A"}`,
    "",
    "Synthèse comparables filtrés:",
    `- Nombre de ventes: ${input.filteredSummary.count}`,
    `- Prix median comparables: ${input.filteredSummary.medianPrice !== null ? `${toFrInteger(input.filteredSummary.medianPrice)} €` : "N/A"}`,
    `- Prix median m²: ${input.filteredSummary.medianPricePerM2 !== null ? `${toFrInteger(input.filteredSummary.medianPricePerM2)} €/m²` : "N/A"}`,
    `- Prix min: ${input.filteredSummary.minPrice !== null ? `${toFrInteger(input.filteredSummary.minPrice)} €` : "N/A"}`,
    `- Prix max: ${input.filteredSummary.maxPrice !== null ? `${toFrInteger(input.filteredSummary.maxPrice)} €` : "N/A"}`,
    `- Prix estime par regression: ${input.predictedPrice !== null ? `${toFrInteger(input.predictedPrice)} €` : "N/A"}`,
    "",
    "Évolution du marché sur 5 ans (comparables filtrés):",
    marketTrendText,
    "",
    "Exemples de ventes récentes utilisées:",
    latestSalesText,
    "",
    "Consigne de sortie:",
    "Retourne un JSON strict avec les clés calculatedValuation (number|null) et justification (string).",
    "Ne renvoie aucun texte hors JSON (pas de préambule, pas de bloc ```json).",
    "La justification doit être rédigée en Markdown et respecter strictement le format de sortie attendu ci-dessous.",
    "Le format ci-dessous définit uniquement la structure de la clé justification et ne remplace pas les autres consignes du prompt.",
    "Format de sortie attendu pour la clé justification (à adapter avec les données réelles du bien):",
    input.outputFormatTemplate,
    "Si les données sont insuffisantes, renvoie calculatedValuation: null avec une justification markdown expliquant pourquoi.",
  ].join("\n");
};

const ensureMarkdownValuationJustification = (rawValue: string): string => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return "## Justificatif\n\n- Justificatif IA indisponible.";
  }

  const looksLikeMarkdown = /(^|\n)\s{0,3}#{1,6}\s+\S/.test(trimmed) || /(^|\n)\s*[-*]\s+\S/.test(trimmed);
  if (looksLikeMarkdown) {
    return trimmed;
  }

  const normalizedLines = trimmed
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (normalizedLines.length === 0) {
    return "## Justificatif\n\n- Justificatif IA indisponible.";
  }

  return `## Justificatif\n\n${normalizedLines.map((line) => `- ${line}`).join("\n")}`;
};

const toRadians = (value: number): number => (value * Math.PI) / 180;

const haversineDistanceMeters = (input: {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
}): number => {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(input.toLat - input.fromLat);
  const dLon = toRadians(input.toLon - input.fromLon);
  const lat1 = toRadians(input.fromLat);
  const lat2 = toRadians(input.toLat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
};

const computeRegression = (
  points: Array<{ surfaceM2: number; salePrice: number }>,
): {
  slope: number | null;
  intercept: number | null;
  r2: number | null;
  pointsUsed: number;
} => {
  const valid = points.filter(
    (point) =>
      Number.isFinite(point.surfaceM2) &&
      Number.isFinite(point.salePrice) &&
      point.surfaceM2 > 0 &&
      point.salePrice > 0,
  );

  if (valid.length < 2) {
    return {
      slope: null,
      intercept: null,
      r2: null,
      pointsUsed: valid.length,
    };
  }

  const n = valid.length;
  const sumX = valid.reduce((sum, point) => sum + point.surfaceM2, 0);
  const sumY = valid.reduce((sum, point) => sum + point.salePrice, 0);
  const sumXY = valid.reduce((sum, point) => sum + point.surfaceM2 * point.salePrice, 0);
  const sumXX = valid.reduce((sum, point) => sum + point.surfaceM2 * point.surfaceM2, 0);
  const denominator = n * sumXX - sumX * sumX;

  if (denominator === 0) {
    return {
      slope: null,
      intercept: null,
      r2: null,
      pointsUsed: valid.length,
    };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  const totalVariance = valid.reduce((sum, point) => {
    const diff = point.salePrice - meanY;
    return sum + diff * diff;
  }, 0);

  const residualVariance = valid.reduce((sum, point) => {
    const predicted = slope * point.surfaceM2 + intercept;
    const diff = point.salePrice - predicted;
    return sum + diff * diff;
  }, 0);

  const r2 = totalVariance === 0 ? 1 : 1 - residualVariance / totalVariance;

  return {
    slope: formatComparableNumber(slope),
    intercept: formatComparableNumber(intercept),
    r2: formatComparableNumber(r2),
    pointsUsed: valid.length,
  };
};

const computePredictedPrice = (input: {
  surfaceM2: number | null;
  slope: number | null;
  intercept: number | null;
}): number | null => {
  if (
    input.surfaceM2 === null ||
    input.slope === null ||
    input.intercept === null ||
    !Number.isFinite(input.surfaceM2) ||
    !Number.isFinite(input.slope) ||
    !Number.isFinite(input.intercept) ||
    input.surfaceM2 <= 0
  ) {
    return null;
  }

  const predicted = input.slope * input.surfaceM2 + input.intercept;
  if (!Number.isFinite(predicted) || predicted <= 0) {
    return null;
  }

  return formatComparableNumber(predicted);
};

const filterComparablesBySubjectSurfaceRange = (input: {
  points: ComparablePoint[];
  subjectSurfaceM2: number | null;
}): ComparablePoint[] => {
  if (
    input.subjectSurfaceM2 === null ||
    !Number.isFinite(input.subjectSurfaceM2) ||
    input.subjectSurfaceM2 <= 0
  ) {
    return input.points;
  }

  const minSurfaceM2 = input.subjectSurfaceM2 * COMPARABLE_SUBJECT_SURFACE_MIN_FACTOR;
  const maxSurfaceM2 = input.subjectSurfaceM2 * COMPARABLE_SUBJECT_SURFACE_MAX_FACTOR;
  return input.points.filter((point) => {
    return point.surfaceM2 >= minSurfaceM2 && point.surfaceM2 <= maxSurfaceM2;
  });
};

const filterComparablesByMinPricePerM2 = (points: ComparablePoint[]): ComparablePoint[] =>
  points.filter((point) => {
    const pricePerM2 =
      Number.isFinite(point.pricePerM2) && point.pricePerM2 > 0
        ? point.pricePerM2
        : Number.isFinite(point.salePrice) &&
            point.salePrice > 0 &&
            Number.isFinite(point.surfaceM2) &&
            point.surfaceM2 > 0
          ? point.salePrice / point.surfaceM2
          : null;

    return (
      typeof pricePerM2 === "number" &&
      Number.isFinite(pricePerM2) &&
      pricePerM2 >= COMPARABLE_MIN_PRICE_PER_M2
    );
  });

const resolvePricingPosition = (input: {
  askingPrice: number | null;
  predictedPrice: number | null;
}): {
  deviationPct: number | null;
  pricingPosition: ComparablePricingPosition;
} => {
  if (
    typeof input.askingPrice !== "number" ||
    !Number.isFinite(input.askingPrice) ||
    input.askingPrice <= 0 ||
    typeof input.predictedPrice !== "number" ||
    !Number.isFinite(input.predictedPrice) ||
    input.predictedPrice <= 0
  ) {
    return {
      deviationPct: null,
      pricingPosition: "UNKNOWN",
    };
  }

  const deviation = (input.askingPrice - input.predictedPrice) / input.predictedPrice;
  const roundedPct = formatComparableNumber(deviation * 100);

  if (deviation < -COMPARABLE_PRICE_TOLERANCE) {
    return {
      deviationPct: roundedPct,
      pricingPosition: "UNDER_PRICED",
    };
  }

  if (deviation > COMPARABLE_PRICE_TOLERANCE) {
    return {
      deviationPct: roundedPct,
      pricingPosition: "OVER_PRICED",
    };
  }

  return {
    deviationPct: roundedPct,
    pricingPosition: "NORMAL",
  };
};

const createComparableCacheKey = (input: {
  orgId: string;
  propertyId: string;
  propertyType: MarketPropertyType;
  latitude: number;
  longitude: number;
}): {
  cacheKey: string;
  signature: string;
} => {
  const signaturePayload = {
    cacheVersion: COMPARABLE_CACHE_VERSION,
    orgId: input.orgId,
    propertyId: input.propertyId,
    propertyType: input.propertyType,
    windowYears: COMPARABLE_WINDOW_YEARS,
    radiusSteps: COMPARABLE_RADIUS_STEPS,
    targetCount: COMPARABLE_TARGET_COUNT,
    center: {
      latitude: formatComparableNumber(input.latitude),
      longitude: formatComparableNumber(input.longitude),
    },
  };

  const signature = JSON.stringify(signaturePayload);
  const cacheKey = createHash("sha256").update(signature).digest("hex");
  return { cacheKey, signature };
};

const parseCachedComparables = (rawJson: string): PropertyComparablesResponse | null => {
  try {
    const parsed = JSON.parse(rawJson);
    if (!isRecord(parsed) || !Array.isArray(parsed.points)) {
      return null;
    }

    return parsed as PropertyComparablesResponse;
  } catch {
    return null;
  }
};

export const propertiesService = {
  async list(input: ListPropertiesInput) {
    const cursorValue = parseCursor(input.cursor);

    const whereClause = cursorValue
      ? and(
          eq(properties.orgId, input.orgId),
          lt(properties.createdAt, new Date(cursorValue)),
        )
      : eq(properties.orgId, input.orgId);

    const rows = await db
      .select()
      .from(properties)
      .where(whereClause)
      .orderBy(desc(properties.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const sliced = hasMore ? rows.slice(0, input.limit) : rows;
    const lastItem = sliced.at(-1);

    return {
      items: sliced.map(toPropertyResponse),
      nextCursor: hasMore && lastItem ? String(lastItem.createdAt.getTime()) : null,
    };
  },

  async create(input: {
    orgId: string;
    title: string;
    city: string;
    postalCode: string;
    address: string;
    owner?: OwnerContactInput;
    ownerUserId?: string;
    details?: PropertyDetailsInput;
  }) {
    const now = new Date();
    const id = crypto.randomUUID();

    if (!input.owner && !input.ownerUserId) {
      throw new HttpError(
        400,
        "INVALID_OWNER_SELECTION",
        "Un proprietaire existant ou un nouveau proprietaire est requis",
      );
    }

    const detailsWithCoordinates = await withGeocodedCoordinates({
      details: input.details ?? {},
      address: input.address,
      postalCode: input.postalCode,
      city: input.city,
    });

    await db.transaction(async (tx) => {
      let ownerUserId: string;

      if (input.ownerUserId) {
        const existingUser = await tx.query.users.findFirst({
          where: and(eq(users.id, input.ownerUserId), eq(users.orgId, input.orgId)),
        });

        if (!existingUser) {
          throw new HttpError(404, "USER_NOT_FOUND", "Utilisateur proprietaire introuvable");
        }

        if (existingUser.accountType !== "CLIENT") {
          throw new HttpError(
            400,
            "OWNER_MUST_BE_CLIENT",
            "Le proprietaire doit etre un utilisateur de type client",
          );
        }

        ownerUserId = existingUser.id;
      } else {
        const owner = input.owner!;
        const normalizedOwnerEmail = owner.email.trim().toLowerCase();
        const normalizedOwnerPhone = owner.phone.trim();

        const existingOwner = await tx.query.users.findFirst({
          where: eq(users.email, normalizedOwnerEmail),
        });

        if (existingOwner) {
          if (existingOwner.orgId !== input.orgId) {
            throw new HttpError(
              409,
              "OWNER_EMAIL_ALREADY_USED",
              "Cet email proprietaire est deja utilise par une autre organisation",
            );
          }

          if (existingOwner.accountType !== "CLIENT") {
            throw new HttpError(
              400,
              "OWNER_MUST_BE_CLIENT",
              "Le proprietaire doit etre un utilisateur de type client",
            );
          }

          ownerUserId = existingOwner.id;
          await tx
            .update(users)
            .set({
              firstName: owner.firstName,
              lastName: owner.lastName,
              phone: normalizedOwnerPhone,
              address: normalizeOptionalString(owner.address) ?? null,
              postalCode: normalizeOptionalString(owner.postalCode) ?? null,
              city: normalizeOptionalString(owner.city) ?? null,
              updatedAt: now,
            })
            .where(and(eq(users.id, existingOwner.id), eq(users.orgId, input.orgId)));
        } else {
          ownerUserId = crypto.randomUUID();
          const passwordHash = await Bun.password.hash(generateRandomPassword());

          await tx.insert(users).values({
            id: ownerUserId,
            orgId: input.orgId,
            email: normalizedOwnerEmail,
            firstName: owner.firstName,
            lastName: owner.lastName,
            phone: normalizedOwnerPhone,
            address: normalizeOptionalString(owner.address) ?? null,
            postalCode: normalizeOptionalString(owner.postalCode) ?? null,
            city: normalizeOptionalString(owner.city) ?? null,
            accountType: "CLIENT",
            role: resolveRoleFromAccountType("CLIENT"),
            passwordHash,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      await tx.insert(properties).values({
        id,
        orgId: input.orgId,
        title: input.title,
        city: input.city,
        postalCode: input.postalCode,
        address: input.address,
        price: null,
        details: JSON.stringify(detailsWithCoordinates),
        hiddenExpectedDocumentKeys: "[]",
        status: "PROSPECTION",
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(propertyUserLinks).values({
        id: crypto.randomUUID(),
        orgId: input.orgId,
        propertyId: id,
        userId: ownerUserId,
        role: "OWNER",
        createdAt: now,
      });
    });

    const created = await db.query.properties.findFirst({
      where: and(eq(properties.id, id), eq(properties.orgId, input.orgId)),
    });

    if (!created) {
      throw new HttpError(500, "PROPERTY_CREATE_FAILED", "Création du bien impossible");
    }

    return toPropertyResponse(created);
  },

  async getById(input: { orgId: string; id: string }) {
    const property = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.id), eq(properties.orgId, input.orgId)),
    });

    if (!property) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    return toPropertyResponse(property);
  },

  async patchById(input: {
    orgId: string;
    id: string;
    data: {
      title?: string;
      city?: string;
      postalCode?: string;
      address?: string;
      price?: number;
      details?: PropertyDetailsInput;
      hiddenExpectedDocumentKeys?: string[];
    };
  }) {
    const existing = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.id), eq(properties.orgId, input.orgId)),
    });

    if (!existing) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    const mergedDetails =
      input.data.details === undefined
        ? parseDetails(existing.details)
        : {
            ...parseDetails(existing.details),
            ...input.data.details,
          };

    const nextAddress = input.data.address ?? existing.address ?? "";
    const nextPostalCode = input.data.postalCode ?? existing.postalCode;
    const nextCity = input.data.city ?? existing.city;
    const shouldRefreshCoordinates =
      (input.data.address !== undefined && input.data.address !== existing.address) ||
      (input.data.postalCode !== undefined && input.data.postalCode !== existing.postalCode) ||
      (input.data.city !== undefined && input.data.city !== existing.city);

    const detailsWithCoordinates = shouldRefreshCoordinates
      ? await withGeocodedCoordinates({
          details: mergedDetails,
          address: nextAddress,
          postalCode: nextPostalCode,
          city: nextCity,
        })
      : mergedDetails;
    const nextHiddenExpectedDocumentKeys =
      input.data.hiddenExpectedDocumentKeys === undefined
        ? parseHiddenExpectedDocumentKeys(existing.hiddenExpectedDocumentKeys)
        : sanitizeHiddenExpectedDocumentKeys(input.data.hiddenExpectedDocumentKeys);

    await db
      .update(properties)
      .set({
        title: input.data.title ?? existing.title,
        city: input.data.city ?? existing.city,
        postalCode: input.data.postalCode ?? existing.postalCode,
        address: input.data.address ?? existing.address,
        price:
          input.data.price === undefined ? existing.price : Math.round(input.data.price),
        details: JSON.stringify(detailsWithCoordinates),
        hiddenExpectedDocumentKeys: JSON.stringify(nextHiddenExpectedDocumentKeys),
        updatedAt: new Date(),
      })
      .where(and(eq(properties.id, input.id), eq(properties.orgId, input.orgId)));

    const updated = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.id), eq(properties.orgId, input.orgId)),
    });

    if (!updated) {
      throw new HttpError(500, "PROPERTY_PATCH_FAILED", "Mise à jour impossible");
    }

    return toPropertyResponse(updated);
  },

  async updateStatus(input: {
    orgId: string;
    id: string;
    status: string;
  }) {
    const existing = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.id), eq(properties.orgId, input.orgId)),
    });

    if (!existing) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    const now = new Date();
    await db
      .update(properties)
      .set({
        status: input.status,
        updatedAt: now,
      })
      .where(and(eq(properties.id, input.id), eq(properties.orgId, input.orgId)));

    await db.insert(propertyTimelineEvents).values({
      id: crypto.randomUUID(),
      propertyId: existing.id,
      orgId: input.orgId,
      eventType: "PROPERTY_STATUS_CHANGED",
      payload: JSON.stringify({
        from: existing.status,
        to: input.status,
      }),
      createdAt: now,
    });

    const updated = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.id), eq(properties.orgId, input.orgId)),
    });

    if (!updated) {
      throw new HttpError(500, "PROPERTY_PATCH_FAILED", "Mise à jour impossible");
    }

    return toPropertyResponse(updated);
  },

  async listProspects(input: {
    orgId: string;
    propertyId: string;
  }) {
    const property = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.propertyId), eq(properties.orgId, input.orgId)),
    });

    if (!property) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    const rows = await db
      .select({
        id: propertyUserLinks.id,
        propertyId: propertyUserLinks.propertyId,
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        address: users.address,
        postalCode: users.postalCode,
        city: users.city,
        relationRole: propertyUserLinks.role,
        createdAt: propertyUserLinks.createdAt,
      })
      .from(propertyUserLinks)
      .innerJoin(
        users,
        and(eq(propertyUserLinks.userId, users.id), eq(users.orgId, input.orgId)),
      )
      .where(
        and(
          eq(propertyUserLinks.orgId, input.orgId),
          eq(propertyUserLinks.propertyId, input.propertyId),
          inArray(propertyUserLinks.role, ["PROSPECT", "ACHETEUR"]),
        ),
      )
      .orderBy(desc(propertyUserLinks.createdAt));

    return {
      items: rows.map((item) => ({
        id: item.id,
        propertyId: item.propertyId,
        userId: item.userId,
        firstName: item.firstName,
        lastName: item.lastName,
        email: item.email,
        phone: item.phone,
        address: item.address,
        postalCode: item.postalCode,
        city: item.city,
        relationRole: item.relationRole,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  },

  async addProspect(input: {
    orgId: string;
    propertyId: string;
    userId?: string;
    newClient?: ProspectContactInput;
  }) {
    const property = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.propertyId), eq(properties.orgId, input.orgId)),
    });

    if (!property) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    if (!input.userId && !input.newClient) {
      throw new HttpError(
        400,
        "INVALID_PROSPECT_SELECTION",
        "Un client existant ou un nouveau client est requis",
      );
    }

    const now = new Date();
    let userId = input.userId ?? "";
    let client = userId
      ? await db.query.users.findFirst({
          where: and(eq(users.id, userId), eq(users.orgId, input.orgId)),
        })
      : null;

    if (input.userId) {
      if (!client) {
        throw new HttpError(404, "USER_NOT_FOUND", "Client introuvable");
      }

      if (client.accountType !== "CLIENT") {
        throw new HttpError(
          400,
          "PROSPECT_MUST_BE_CLIENT",
          "Le prospect doit etre un utilisateur de type client",
        );
      }
    } else if (input.newClient) {
      const normalizedEmail = input.newClient.email.trim().toLowerCase();
      const existingByEmail = await db.query.users.findFirst({
        where: eq(users.email, normalizedEmail),
      });

      if (existingByEmail) {
        if (existingByEmail.orgId !== input.orgId) {
          throw new HttpError(
            409,
            "EMAIL_ALREADY_USED",
            "Cet email est deja utilise par une autre organisation",
          );
        }

        if (existingByEmail.accountType !== "CLIENT") {
          throw new HttpError(
            400,
            "PROSPECT_MUST_BE_CLIENT",
            "Le prospect doit etre un utilisateur de type client",
          );
        }

        userId = existingByEmail.id;
        await db
          .update(users)
          .set({
            firstName: input.newClient.firstName,
            lastName: input.newClient.lastName,
            phone: input.newClient.phone.trim(),
            address: normalizeOptionalString(input.newClient.address) ?? null,
            postalCode: normalizeOptionalString(input.newClient.postalCode) ?? null,
            city: normalizeOptionalString(input.newClient.city) ?? null,
            updatedAt: now,
          })
          .where(and(eq(users.id, userId), eq(users.orgId, input.orgId)));

        client = await db.query.users.findFirst({
          where: and(eq(users.id, userId), eq(users.orgId, input.orgId)),
        });
      } else {
        userId = crypto.randomUUID();
        const passwordHash = await Bun.password.hash(generateRandomPassword());

        await db.insert(users).values({
          id: userId,
          orgId: input.orgId,
          firstName: input.newClient.firstName,
          lastName: input.newClient.lastName,
          email: normalizedEmail,
          phone: input.newClient.phone.trim(),
          address: normalizeOptionalString(input.newClient.address) ?? null,
          postalCode: normalizeOptionalString(input.newClient.postalCode) ?? null,
          city: normalizeOptionalString(input.newClient.city) ?? null,
          accountType: "CLIENT",
          role: resolveRoleFromAccountType("CLIENT"),
          passwordHash,
          createdAt: now,
          updatedAt: now,
        });

        client = await db.query.users.findFirst({
          where: and(eq(users.id, userId), eq(users.orgId, input.orgId)),
        });
      }
    }

    if (!client) {
      throw new HttpError(500, "PROSPECT_CREATE_FAILED", "Impossible de recuperer le client");
    }

    const existingLink = await db.query.propertyUserLinks.findFirst({
      where: and(
        eq(propertyUserLinks.propertyId, input.propertyId),
        eq(propertyUserLinks.userId, userId),
        eq(propertyUserLinks.orgId, input.orgId),
      ),
    });

    let linkId = existingLink?.id ?? "";
    if (existingLink) {
      if (existingLink.role === "OWNER") {
        throw new HttpError(
          409,
          "PROSPECT_ALREADY_OWNER",
          "Ce client est deja proprietaire de ce bien",
        );
      }

      if (existingLink.role !== "PROSPECT") {
        await db
          .update(propertyUserLinks)
          .set({ role: "PROSPECT" })
          .where(eq(propertyUserLinks.id, existingLink.id));
      }
    } else {
      linkId = crypto.randomUUID();
      await db.insert(propertyUserLinks).values({
        id: linkId,
        orgId: input.orgId,
        propertyId: input.propertyId,
        userId,
        role: "PROSPECT",
        createdAt: now,
      });
    }

    return {
      id: linkId || existingLink?.id || "",
      propertyId: input.propertyId,
      userId: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone,
      address: client.address,
      postalCode: client.postalCode,
      city: client.city,
      relationRole: "PROSPECT",
      createdAt: (existingLink?.createdAt ?? now).toISOString(),
    };
  },

  async listVisits(input: {
    orgId: string;
    propertyId: string;
  }) {
    const property = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.propertyId), eq(properties.orgId, input.orgId)),
    });

    if (!property) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    const rows = await db
      .select({
        id: propertyVisits.id,
        propertyId: propertyVisits.propertyId,
        propertyTitle: properties.title,
        prospectUserId: propertyVisits.prospectUserId,
        prospectFirstName: users.firstName,
        prospectLastName: users.lastName,
        prospectEmail: users.email,
        prospectPhone: users.phone,
        startsAt: propertyVisits.startsAt,
        endsAt: propertyVisits.endsAt,
        compteRendu: propertyVisits.compteRendu,
        bonDeVisiteFileId: propertyVisits.bonDeVisiteFileId,
        bonDeVisiteFileName: files.fileName,
        createdAt: propertyVisits.createdAt,
        updatedAt: propertyVisits.updatedAt,
      })
      .from(propertyVisits)
      .innerJoin(
        properties,
        and(
          eq(propertyVisits.propertyId, properties.id),
          eq(properties.orgId, input.orgId),
        ),
      )
      .innerJoin(
        users,
        and(
          eq(propertyVisits.prospectUserId, users.id),
          eq(users.orgId, input.orgId),
        ),
      )
      .leftJoin(
        files,
        and(
          eq(propertyVisits.bonDeVisiteFileId, files.id),
          eq(files.orgId, input.orgId),
        ),
      )
      .where(
        and(
          eq(propertyVisits.orgId, input.orgId),
          eq(propertyVisits.propertyId, input.propertyId),
        ),
      )
      .orderBy(desc(propertyVisits.startsAt));

    return {
      items: rows.map(toPropertyVisitResponse),
    };
  },

  async addVisit(input: {
    orgId: string;
    propertyId: string;
    prospectUserId: string;
    startsAt: string;
    endsAt: string;
  }) {
    const startsAt = parseIsoDateTime(
      input.startsAt,
      "INVALID_VISIT_START",
      "La date de debut de visite est invalide",
    );
    const endsAt = parseIsoDateTime(
      input.endsAt,
      "INVALID_VISIT_END",
      "La date de fin de visite est invalide",
    );

    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new HttpError(
        400,
        "INVALID_VISIT_TIME_RANGE",
        "L'heure de fin doit etre apres l'heure de debut",
      );
    }

    const property = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.propertyId), eq(properties.orgId, input.orgId)),
    });

    if (!property) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    const prospect = await db.query.users.findFirst({
      where: and(eq(users.id, input.prospectUserId), eq(users.orgId, input.orgId)),
    });

    if (!prospect) {
      throw new HttpError(404, "USER_NOT_FOUND", "Prospect introuvable");
    }

    if (prospect.accountType !== "CLIENT") {
      throw new HttpError(
        400,
        "PROSPECT_MUST_BE_CLIENT",
        "Le prospect doit etre un utilisateur de type client",
      );
    }

    const existingLink = await db.query.propertyUserLinks.findFirst({
      where: and(
        eq(propertyUserLinks.orgId, input.orgId),
        eq(propertyUserLinks.propertyId, input.propertyId),
        eq(propertyUserLinks.userId, input.prospectUserId),
      ),
    });

    if (existingLink?.role === "OWNER") {
      throw new HttpError(
        400,
        "PROSPECT_ALREADY_OWNER",
        "Ce client est deja proprietaire de ce bien",
      );
    }

    const now = new Date();

    if (!existingLink) {
      await db.insert(propertyUserLinks).values({
        id: crypto.randomUUID(),
        orgId: input.orgId,
        propertyId: input.propertyId,
        userId: input.prospectUserId,
        role: "PROSPECT",
        createdAt: now,
      });
    } else if (existingLink.role !== "PROSPECT" && existingLink.role !== "ACHETEUR") {
      await db
        .update(propertyUserLinks)
        .set({ role: "PROSPECT" })
        .where(eq(propertyUserLinks.id, existingLink.id));
    }

    const visitId = crypto.randomUUID();

    await db.insert(propertyVisits).values({
      id: visitId,
      orgId: input.orgId,
      propertyId: input.propertyId,
      prospectUserId: input.prospectUserId,
      startsAt,
      endsAt,
      compteRendu: null,
      bonDeVisiteFileId: null,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(propertyTimelineEvents).values({
      id: crypto.randomUUID(),
      propertyId: input.propertyId,
      orgId: input.orgId,
      eventType: "VISIT_SCHEDULED",
      payload: JSON.stringify({
        visitId,
        prospectUserId: input.prospectUserId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      }),
      createdAt: now,
    });

    return {
      id: visitId,
      propertyId: input.propertyId,
      propertyTitle: property.title,
      prospectUserId: prospect.id,
      prospectFirstName: prospect.firstName,
      prospectLastName: prospect.lastName,
      prospectEmail: prospect.email,
      prospectPhone: prospect.phone,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      compteRendu: null,
      bonDeVisiteFileId: null,
      bonDeVisiteFileName: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  },

  async getVisitById(input: {
    orgId: string;
    id: string;
  }) {
    const rows = await db
      .select({
        id: propertyVisits.id,
        propertyId: propertyVisits.propertyId,
        propertyTitle: properties.title,
        prospectUserId: propertyVisits.prospectUserId,
        prospectFirstName: users.firstName,
        prospectLastName: users.lastName,
        prospectEmail: users.email,
        prospectPhone: users.phone,
        startsAt: propertyVisits.startsAt,
        endsAt: propertyVisits.endsAt,
        compteRendu: propertyVisits.compteRendu,
        bonDeVisiteFileId: propertyVisits.bonDeVisiteFileId,
        bonDeVisiteFileName: files.fileName,
        createdAt: propertyVisits.createdAt,
        updatedAt: propertyVisits.updatedAt,
      })
      .from(propertyVisits)
      .innerJoin(
        properties,
        and(eq(propertyVisits.propertyId, properties.id), eq(properties.orgId, input.orgId)),
      )
      .innerJoin(
        users,
        and(eq(propertyVisits.prospectUserId, users.id), eq(users.orgId, input.orgId)),
      )
      .leftJoin(
        files,
        and(
          eq(propertyVisits.bonDeVisiteFileId, files.id),
          eq(files.orgId, input.orgId),
        ),
      )
      .where(and(eq(propertyVisits.id, input.id), eq(propertyVisits.orgId, input.orgId)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new HttpError(404, "VISIT_NOT_FOUND", "Visite introuvable");
    }

    return toPropertyVisitResponse(row);
  },

  async patchVisitById(input: {
    orgId: string;
    id: string;
    data: {
      compteRendu?: string | null;
      bonDeVisiteFileId?: string | null;
    };
  }) {
    const existingVisit = await db.query.propertyVisits.findFirst({
      where: and(eq(propertyVisits.id, input.id), eq(propertyVisits.orgId, input.orgId)),
    });

    if (!existingVisit) {
      throw new HttpError(404, "VISIT_NOT_FOUND", "Visite introuvable");
    }

    const nextCompteRenduNormalized = normalizeOptionalString(input.data.compteRendu);
    const nextBonDeVisiteFileIdNormalized = normalizeOptionalString(input.data.bonDeVisiteFileId);
    const nextCompteRendu =
      nextCompteRenduNormalized === undefined
        ? existingVisit.compteRendu
        : nextCompteRenduNormalized;
    const nextBonDeVisiteFileId =
      nextBonDeVisiteFileIdNormalized === undefined
        ? existingVisit.bonDeVisiteFileId
        : nextBonDeVisiteFileIdNormalized;

    if (nextBonDeVisiteFileId) {
      const matchingFile = await db.query.files.findFirst({
        where: and(
          eq(files.id, nextBonDeVisiteFileId),
          eq(files.orgId, input.orgId),
          eq(files.propertyId, existingVisit.propertyId),
        ),
      });

      if (!matchingFile) {
        throw new HttpError(
          400,
          "INVALID_VISIT_ATTENDANCE_SHEET_FILE",
          "Le bon de visite doit etre un fichier du meme bien",
        );
      }
    }

    await db
      .update(propertyVisits)
      .set({
        compteRendu: nextCompteRendu,
        bonDeVisiteFileId: nextBonDeVisiteFileId,
        updatedAt: new Date(),
      })
      .where(and(eq(propertyVisits.id, input.id), eq(propertyVisits.orgId, input.orgId)));

    return this.getVisitById({
      orgId: input.orgId,
      id: input.id,
    });
  },

  async listCalendarVisits(input: {
    orgId: string;
    from?: string;
    to?: string;
  }) {
    const fromDate = input.from
      ? parseIsoDateTime(input.from, "INVALID_CALENDAR_FROM", "La borne de debut est invalide")
      : null;
    const toDate = input.to
      ? parseIsoDateTime(input.to, "INVALID_CALENDAR_TO", "La borne de fin est invalide")
      : null;

    const filters = [eq(propertyVisits.orgId, input.orgId)];

    if (fromDate) {
      filters.push(gt(propertyVisits.endsAt, fromDate));
    }

    if (toDate) {
      filters.push(lt(propertyVisits.startsAt, toDate));
    }

    const rows = await db
      .select({
        id: propertyVisits.id,
        propertyId: propertyVisits.propertyId,
        propertyTitle: properties.title,
        prospectUserId: propertyVisits.prospectUserId,
        prospectFirstName: users.firstName,
        prospectLastName: users.lastName,
        prospectEmail: users.email,
        prospectPhone: users.phone,
        startsAt: propertyVisits.startsAt,
        endsAt: propertyVisits.endsAt,
        compteRendu: propertyVisits.compteRendu,
        bonDeVisiteFileId: propertyVisits.bonDeVisiteFileId,
        bonDeVisiteFileName: files.fileName,
        createdAt: propertyVisits.createdAt,
        updatedAt: propertyVisits.updatedAt,
      })
      .from(propertyVisits)
      .innerJoin(
        properties,
        and(eq(propertyVisits.propertyId, properties.id), eq(properties.orgId, input.orgId)),
      )
      .innerJoin(
        users,
        and(eq(propertyVisits.prospectUserId, users.id), eq(users.orgId, input.orgId)),
      )
      .leftJoin(
        files,
        and(
          eq(propertyVisits.bonDeVisiteFileId, files.id),
          eq(files.orgId, input.orgId),
        ),
      )
      .where(and(...filters))
      .orderBy(propertyVisits.startsAt);

    return {
      items: rows.map(toPropertyVisitResponse),
    };
  },

  async addParticipant(input: {
    orgId: string;
    propertyId: string;
    contactId: string;
    role: string;
  }) {
    const property = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.propertyId), eq(properties.orgId, input.orgId)),
    });

    if (!property) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    const createdAt = new Date();
    const participantId = crypto.randomUUID();

    await db.insert(propertyParties).values({
      id: participantId,
      propertyId: input.propertyId,
      orgId: input.orgId,
      contactId: input.contactId,
      role: input.role,
      createdAt,
    });

    return {
      id: participantId,
      propertyId: input.propertyId,
      contactId: input.contactId,
      role: input.role,
      createdAt: createdAt.toISOString(),
    };
  },

  async getComparables(input: {
    orgId: string;
    propertyId: string;
    propertyType?: MarketPropertyType;
    forceRefresh?: boolean;
  }): Promise<PropertyComparablesResponse> {
    const property = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.propertyId), eq(properties.orgId, input.orgId)),
    });

    if (!property) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    const details = parseDetails(property.details);

    const resolvedPropertyType = input.propertyType ?? resolvePropertyTypeFromDetails(details);
    if (!resolvedPropertyType) {
      throw new HttpError(
        400,
        "PROPERTY_TYPE_REQUIRED",
        "Le type de bien est requis pour recuperer les comparables",
      );
    }

    const locationDetails = getLocationDetails(details);
    let latitude = toFiniteNumber(locationDetails.gpsLat);
    let longitude = toFiniteNumber(locationDetails.gpsLng);

    if ((latitude === null || longitude === null) && property.address) {
      const geocoded = await findCoordinatesForAddress({
        address: property.address,
        postalCode: property.postalCode,
        city: property.city,
      });

      latitude = geocoded?.latitude ?? null;
      longitude = geocoded?.longitude ?? null;
    }

    if (latitude === null || longitude === null) {
      throw new HttpError(
        400,
        "PROPERTY_COORDINATES_REQUIRED",
        "Coordonnees GPS manquantes pour recuperer les comparables",
      );
    }

    const { cacheKey, signature } = createComparableCacheKey({
      orgId: input.orgId,
      propertyId: input.propertyId,
      propertyType: resolvedPropertyType,
      latitude,
      longitude,
    });

    const now = new Date();

    if (!input.forceRefresh) {
      const cached = await db.query.marketDvfQueryCache.findFirst({
        where: and(
          eq(marketDvfQueryCache.orgId, input.orgId),
          eq(marketDvfQueryCache.propertyId, input.propertyId),
          eq(marketDvfQueryCache.cacheKey, cacheKey),
          gt(marketDvfQueryCache.expiresAt, now),
        ),
      });

      if (cached) {
        const parsed = parseCachedComparables(cached.responseJson);
        if (parsed) {
          return {
            ...parsed,
            source: "CACHE",
          };
        }
      }
    }

    const toDate = new Date();
    const fromDate = new Date(toDate);
    fromDate.setFullYear(toDate.getFullYear() - COMPARABLE_WINDOW_YEARS);

    const transactionsByHash = new Map<string, Awaited<ReturnType<typeof fetchOpenDataComparables>>[number]>();
    const radiiTried: number[] = [];
    let finalRadiusM: number = COMPARABLE_RADIUS_STEPS[0];
    let lastFetchError: unknown = null;

    for (const radiusM of COMPARABLE_RADIUS_STEPS) {
      finalRadiusM = radiusM;
      radiiTried.push(radiusM);

      let fetched: Awaited<ReturnType<typeof fetchOpenDataComparables>> = [];
      try {
        fetched = await fetchOpenDataComparables({
          latitude,
          longitude,
          radiusM,
          propertyType: resolvedPropertyType,
          fromDate,
          toDate,
          limit: 500,
        });
      } catch (error) {
        lastFetchError = error;
        if (transactionsByHash.size === 0) {
          throw new HttpError(
            502,
            "DVF_UNAVAILABLE",
            "La source DVF est temporairement indisponible",
            toDvfUnavailableDetails(error),
          );
        }

        break;
      }

      const inWindow = fetched.filter(
        (row) => row.saleDate.getTime() >= fromDate.getTime() && row.saleDate.getTime() <= toDate.getTime(),
      );

      if (inWindow.length > 0) {
        await db
          .insert(marketDvfTransactions)
          .values(
            inWindow.map((row) => ({
              id: crypto.randomUUID(),
              source: row.source,
              sourceRowHash: row.sourceRowHash,
              saleDate: row.saleDate,
              salePrice: row.salePrice,
              surfaceM2: row.surfaceM2,
              builtSurfaceM2: row.builtSurfaceM2,
              landSurfaceM2: row.landSurfaceM2,
              propertyType: row.propertyType,
              longitude: row.longitude,
              latitude: row.latitude,
              postalCode: row.postalCode,
              city: row.city,
              inseeCode: row.inseeCode,
              rawPayload: JSON.stringify(row.rawPayload),
              fetchedAt: now,
              createdAt: now,
            })),
          )
          .onConflictDoNothing({
            target: marketDvfTransactions.sourceRowHash,
          });
      }

      for (const row of inWindow) {
        transactionsByHash.set(row.sourceRowHash, row);
      }

      if (transactionsByHash.size >= COMPARABLE_TARGET_COUNT) {
        break;
      }
    }

    if (transactionsByHash.size === 0 && lastFetchError) {
      throw new HttpError(
        502,
        "DVF_UNAVAILABLE",
        "La source DVF est temporairement indisponible",
        toDvfUnavailableDetails(lastFetchError),
      );
    }

    const rawPoints = Array.from(transactionsByHash.values())
      .sort((a, b) => b.saleDate.getTime() - a.saleDate.getTime())
      .map((row) => {
        const distanceM =
          typeof row.latitude === "number" &&
          Number.isFinite(row.latitude) &&
          typeof row.longitude === "number" &&
          Number.isFinite(row.longitude)
            ? formatComparableNumber(
                haversineDistanceMeters({
                  fromLat: latitude,
                  fromLon: longitude,
                  toLat: row.latitude,
                  toLon: row.longitude,
                }),
              )
            : null;

        return {
          saleDate: row.saleDate.toISOString(),
          surfaceM2: formatComparableNumber(row.surfaceM2),
          landSurfaceM2:
            typeof row.landSurfaceM2 === "number" &&
            Number.isFinite(row.landSurfaceM2) &&
            row.landSurfaceM2 > 0
              ? formatComparableNumber(row.landSurfaceM2)
              : null,
          salePrice: row.salePrice,
          pricePerM2: formatComparableNumber(row.salePrice / row.surfaceM2),
          distanceM,
          city: row.city,
          postalCode: row.postalCode,
        };
      });

    const subjectSurfaceM2 = resolveSubjectSurface(details, resolvedPropertyType);
    const askingPrice = resolveSubjectAskingPrice(property, details);
    const pointsWithinSubjectSurfaceRange = filterComparablesBySubjectSurfaceRange({
      points: rawPoints,
      subjectSurfaceM2,
    });
    const points = filterComparablesByMinPricePerM2(pointsWithinSubjectSurfaceRange);

    const priceValues = points.map((point) => point.salePrice);
    const pricePerM2Values = points.map((point) => point.pricePerM2);
    const regression = computeRegression(
      points.map((point) => ({ surfaceM2: point.surfaceM2, salePrice: point.salePrice })),
    );

    const predictedPrice = computePredictedPrice({
      surfaceM2: subjectSurfaceM2,
      slope: regression.slope,
      intercept: regression.intercept,
    });
    const affinePriceAtSubjectSurface = null;
    const pricing = resolvePricingPosition({
      askingPrice,
      predictedPrice,
    });

    const response: PropertyComparablesResponse = {
      propertyId: property.id,
      propertyType: resolvedPropertyType,
      source: "LIVE",
      windowYears: COMPARABLE_WINDOW_YEARS,
      search: {
        center: {
          latitude: formatComparableNumber(latitude),
          longitude: formatComparableNumber(longitude),
        },
        finalRadiusM,
        radiiTried,
        targetCount: COMPARABLE_TARGET_COUNT,
        targetReached: points.length >= COMPARABLE_TARGET_COUNT,
      },
      summary: {
        count: points.length,
        medianPrice: computeMedian(priceValues),
        medianPricePerM2: computeMedian(pricePerM2Values),
        minPrice: priceValues.length > 0 ? Math.min(...priceValues) : null,
        maxPrice: priceValues.length > 0 ? Math.max(...priceValues) : null,
      },
      subject: {
        surfaceM2: subjectSurfaceM2 ? formatComparableNumber(subjectSurfaceM2) : null,
        askingPrice,
        affinePriceAtSubjectSurface,
        predictedPrice,
        deviationPct: pricing.deviationPct,
        pricingPosition: pricing.pricingPosition,
      },
      regression,
      points,
    };

    const expiresAt = new Date(now.getTime() + toCacheTtlDays() * 24 * 60 * 60 * 1000);
    await db
      .insert(marketDvfQueryCache)
      .values({
        id: crypto.randomUUID(),
        orgId: input.orgId,
        propertyId: input.propertyId,
        cacheKey,
        querySignature: signature,
        finalRadiusM,
        comparablesCount: points.length,
        targetReached: points.length >= COMPARABLE_TARGET_COUNT,
        responseJson: JSON.stringify(response),
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: marketDvfQueryCache.cacheKey,
        set: {
          orgId: input.orgId,
          propertyId: input.propertyId,
          querySignature: signature,
          finalRadiusM,
          comparablesCount: points.length,
          targetReached: points.length >= COMPARABLE_TARGET_COUNT,
          responseJson: JSON.stringify(response),
          expiresAt,
          updatedAt: now,
        },
      });

    return response;
  },

  async prepareValuationAIContext(input: {
    orgId: string;
    propertyId: string;
    data?: {
      comparableFilters?: PropertyValuationAIComparableFilters;
      agentAdjustedPrice?: number | null;
    };
  }): Promise<{
    property: Pick<PropertyRow, "id" | "title" | "address" | "city" | "postalCode" | "price">;
    details: PropertyDetailsInput;
    comparables: PropertyComparablesResponse;
    pointsUsed: ComparablePoint[];
    summary: {
      count: number;
      medianPrice: number | null;
      medianPricePerM2: number | null;
      minPrice: number | null;
      maxPrice: number | null;
    };
    askingPrice: number | null;
    criteriaUsed: PropertyValuationCriterion[];
    promptUsed: string;
  }> {
    const property = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.propertyId), eq(properties.orgId, input.orgId)),
    });

    if (!property) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    const details = parseDetails(property.details);
    const organization = await db.query.organizations.findFirst({
      where: eq(organizations.id, input.orgId),
    });
    const outputFormatTemplate = resolveValuationAiOutputFormat(
      organization?.valuationAiOutputFormat,
    );
    const filters = normalizeValuationComparableFilters(input.data?.comparableFilters);
    const propertyTypeFromDetails = resolvePropertyTypeFromDetails(details);
    const comparablePropertyType = filters.propertyType ?? propertyTypeFromDetails ?? undefined;
    const comparables = await this.getComparables({
      orgId: input.orgId,
      propertyId: input.propertyId,
      propertyType: comparablePropertyType,
      forceRefresh: false,
    });

    const filteredPoints = filterComparablePoints(comparables.points, filters);
    const pointsUsed = filteredPoints.length > 0 ? filteredPoints : comparables.points;
    const summary = summarizeComparablePoints(pointsUsed);
    const latestPoints = pointsUsed
      .slice()
      .sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime())
      .slice(0, 5);
    const marketTrendRows = computeValuationMarketTrendRows(pointsUsed);

    const adjustedPrice =
      typeof input.data?.agentAdjustedPrice === "number" &&
      Number.isFinite(input.data.agentAdjustedPrice) &&
      input.data.agentAdjustedPrice > 0
        ? Math.round(input.data.agentAdjustedPrice)
        : null;
    const askingPrice = adjustedPrice ?? resolveSubjectAskingPrice(property, details) ?? comparables.subject.askingPrice;
    const criteriaUsed = resolveValuationCriteria(details, comparables.propertyType);
    const allPropertyCriteria = resolveAllPropertyCriteriaForPrompt(details);
    const analysisFactors = resolveValuationAnalysisFactors(details, comparables.propertyType);
    const promptUsed = buildValuationPrompt({
      property,
      propertyType: comparables.propertyType,
      criteriaUsed,
      allPropertyCriteria,
      analysisFactors,
      askingPrice: askingPrice ?? null,
      filteredSummary: summary,
      predictedPrice: comparables.subject.predictedPrice,
      latestPoints,
      marketTrendRows,
      filters,
      outputFormatTemplate,
    });

    return {
      property,
      details,
      comparables,
      pointsUsed,
      summary,
      askingPrice: askingPrice ?? null,
      criteriaUsed,
      promptUsed,
    };
  },

  async generateValuationAIPrompt(input: {
    orgId: string;
    propertyId: string;
    data?: {
      comparableFilters?: PropertyValuationAIComparableFilters;
      agentAdjustedPrice?: number | null;
    };
  }): Promise<PropertyValuationAIPromptResponse> {
    const context = await this.prepareValuationAIContext(input);
    return {
      propertyId: context.property.id,
      promptUsed: context.promptUsed,
    };
  },

  async runValuationAIAnalysis(input: {
    orgId: string;
    propertyId: string;
    data?: {
      comparableFilters?: PropertyValuationAIComparableFilters;
      agentAdjustedPrice?: number | null;
    };
  }): Promise<PropertyValuationAIResponse> {
    const context = await this.prepareValuationAIContext(input);

    const aiProvider = getAIProvider();
    const fallbackValuation =
      context.summary.medianPrice ??
      context.comparables.subject.predictedPrice ??
      context.askingPrice ??
      null;
    let aiCalculatedValuation = fallbackValuation;
    let valuationJustification = ensureMarkdownValuationJustification(
      "Valorisation estimée à partir des comparables disponibles et des critères principaux du bien.",
    );

    try {
      const aiResult = await aiProvider.computePropertyValuation({ prompt: context.promptUsed });
      aiCalculatedValuation =
        typeof aiResult.calculatedValuation === "number" &&
        Number.isFinite(aiResult.calculatedValuation) &&
        aiResult.calculatedValuation > 0
          ? Math.round(aiResult.calculatedValuation)
          : fallbackValuation;
      valuationJustification = ensureMarkdownValuationJustification(aiResult.justification);
    } catch (error) {
      if (error instanceof Error && error.message.trim()) {
        valuationJustification = `${valuationJustification}\n- Fallback technique: ${error.message.trim()}`;
      }
    }

    const generatedAt = new Date();
    const response: PropertyValuationAIResponse = {
      propertyId: context.property.id,
      aiCalculatedValuation: aiCalculatedValuation ?? null,
      valuationJustification,
      promptUsed: context.promptUsed,
      generatedAt: generatedAt.toISOString(),
      comparableCountUsed: context.pointsUsed.length,
      criteriaUsed: context.criteriaUsed,
    };

    const { promptUsed: _promptUsed, ...persistedSnapshot } = response;
    const nextDetails: Record<string, unknown> = {
      ...context.details,
      [VALUATION_AI_SNAPSHOT_KEY]: persistedSnapshot,
    };
    await db
      .update(properties)
      .set({
        details: JSON.stringify(nextDetails),
        updatedAt: generatedAt,
      })
      .where(and(eq(properties.id, input.propertyId), eq(properties.orgId, input.orgId)));

    return response;
  },

  async getRisks(input: { orgId: string; propertyId: string }): Promise<PropertyRisksResponse> {
    const property = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.propertyId), eq(properties.orgId, input.orgId)),
    });

    if (!property) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    const details = parseDetails(property.details);
    const locationDetails = (() => {
      const raw = details.location;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {} as Record<string, unknown>;
      }

      return raw as Record<string, unknown>;
    })();

    return getPropertyRisks({
      propertyId: property.id,
      location: {
        address: property.address,
        postalCode: property.postalCode,
        city: property.city,
        latitude: toFiniteNumber(locationDetails.gpsLat),
        longitude: toFiniteNumber(locationDetails.gpsLng),
      },
    });
  },
};
