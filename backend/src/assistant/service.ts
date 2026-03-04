import { and, asc, eq, inArray } from "drizzle-orm";
import { trackAICallSafe } from "../ai/call-logs";
import { resolveAIProviderKindForOrg } from "../ai/factory";
import { clampPriceUsd, estimatePriceUsdFromUsage } from "../ai/pricing";
import { DEFAULT_ASSISTANT_SOUL } from "../auth/service";
import { calendarService } from "../calendar/service";
import { db } from "../db/client";
import {
  assistantConversations,
  assistantMessages,
  properties,
  users,
} from "../db/schema";
import { HttpError } from "../http/errors";
import { externalFetch } from "../http/external-fetch";
import {
  getLinkDataStructure,
  getObjectDataStructure,
  listObjectDataFieldKeysByGroup,
  type ObjectFieldDefinition,
} from "../object-data/structure";
import { linksService } from "../links/service";
import { propertiesService } from "../properties/service";
import { usersService } from "../users/service";
import {
  assistantWebSearchProvider,
  type AssistantCitation,
  type AssistantWebSearchTrace,
} from "./web-search";

export type AssistantObjectType = "bien" | "user" | "rdv" | "visite" | "lien";

export type AssistantMessageResponse = {
  id: string;
  role: "USER" | "ASSISTANT";
  text: string;
  citations: AssistantCitation[];
  createdAt: string;
};

export type AssistantConversationResponse = {
  id: string;
  greeting: string;
  messages: AssistantMessageResponse[];
  createdAt: string;
  updatedAt: string;
};

export type AssistantMessageContext = {
  objectType: AssistantObjectType;
  objectId: string;
};

export type AssistantToolMutationResult = {
  status: "EXECUTED";
  objectId: string;
  summary: string;
  result: unknown;
};

type ParsedIntent =
  | { kind: "list_rdv_today" }
  | { kind: "pool_check"; propertyQuery: string }
  | { kind: "surface_check"; propertyQuery: string }
  | {
      kind: "create_client";
      firstName: string;
      lastName: string;
      phone: string | null;
      email: string | null;
    }
  | {
      kind: "create_bien";
      propertyType: "Maison" | "Appartement" | "Immeuble" | "Terrain" | "Local" | null;
      city: string | null;
      address: string | null;
      postalCode: string | null;
    }
  | {
      kind: "create_rdv";
      clientQuery: string;
      propertyQuery: string;
      startsAt: Date;
      endsAt: Date;
    }
  | { kind: "unknown" };

const DEFAULT_GREETING =
  "Bonjour, je suis votre assistant Monimmo. Je suis prêt à répondre à vos questions.";

const WEB_SEARCH_KEYWORDS = [
  "internet",
  "sur internet",
  "sur le web",
  "sur le net",
  "web",
  "google",
  "en ligne",
  "actualite",
  "actualites",
  "actualité",
  "actualités",
  "news",
] as const;

const DEFAULT_ASSISTANT_OPENAI_MODEL = "gpt-5.2";
const MAX_ASSISTANT_TOOL_LOOPS = 6;

type AssistantFunctionToolName = "search" | "get" | "getParams" | "create" | "update";

type AssistantToolCall = {
  callId: string;
  name: AssistantFunctionToolName;
  argumentsJson: string;
};

type AssistantModelTurnResult = {
  text: string;
  citations: AssistantCitation[];
  mutationSuccessCount: number;
  mutationFailureCount: number;
  firstMutationError: string | null;
};

type AssistantModelToolHandlers = {
  search: (input: {
    q: string;
    objectType?: AssistantObjectType;
  }) => Promise<Record<string, unknown>>;
  get: (input: { objectType: AssistantObjectType; objectId: string }) => Promise<unknown>;
  getParams: (input: { objectType: AssistantObjectType; typeLien?: string }) => unknown;
  create: (input: {
    objectType: AssistantObjectType;
    params: Record<string, unknown>;
  }) => Promise<AssistantToolMutationResult>;
  update: (input: {
    objectType: AssistantObjectType;
    objectId: string;
    params: Record<string, unknown>;
  }) => Promise<AssistantToolMutationResult>;
};

const ASSISTANT_OPENAI_TOOL_DEFINITIONS = [
  {
    type: "function",
    name: "search",
    description:
      "Recherche des objets métiers locaux (bien, user, rdv, visite, lien) dans la base Monimmo.",
    parameters: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Texte libre de recherche (nom, adresse, ville, etc.).",
        },
        objectType: {
          type: "string",
          enum: ["bien", "user", "rdv", "visite", "lien"],
          description: "Type d'objet ciblé. Optionnel.",
        },
      },
      required: ["q"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get",
    description: "Récupère le détail complet d'un objet local par type et identifiant.",
    parameters: {
      type: "object",
      properties: {
        objectType: {
          type: "string",
          enum: ["bien", "user", "rdv", "visite", "lien"],
        },
        objectId: {
          type: "string",
          description: "Identifiant de l'objet à récupérer.",
        },
      },
      required: ["objectType", "objectId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "getParams",
    description:
      "Retourne les paramètres requis/optionnels pour créer ou mettre à jour un objet par type.",
    parameters: {
      type: "object",
      properties: {
        objectType: {
          type: "string",
          enum: ["bien", "user", "rdv", "visite", "lien"],
        },
        typeLien: {
          type: "string",
          description: "Requis quand objectType=lien pour récupérer les paramètres spécifiques.",
        },
      },
      required: ["objectType"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create",
    description:
      "Crée un objet local immédiatement.",
    parameters: {
      type: "object",
      properties: {
        objectType: {
          type: "string",
          enum: ["bien", "user", "rdv", "visite", "lien"],
        },
        params: {
          type: "object",
          description: "Dictionnaire des champs à créer.",
        },
      },
      required: ["objectType", "params"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update",
    description:
      "Met à jour un objet local immédiatement.",
    parameters: {
      type: "object",
      properties: {
        objectType: {
          type: "string",
          enum: ["bien", "user", "rdv", "visite", "lien"],
        },
        objectId: {
          type: "string",
        },
        params: {
          type: "object",
          description: "Dictionnaire des champs à mettre à jour.",
        },
      },
      required: ["objectType", "objectId", "params"],
      additionalProperties: false,
    },
  },
] as const;

const BIEN_PROPERTY_TYPE_OPTIONS = [
  "APPARTEMENT",
  "MAISON",
  "IMMEUBLE",
  "TERRAIN",
  "LOCAL_COMMERCIAL",
  "AUTRE",
] as const;

const DPE_CLASS_OPTIONS = ["A", "B", "C", "D", "E", "F", "G"] as const;

const normalizeText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const hasOwnKeys = (value: Record<string, unknown>): boolean =>
  Object.keys(value).length > 0;

const readPatchStringField = (
  params: Record<string, unknown>,
  key: string,
): string | null | undefined => {
  if (!Object.prototype.hasOwnProperty.call(params, key)) {
    return undefined;
  }

  const value = params[key];
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parseJsonObject = (value: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    const fallback: Record<string, unknown> = {};
    const pairRegex =
      /"([^"\\]+)"\s*:\s*("([^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g;
    let match: RegExpExecArray | null = pairRegex.exec(value);
    while (match) {
      const key = match[1]!;
      const rawValue = match[2]!;
      try {
        fallback[key] = JSON.parse(rawValue);
      } catch {
        if (rawValue.startsWith("\"") && rawValue.endsWith("\"")) {
          fallback[key] = rawValue.slice(1, -1);
        }
      }
      match = pairRegex.exec(value);
    }

    if (Object.keys(fallback).length > 0) {
      return fallback;
    }
  }

  return {};
};

const extractFlatToolParams = (
  args: Record<string, unknown>,
  reservedKeys: readonly string[],
): Record<string, unknown> => {
  const reserved = new Set(reservedKeys);
  const params: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (reserved.has(key)) {
      continue;
    }

    params[key] = value;
  }

  return params;
};

const parseCitations = (value: string): AssistantCitation[] => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return null;
        }

        const record = entry as Record<string, unknown>;
        const title = normalizeOptionalString(record.title) ?? "Source web";
        const url = normalizeOptionalString(record.url);
        const snippet = normalizeOptionalString(record.snippet) ?? "";

        if (!url) {
          return null;
        }

        return { title, url, snippet };
      })
      .filter((entry): entry is AssistantCitation => entry !== null);
  } catch {
    return [];
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .trim()
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizePropertyTypeOption = (value: unknown): (typeof BIEN_PROPERTY_TYPE_OPTIONS)[number] | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (normalized.includes("appartement")) {
    return "APPARTEMENT";
  }

  if (normalized.includes("maison")) {
    return "MAISON";
  }

  if (normalized.includes("immeuble")) {
    return "IMMEUBLE";
  }

  if (normalized.includes("terrain")) {
    return "TERRAIN";
  }

  if (normalized.includes("local")) {
    return "LOCAL_COMMERCIAL";
  }

  if (normalized.includes("autre")) {
    return "AUTRE";
  }

  const uppercase = value.trim().toUpperCase();
  return BIEN_PROPERTY_TYPE_OPTIONS.includes(uppercase as (typeof BIEN_PROPERTY_TYPE_OPTIONS)[number])
    ? (uppercase as (typeof BIEN_PROPERTY_TYPE_OPTIONS)[number])
    : null;
};

const normalizeDpeClassOption = (value: unknown): (typeof DPE_CLASS_OPTIONS)[number] | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  const candidate = normalized.slice(0, 1);
  return DPE_CLASS_OPTIONS.includes(candidate as (typeof DPE_CLASS_OPTIONS)[number])
    ? (candidate as (typeof DPE_CLASS_OPTIONS)[number])
    : null;
};

const setDetailField = (
  details: Record<string, unknown>,
  key: string,
  value: unknown,
): void => {
  details[key] = value;
};

const mergePropertyDetailsPatch = (
  baseDetails: Record<string, unknown>,
  incomingPatch: Record<string, unknown>,
): Record<string, unknown> => {
  return {
    ...baseDetails,
    ...incomingPatch,
  };
};

const BIEN_DETAIL_GROUPS = [
  "general",
  "location",
  "characteristics",
  "amenities",
  "copropriete",
  "finance",
  "regulation",
  "marketing",
] as const;

const flattenBienDetailsPatch = (value: Record<string, unknown>): Record<string, unknown> => {
  const flattened: Record<string, unknown> = {
    ...value,
  };

  for (const group of BIEN_DETAIL_GROUPS) {
    const rawGroup = value[group];
    if (!isRecord(rawGroup)) {
      continue;
    }

    const knownKeys = new Set(listObjectDataFieldKeysByGroup("bien", group));
    for (const [key, entryValue] of Object.entries(rawGroup)) {
      if (knownKeys.size === 0 || knownKeys.has(key)) {
        flattened[key] = entryValue;
      }
    }

    delete flattened[group];
  }

  return flattened;
};

const normalizeBienUpdateParams = (params: Record<string, unknown>): {
  title?: string;
  city?: string;
  postalCode?: string;
  address?: string;
  price?: number;
  hiddenExpectedDocumentKeys?: string[];
  detailsPatch: Record<string, unknown>;
} => {
  const detailsPatch = flattenBienDetailsPatch(parseJsonObject(JSON.stringify(params.details ?? {})));

  const propertyType = normalizePropertyTypeOption(
    params.typeBien ?? params.typebien ?? params.propertyType ?? params.type,
  );
  if (propertyType) {
    setDetailField(detailsPatch, "propertyType", propertyType);
  }

  const livingArea = toFiniteNumber(
    params.surface ?? params.surfaceM2 ?? params.surfaceHabitable ?? params.livingArea,
  );
  if (livingArea !== null && livingArea > 0) {
    setDetailField(detailsPatch, "livingArea", livingArea);
  }

  const carrezArea = toFiniteNumber(params.surfaceCarrez ?? params.carrezArea ?? params.carrez);
  if (carrezArea !== null && carrezArea > 0) {
    setDetailField(detailsPatch, "carrezArea", carrezArea);
  }

  const landArea = toFiniteNumber(params.surfaceTerrain ?? params.terrain ?? params.landArea);
  if (landArea !== null && landArea > 0) {
    setDetailField(detailsPatch, "landArea", landArea);
  }

  const longDescription = normalizeOptionalString(
    params.descriptif ?? params.description ?? params.longDescription ?? params.texteAnnonce ?? params.annonce,
  );
  if (longDescription) {
    setDetailField(detailsPatch, "longDescription", longDescription);
  }

  const propertyTax = toFiniteNumber(params.taxeFonciere ?? params.propertyTax);
  if (propertyTax !== null && propertyTax >= 0) {
    setDetailField(detailsPatch, "propertyTax", Math.round(propertyTax));
  }

  const dpeClass = normalizeDpeClassOption(params.dpeClass);
  if (dpeClass) {
    setDetailField(detailsPatch, "dpeClass", dpeClass);
  }

  const energyConsumption = toFiniteNumber(params.energyConsumption ?? params.dpeValue);
  if (energyConsumption !== null && energyConsumption >= 0) {
    setDetailField(detailsPatch, "energyConsumption", Math.round(energyConsumption));
  }

  const gesClass = normalizeDpeClassOption(params.gesClass);
  if (gesClass) {
    setDetailField(detailsPatch, "gesClass", gesClass);
  }

  const co2Emission = toFiniteNumber(params.co2Emission ?? params.gesValue);
  if (co2Emission !== null && co2Emission >= 0) {
    setDetailField(detailsPatch, "co2Emission", Math.round(co2Emission));
  }

  const title = normalizeOptionalString(params.title);
  const city = normalizeOptionalString(params.city);
  const postalCode = normalizeOptionalString(params.postalCode);
  const address = normalizeOptionalString(params.address);
  const price = toFiniteNumber(params.price);

  const hiddenExpectedDocumentKeys = Array.isArray(params.hiddenExpectedDocumentKeys)
    ? params.hiddenExpectedDocumentKeys.filter((value): value is string => typeof value === "string")
    : undefined;

  return {
    title: title ?? undefined,
    city: city ?? undefined,
    postalCode: postalCode ?? undefined,
    address: address ?? undefined,
    price: price !== null && price > 0 ? price : undefined,
    hiddenExpectedDocumentKeys,
    detailsPatch,
  };
};

const extractListingBodyFromMessage = (message: string): string => {
  const raw = message.trim();
  if (!raw) {
    return "";
  }

  const startCandidates = [
    "Damien BECOT",
    "vous présente en Exclusivité",
    "Cette maison",
  ];
  const startIndexes = startCandidates
    .map((candidate) => raw.indexOf(candidate))
    .filter((index) => index >= 0);
  const earliestStart = startIndexes.length > 0 ? Math.min(...startIndexes) : 0;
  const start = earliestStart > raw.length * 0.4 ? 0 : earliestStart;

  const endPatterns = [/Je peux l['’]ajouter/i, /\n1\)\s*Quel bien/i, /\nAction en attente/i];
  const endCandidates = endPatterns
    .map((pattern) => {
      const match = raw.match(pattern);
      return match?.index ?? -1;
    })
    .filter((index) => index >= 0 && index > start);
  const end = endCandidates.length > 0 ? Math.min(...endCandidates) : raw.length;

  return raw.slice(start, end).trim();
};

const matchFirstNumber = (text: string, patterns: RegExp[]): number | null => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const parsed = toFiniteNumber(match[1] ?? null);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
};

const countMatches = (text: string, pattern: RegExp): number =>
  text.match(pattern)?.length ?? 0;

const toOuiNonSelect = (value: boolean): "true" | "false" => (value ? "true" : "false");

const extractStructuredBienDetailsFromListing = (message: string): {
  shouldHandle: boolean;
  detailsPatch: Record<string, unknown>;
  extracted: string[];
} => {
  const body = extractListingBodyFromMessage(message);
  if (!body) {
    return {
      shouldHandle: false,
      detailsPatch: {},
      extracted: [],
    };
  }

  const normalizedBody = normalizeText(body);
  const markerKeywords = [
    "dpe",
    "ges",
    "terrain",
    "loi carrez",
    "taxe fonciere",
    "m2",
    "chambre",
  ];
  const markerCount = markerKeywords.reduce(
    (count, keyword) => (normalizedBody.includes(keyword) ? count + 1 : count),
    0,
  );
  const shouldHandle =
    body.length >= 400 &&
    markerCount >= 2 &&
    (normalizedBody.includes("descriptif") ||
      normalizedBody.includes("annonce") ||
      normalizedBody.includes("mettre a jour") ||
      normalizedBody.includes("ajouter les donnees") ||
      normalizedBody.includes("classe energie") ||
      normalizedBody.includes("loi carrez"));

  if (!shouldHandle) {
    return {
      shouldHandle: false,
      detailsPatch: {},
      extracted: [],
    };
  }

  const detailsPatch: Record<string, unknown> = {};
  const extracted: string[] = [];

  setDetailField(detailsPatch, "longDescription", body);
  extracted.push("Descriptif long");

  const propertyType = normalizePropertyTypeOption(body);
  if (propertyType) {
    setDetailField(detailsPatch, "propertyType", propertyType);
    extracted.push(`Type bien: ${propertyType}`);
  }

  const rooms = matchFirstNumber(body, [/(\d{1,2}(?:[.,]\d+)?)\s*pi[eè]ces?/i]);
  if (rooms !== null && rooms > 0) {
    setDetailField(detailsPatch, "rooms", Math.round(rooms));
    extracted.push(`Pièces: ${Math.round(rooms)}`);
  }

  const livingArea = matchFirstNumber(body, [
    /(\d{1,4}(?:[.,]\d{1,2})?)\s*m²?\s*environ/i,
    /maison[^.\n]{0,80}?(\d{1,4}(?:[.,]\d{1,2})?)\s*m²?/i,
  ]);
  if (livingArea !== null && livingArea > 0) {
    setDetailField(detailsPatch, "livingArea", livingArea);
    extracted.push(`Surface habitable: ${formatSurface(livingArea)} m²`);
  }

  const carrezArea = matchFirstNumber(body, [/(\d{1,4}(?:[.,]\d{1,2})?)\s*m²?\s*loi\s*carrez/i]);
  if (carrezArea !== null && carrezArea > 0) {
    setDetailField(detailsPatch, "carrezArea", carrezArea);
    extracted.push(`Surface Carrez: ${formatSurface(carrezArea)} m²`);
  }

  const landArea = matchFirstNumber(body, [/terrain(?:\s+de)?\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*m²/i]);
  if (landArea !== null && landArea > 0) {
    setDetailField(detailsPatch, "landArea", landArea);
    extracted.push(`Surface terrain: ${formatSurface(landArea)} m²`);
  }

  const livingRoomArea = matchFirstNumber(body, [/s[eé]jour[^:\n]*:\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*m²/i]);
  if (livingRoomArea !== null && livingRoomArea > 0) {
    setDetailField(detailsPatch, "livingRoomArea", livingRoomArea);
  }

  const bedroomCount =
    countMatches(body, /\bchambre\s*\d+\b/gi) ||
    (matchFirstNumber(body, [/(\d{1,2})\s*chambres?/i]) ?? 0);
  if (bedroomCount > 0) {
    setDetailField(detailsPatch, "bedrooms", Math.round(bedroomCount));
    extracted.push(`Chambres: ${Math.round(bedroomCount)}`);
  }

  const bathroomCount =
    countMatches(body, /salle\s+de\s+bains?/gi) + countMatches(body, /salle\s+d['’]eau/gi);
  if (bathroomCount > 0) {
    setDetailField(detailsPatch, "bathrooms", bathroomCount);
    extracted.push(`Salles d'eau/bains: ${bathroomCount}`);
  }

  const toiletsCount =
    countMatches(body, /wc\s+ind[ée]pendant/gi) || countMatches(body, /\bwc\b/gi);
  if (toiletsCount > 0) {
    setDetailField(detailsPatch, "toilets", toiletsCount);
    extracted.push(`WC: ${toiletsCount}`);
  }

  const parkingVehicles = matchFirstNumber(body, [/stationner\s+(\d{1,2})\s+v[ée]hicules?/i]);
  if (parkingVehicles !== null && parkingVehicles > 0) {
    setDetailField(detailsPatch, "parking", toOuiNonSelect(true));
    extracted.push(`Stationnement: ${Math.round(parkingVehicles)} véhicule(s)`);
  }

  if (normalizedBody.includes("jardin")) {
    const gardenValue = normalizedBody.includes("arbor")
      ? "OUI_ARBORE"
      : normalizedBody.includes("paysag")
        ? "OUI_PAYSAGE"
        : "OUI_NU";
    setDetailField(detailsPatch, "garden", gardenValue);
  }

  if (normalizedBody.includes("clotur")) {
    setDetailField(detailsPatch, "fenced", toOuiNonSelect(true));
  }
  if (normalizedBody.includes("cheminee")) {
    setDetailField(detailsPatch, "fireplace", toOuiNonSelect(true));
  }
  if (normalizedBody.includes("double vitrage")) {
    setDetailField(detailsPatch, "doubleGlazing", toOuiNonSelect(true));
  }
  if (normalizedBody.includes("fibre optique")) {
    setDetailField(detailsPatch, "fiber", toOuiNonSelect(true));
  }
  if (normalizedBody.includes("portail electrique")) {
    setDetailField(detailsPatch, "electricGate", toOuiNonSelect(true));
  }
  if (normalizedBody.includes("tout a l egout")) {
    setDetailField(detailsPatch, "sanitationType", "TOUT_A_L_EGOUT");
  }
  if (normalizedBody.includes("renovee recemment") || normalizedBody.includes("renove")) {
    setDetailField(detailsPatch, "condition", "RENOVE");
  }

  const propertyTax = matchFirstNumber(body, [/taxe\s+fonci[èe]re\s*[:\-]?\s*([\d\s.,]+)\s*€/i]);
  if (propertyTax !== null && propertyTax >= 0) {
    setDetailField(detailsPatch, "propertyTax", Math.round(propertyTax));
    extracted.push(`Taxe foncière: ${Math.round(propertyTax)} €`);
  }

  const feesAmount = matchFirstNumber(body, [/([\d\s.,]+)\s*€\s*TTC\s*Honoraires/i]);
  if (feesAmount !== null && feesAmount >= 0) {
    setDetailField(detailsPatch, "feesAmount", Math.round(feesAmount));
    if (normalizedBody.includes("charge du vendeur")) {
      setDetailField(detailsPatch, "feesResponsibility", "VENDEUR");
    }
  }

  if (normalizedBody.includes("regime de la copropriete : non") || normalizedBody.includes("pas de charges de copropriete")) {
    setDetailField(detailsPatch, "isCopropriete", toOuiNonSelect(false));
  }

  const dpeMatch = body.match(
    /DPE\s*([A-G])\s*\(([\d\s.,]+)\)\s*[-–]\s*GES\s*([A-G])\s*\(([\d\s.,]+)\)/i,
  );
  if (dpeMatch) {
    const dpeClass = normalizeDpeClassOption(dpeMatch[1]);
    const energyConsumption = toFiniteNumber(dpeMatch[2]);
    const gesClass = normalizeDpeClassOption(dpeMatch[3]);
    const co2Emission = toFiniteNumber(dpeMatch[4]);

    if (dpeClass) {
      setDetailField(detailsPatch, "dpeClass", dpeClass);
      extracted.push(`DPE: ${dpeClass}`);
    }
    if (energyConsumption !== null && energyConsumption >= 0) {
      setDetailField(detailsPatch, "energyConsumption", Math.round(energyConsumption));
      extracted.push(`Conso énergie: ${Math.round(energyConsumption)}`);
    }
    if (gesClass) {
      setDetailField(detailsPatch, "gesClass", gesClass);
      extracted.push(`GES: ${gesClass}`);
    }
    if (co2Emission !== null && co2Emission >= 0) {
      setDetailField(detailsPatch, "co2Emission", Math.round(co2Emission));
      extracted.push(`CO2: ${Math.round(co2Emission)}`);
    }
  }

  return {
    shouldHandle: true,
    detailsPatch,
    extracted,
  };
};

const asTokenCount = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
};

const serializeUnknown = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || typeof value === "undefined") {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const extractOpenAIResponseText = (payload: unknown): string => {
  if (!isRecord(payload)) {
    return "";
  }

  const directOutput = payload.output_text;
  if (typeof directOutput === "string" && directOutput.trim()) {
    return directOutput.trim();
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (!isRecord(item)) {
      continue;
    }

    const content = Array.isArray(item.content) ? item.content : [];
    for (const chunk of content) {
      if (!isRecord(chunk)) {
        continue;
      }

      const text = chunk.text;
      if (typeof text === "string" && text.trim()) {
        parts.push(text.trim());
      }
    }
  }

  return parts.join("\n").trim();
};

const extractOpenAIToolCalls = (payload: unknown): AssistantToolCall[] => {
  if (!isRecord(payload)) {
    return [];
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const calls: AssistantToolCall[] = [];
  for (const item of output) {
    if (!isRecord(item)) {
      continue;
    }

    if (item.type !== "function_call") {
      continue;
    }

    const name = item.name;
    const callId = item.call_id;
    if (
      (name !== "search" && name !== "get" && name !== "getParams" && name !== "create" && name !== "update") ||
      typeof callId !== "string" ||
      !callId.trim()
    ) {
      continue;
    }

    const rawArguments = item.arguments;
    const argumentsJson =
      typeof rawArguments === "string"
        ? rawArguments
        : rawArguments === null || typeof rawArguments === "undefined"
          ? "{}"
          : serializeUnknown(rawArguments);

    calls.push({
      callId,
      name,
      argumentsJson,
    });
  }

  return calls;
};

const normalizeAssistantObjectType = (value: unknown): AssistantObjectType | null => {
  if (value !== "bien" && value !== "user" && value !== "rdv" && value !== "visite" && value !== "lien") {
    return null;
  }

  return value;
};

const normalizeAssistantMessageContext = (
  value: AssistantMessageContext | null | undefined,
): AssistantMessageContext | null => {
  if (!value) {
    return null;
  }

  const objectType = normalizeAssistantObjectType(value.objectType);
  const objectId = normalizeOptionalString(value.objectId);
  if (!objectType || !objectId) {
    return null;
  }

  return {
    objectType,
    objectId,
  };
};

const toAssistantMessageResponse = (
  row: typeof assistantMessages.$inferSelect,
): AssistantMessageResponse => ({
  id: row.id,
  role: row.role === "USER" ? "USER" : "ASSISTANT",
  text: row.text,
  citations: parseCitations(row.citationsJson),
  createdAt: row.createdAt.toISOString(),
});

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const extractPoolStatus = (details: Record<string, unknown>): string | null => {
  const amenities = isRecord(details.amenities) ? details.amenities : {};
  const candidates = [
    details.pool,
    amenities.pool,
    details.piscine,
    details.hasPool,
    details.poolStatus,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "boolean") {
      return candidate ? "OUI" : "NON";
    }

    if (typeof candidate === "string") {
      const normalized = normalizeText(candidate);
      if (!normalized) {
        continue;
      }

      if (normalized.includes("non") || normalized === "false") {
        return "NON";
      }

      if (normalized.includes("piscinable")) {
        return "PISCINABLE";
      }

      return "OUI";
    }
  }

  return null;
};

const extractSurface = (details: Record<string, unknown>): number | null => {
  const characteristics = isRecord(details.characteristics) ? details.characteristics : {};
  const candidates = [
    details.surface,
    details.surfaceM2,
    details.surfaceHabitable,
    details.livingArea,
    characteristics.livingArea,
    characteristics.carrezArea,
    characteristics.landArea,
    details.area,
    details.areaM2,
    details.squareMeters,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return Math.round(candidate * 100) / 100;
    }

    if (typeof candidate === "string") {
      const numeric = Number(candidate.replace(",", ".").replace(/[^\d.]/g, ""));
      if (Number.isFinite(numeric) && numeric > 0) {
        return Math.round(numeric * 100) / 100;
      }
    }
  }

  return null;
};

const formatSurface = (value: number): string =>
  new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);

const wantsExplicitWebSearch = (message: string): boolean => {
  const normalized = normalizeText(message);
  return WEB_SEARCH_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword)));
};

const formatTime = (isoDateTime: string): string => {
  const date = new Date(isoDateTime);
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

const resolveTodayWindow = (): { from: string; to: string } => {
  const from = new Date();
  from.setHours(0, 0, 0, 0);

  const to = new Date(from);
  to.setDate(to.getDate() + 1);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
};

const parseIntent = (message: string): ParsedIntent => {
  const normalized = normalizeText(message);

  if (normalized.includes("rendez vous") && normalized.includes("aujourd")) {
    return { kind: "list_rdv_today" };
  }

  if (normalized.includes("piscine") && normalized.includes("dans")) {
    const match = message.match(/dans\s+(.+)$/i);
    const propertyQuery = normalizeOptionalString(match?.[1]);
    if (propertyQuery) {
      return {
        kind: "pool_check",
        propertyQuery,
      };
    }
  }

  if (normalized.includes("surface")) {
    const match = message.match(/(?:de|du|de la|de l'|d')\s+([^?!.]+?)(?:\s*[?!.])?\s*$/i);
    const propertyQuery = normalizeOptionalString(match?.[1]);
    if (propertyQuery) {
      return {
        kind: "surface_check",
        propertyQuery,
      };
    }
  }

  const isCreateIntent = normalized.includes("ajoute") || normalized.includes("cree") || normalized.includes("crée");
  const mentionsUser = normalized.includes("user") || normalized.includes("utilisateur");
  const mentionsClient = normalized.includes("client");

  if (isCreateIntent && (mentionsUser || mentionsClient)) {
    const phoneMatch = message.match(/(\+?\d[\d\s]{7,})/);
    const phone = normalizeOptionalString(phoneMatch?.[1]?.replace(/\s+/g, "") ?? null);
    const emailMatch = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const email = normalizeOptionalString(emailMatch?.[0] ?? null)?.toLowerCase() ?? null;

    const afterTarget = message.replace(/^.*(?:utilisateur|user|client)\s+/i, "").trim();
    const cleaned = afterTarget
      .replace(phoneMatch?.[0] ?? "", "")
      .replace(emailMatch?.[0] ?? "", "")
      .trim();
    const tokens = cleaned.split(/\s+/).filter(Boolean);

    if (tokens.length > 0) {
      return {
        kind: "create_client",
        firstName: tokens[0] ?? "",
        lastName: tokens.slice(1).join(" "),
        phone,
        email,
      };
    }
  }

  if ((normalized.includes("cree") || normalized.includes("crée")) && normalized.includes("rendez vous")) {
    const clientMatch = message.match(/avec\s+(.+?)\s+demain/i);
    const timeMatch = message.match(/(\d{1,2})h(?:([0-5]\d))?/i);
    const propertyMatch = message.match(/(?:a|à)\s+(?:la|le|l'|au|aux)?\s*([^,.;!?]+)$/i);

    const clientQuery = normalizeOptionalString(clientMatch?.[1]);
    const propertyQuery = normalizeOptionalString(propertyMatch?.[1]);

    if (clientQuery && propertyQuery) {
      const hour = Number(timeMatch?.[1] ?? "18");
      const minute = Number(timeMatch?.[2] ?? "0");

      if (!Number.isNaN(hour) && hour >= 0 && hour <= 23 && !Number.isNaN(minute)) {
        const startsAt = new Date();
        startsAt.setDate(startsAt.getDate() + 1);
        startsAt.setHours(hour, minute, 0, 0);

        const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

        return {
          kind: "create_rdv",
          clientQuery,
          propertyQuery,
          startsAt,
          endsAt,
        };
      }
    }
  }

  if ((normalized.includes("cree") || normalized.includes("crée")) && normalized.includes("bien")) {
    const propertyType: Extract<ParsedIntent, { kind: "create_bien" }>["propertyType"] =
      normalized.includes("maison")
        ? "Maison"
        : normalized.includes("appartement")
          ? "Appartement"
          : normalized.includes("immeuble")
            ? "Immeuble"
            : normalized.includes("terrain")
              ? "Terrain"
              : normalized.includes("local")
                ? "Local"
                : null;

    const cityAddressMatch = message.match(/(?:a|à)\s+([A-Za-zÀ-ÿ' -]+?)\s+au?\s+([^,.;!?]+)$/i);
    const postalCodeMatch = message.match(/\b(\d{5})\b/);

    return {
      kind: "create_bien",
      propertyType,
      city: normalizeOptionalString(cityAddressMatch?.[1]),
      address: normalizeOptionalString(cityAddressMatch?.[2]),
      postalCode: normalizeOptionalString(postalCodeMatch?.[1]),
    };
  }

  return { kind: "unknown" };
};

const toLookupLabel = (input: { firstName: string; lastName: string }): string => {
  const fullName = `${input.firstName} ${input.lastName}`.trim();
  return fullName || "Utilisateur";
};

const toAssistantSoul = (value: string | null | undefined): string => {
  const normalized = normalizeOptionalString(value);
  return normalized ?? DEFAULT_ASSISTANT_SOUL;
};

const buildConversationResponse = async (input: {
  orgId: string;
  conversationId: string;
}): Promise<AssistantConversationResponse> => {
  const conversation = await db.query.assistantConversations.findFirst({
    where: and(
      eq(assistantConversations.id, input.conversationId),
      eq(assistantConversations.orgId, input.orgId),
    ),
  });

  if (!conversation) {
    throw new HttpError(404, "ASSISTANT_CONVERSATION_NOT_FOUND", "Conversation introuvable");
  }

  const rows = await db
    .select()
    .from(assistantMessages)
    .where(
      and(
        eq(assistantMessages.conversationId, conversation.id),
        eq(assistantMessages.orgId, input.orgId),
      ),
    )
    .orderBy(asc(assistantMessages.createdAt));

  const visibleRows = rows.filter((row) => row.role === "USER" || row.role === "ASSISTANT");
  const messages = visibleRows.map((row) => toAssistantMessageResponse(row));

  const greeting = messages.find((message) => message.role === "ASSISTANT")?.text ?? DEFAULT_GREETING;

  return {
    id: conversation.id,
    greeting,
    messages,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
};

const assertConversationOwnership = async (input: {
  orgId: string;
  userId: string;
  conversationId: string;
}): Promise<void> => {
  const conversation = await db.query.assistantConversations.findFirst({
    where: and(
      eq(assistantConversations.id, input.conversationId),
      eq(assistantConversations.orgId, input.orgId),
      eq(assistantConversations.userId, input.userId),
    ),
  });

  if (!conversation) {
    throw new HttpError(404, "ASSISTANT_CONVERSATION_NOT_FOUND", "Conversation introuvable");
  }
};

const appendConversationMessage = async (input: {
  conversationId: string;
  orgId: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  text: string;
  citations?: AssistantCitation[];
}): Promise<typeof assistantMessages.$inferSelect> => {
  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(assistantMessages).values({
    id,
    conversationId: input.conversationId,
    orgId: input.orgId,
    role: input.role,
    text: input.text,
    citationsJson: JSON.stringify(input.citations ?? []),
    pendingActionId: null,
    createdAt: now,
  });

  await db
    .update(assistantConversations)
    .set({
      updatedAt: now,
    })
    .where(eq(assistantConversations.id, input.conversationId));

  const row = await db.query.assistantMessages.findFirst({
    where: and(eq(assistantMessages.id, id), eq(assistantMessages.orgId, input.orgId)),
  });

  if (!row) {
    throw new HttpError(500, "ASSISTANT_MESSAGE_CREATE_FAILED", "Message assistant introuvable");
  }

  return row;
};

const ensureConversation = async (input: {
  orgId: string;
  userId: string;
  assistantSoul?: string | null;
}): Promise<typeof assistantConversations.$inferSelect> => {
  const sanitizeLeakedSoulMessages = async (
    conversationId: string,
  ): Promise<void> => {
    const candidates = Array.from(
      new Set(
        [toAssistantSoul(input.assistantSoul), DEFAULT_ASSISTANT_SOUL]
          .map((value) => value.trim())
          .filter((value) => value.length > 0),
      ),
    );

    if (candidates.length === 0) {
      return;
    }

    await db
      .update(assistantMessages)
      .set({
        role: "SYSTEM",
      })
      .where(
        and(
          eq(assistantMessages.conversationId, conversationId),
          eq(assistantMessages.orgId, input.orgId),
          eq(assistantMessages.role, "ASSISTANT"),
          inArray(assistantMessages.text, candidates),
        ),
      );
  };

  const existing = await db.query.assistantConversations.findFirst({
    where: and(
      eq(assistantConversations.orgId, input.orgId),
      eq(assistantConversations.userId, input.userId),
    ),
  });

  if (existing) {
    await sanitizeLeakedSoulMessages(existing.id);
    return existing;
  }

  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(assistantConversations).values({
    id,
    orgId: input.orgId,
    userId: input.userId,
    createdAt: now,
    updatedAt: now,
  });

  await appendConversationMessage({
    conversationId: id,
    orgId: input.orgId,
    role: "SYSTEM",
    text: toAssistantSoul(input.assistantSoul),
  });

  await appendConversationMessage({
    conversationId: id,
    orgId: input.orgId,
    role: "ASSISTANT",
    text: DEFAULT_GREETING,
  });

  const created = await db.query.assistantConversations.findFirst({
    where: and(eq(assistantConversations.id, id), eq(assistantConversations.orgId, input.orgId)),
  });

  if (!created) {
    throw new HttpError(500, "ASSISTANT_CONVERSATION_CREATE_FAILED", "Conversation introuvable");
  }

  return created;
};

const listConversationRows = async (input: {
  orgId: string;
  conversationId: string;
  limit?: number;
}): Promise<Array<typeof assistantMessages.$inferSelect>> => {
  const rows = await db
    .select()
    .from(assistantMessages)
    .where(
      and(
        eq(assistantMessages.conversationId, input.conversationId),
        eq(assistantMessages.orgId, input.orgId),
      ),
    )
    .orderBy(asc(assistantMessages.createdAt));

  const limit = input.limit ?? 40;
  if (rows.length <= limit) {
    return rows;
  }

  const firstSystem = rows.find((row) => row.role === "SYSTEM");
  const tail = rows.slice(-(limit - (firstSystem ? 1 : 0)));
  if (!firstSystem) {
    return tail;
  }

  if (tail.some((row) => row.id === firstSystem.id)) {
    return tail;
  }

  return [firstSystem, ...tail];
};

const toOpenAIConversationInput = (
  rows: Array<typeof assistantMessages.$inferSelect>,
): Array<Record<string, unknown>> =>
  rows
    .filter((row) => row.role === "USER" || row.role === "ASSISTANT")
    .map((row) => {
      if (row.role === "ASSISTANT") {
        return {
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: row.text,
            },
          ],
        };
      }

      return {
        role: "user",
        content: [
          {
            type: "input_text",
            text: row.text,
          },
        ],
      };
    });

const toOpenAIUsage = (payload: unknown): {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
} => {
  const usage = isRecord(payload) && isRecord(payload.usage) ? payload.usage : {};
  const inputTokens = asTokenCount(usage.input_tokens ?? usage.inputTokens);
  const outputTokens = asTokenCount(usage.output_tokens ?? usage.outputTokens);
  const totalTokens =
    asTokenCount(usage.total_tokens ?? usage.totalTokens) ??
    (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
};

const trackAssistantOpenAICall = async (input: {
  orgId: string;
  model: string;
  requestBody: Record<string, unknown>;
  responsePayload: unknown;
}): Promise<void> => {
  const usage = toOpenAIUsage(input.responsePayload);
  const prompt = serializeUnknown(input.requestBody);
  const responseText = serializeUnknown(input.responsePayload);
  const price = clampPriceUsd(
    estimatePriceUsdFromUsage({
      provider: "openai",
      model: input.model,
      usage:
        usage.inputTokens === null && usage.outputTokens === null && usage.totalTokens === null
          ? undefined
          : {
              inputTokens: usage.inputTokens ?? undefined,
              outputTokens: usage.outputTokens ?? undefined,
              totalTokens: usage.totalTokens ?? undefined,
            },
      prompt,
      responseText,
    }),
  );

  console.info("[ASSISTANT][OPENAI][REQUEST]", prompt);
  console.info("[ASSISTANT][OPENAI][RESPONSE]", responseText);

  await trackAICallSafe({
    orgId: input.orgId,
    useCase: "ASSISTANT_CHAT",
    prompt,
    textResponse: responseText,
    price,
    inputTokens: usage.inputTokens ?? undefined,
    outputTokens: usage.outputTokens ?? undefined,
    totalTokens: usage.totalTokens ?? undefined,
  });
};

const buildAssistantToolErrorPayload = (error: unknown): Record<string, unknown> => {
  if (error instanceof HttpError) {
    return {
      error: true,
      code: error.code,
      message: error.message,
      status: error.status,
    };
  }

  if (error instanceof Error) {
    return {
      error: true,
      message: error.message,
    };
  }

  return {
    error: true,
    message: "Erreur outil inconnue",
  };
};

const runOpenAIToolDrivenTurn = async (input: {
  orgId: string;
  conversationId: string;
  handlers: AssistantModelToolHandlers;
  messageRows: Array<typeof assistantMessages.$inferSelect>;
  context: AssistantMessageContext | null;
}): Promise<AssistantModelTurnResult | null> => {
  const providerKind = await resolveAIProviderKindForOrg(input.orgId, process.env);
  if (providerKind !== "openai") {
    return null;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.OPENAI_CHAT_MODEL?.trim() || DEFAULT_ASSISTANT_OPENAI_MODEL;

  const assistantSoul = input.messageRows.find((row) => row.role === "SYSTEM")?.text.trim() ?? "";
  const instructionsParts = [
    assistantSoul,
    [
      "Tu es l'assistant Monimmo pour des agents immobiliers français.",
      "Utilise en priorité les tools locaux search/get/getParams/create/update pour répondre.",
      "Pour toute demande de création/mise à jour: appelle d'abord getParams(objectType), puis envoie create/update avec des params strictement conformes (types + valeurs de select autorisées).",
      "Pour create/update, params est obligatoire et doit contenir au moins un champ.",
      "N'annonce une action comme faite que si le tool correspondant a retourné status=EXECUTED.",
      "N'invente jamais des données métier; si ambigu, pose une question de clarification.",
      "N'utilise pas internet ici.",
      "Réponds en français, de façon concise et actionnable.",
      "Formate toujours la réponse finale en Markdown.",
    ].join("\n"),
    input.context
      ? [
          "Contexte de navigation transmis par l'application:",
          `objectType=${input.context.objectType}`,
          `objectId=${input.context.objectId}`,
          "Si l'utilisateur dit \"ce bien\", \"cet utilisateur\", \"ce rdv\" ou \"cette visite\", utilise cet objet comme référence principale.",
        ].join("\n")
      : "",
  ].filter((value) => value.length > 0);
  const instructions = instructionsParts.join("\n\n");

  let requestBody: Record<string, unknown> = {
    model,
    instructions,
    input: toOpenAIConversationInput(input.messageRows),
    tools: ASSISTANT_OPENAI_TOOL_DEFINITIONS,
    tool_choice: "auto",
    max_output_tokens: 900,
  };
  let mutationSuccessCount = 0;
  let mutationFailureCount = 0;
  let firstMutationError: string | null = null;

  for (let i = 0; i < MAX_ASSISTANT_TOOL_LOOPS; i += 1) {
    const response = await externalFetch({
      service: "assistant-openai-chat",
      url: `${baseUrl}/responses`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const details = await response.text();
      console.warn(`[ASSISTANT][OPENAI] call failed status=${response.status} details=${details}`);
      return null;
    }

    const payload = (await response.json()) as unknown;
    await trackAssistantOpenAICall({
      orgId: input.orgId,
      model,
      requestBody,
      responsePayload: payload,
    });

    const responseId = isRecord(payload) && typeof payload.id === "string" ? payload.id : null;
    const toolCalls = extractOpenAIToolCalls(payload);
    const responseText = extractOpenAIResponseText(payload);

    if (toolCalls.length === 0) {
      if (responseText) {
        return {
          text: responseText,
          citations: [],
          mutationSuccessCount,
          mutationFailureCount,
          firstMutationError,
        };
      }

      return null;
    }

    if (!responseId) {
      return null;
    }

    const toolOutputs: Array<Record<string, unknown>> = [];
    for (const toolCall of toolCalls) {
      const args = parseJsonObject(toolCall.argumentsJson);

      try {
        if (toolCall.name === "search") {
          const q = normalizeOptionalString(args.q);
          const objectType = normalizeAssistantObjectType(args.objectType);
          if (!q) {
            throw new HttpError(400, "ASSISTANT_TOOL_INVALID_ARGUMENT", "Le paramètre q est requis.");
          }

          const result = await input.handlers.search({
            q,
            objectType: objectType ?? undefined,
          });

          toolOutputs.push({
            type: "function_call_output",
            call_id: toolCall.callId,
            output: serializeUnknown(result),
          });
          continue;
        }

        if (toolCall.name === "get") {
          const objectType = normalizeAssistantObjectType(args.objectType);
          const objectId = normalizeOptionalString(args.objectId);
          if (!objectType || !objectId) {
            throw new HttpError(
              400,
              "ASSISTANT_TOOL_INVALID_ARGUMENT",
              "Les paramètres objectType et objectId sont requis.",
            );
          }

          const result = await input.handlers.get({ objectType, objectId });
          toolOutputs.push({
            type: "function_call_output",
            call_id: toolCall.callId,
            output: serializeUnknown(result),
          });
          continue;
        }

        if (toolCall.name === "getParams") {
          const objectType = normalizeAssistantObjectType(args.objectType);
          if (!objectType) {
            throw new HttpError(
              400,
              "ASSISTANT_TOOL_INVALID_ARGUMENT",
              "Le paramètre objectType est requis.",
            );
          }

          const result = input.handlers.getParams({
            objectType,
            typeLien: normalizeOptionalString(args.typeLien) ?? undefined,
          });
          toolOutputs.push({
            type: "function_call_output",
            call_id: toolCall.callId,
            output: serializeUnknown(result),
          });
          continue;
        }

        if (toolCall.name === "create") {
          const objectType = normalizeAssistantObjectType(args.objectType);
          if (!objectType) {
            throw new HttpError(
              400,
              "ASSISTANT_TOOL_INVALID_ARGUMENT",
              "Le paramètre objectType est requis.",
            );
          }

          const params = isRecord(args.params)
            ? args.params
            : extractFlatToolParams(args, ["objectType"]);
          if (!hasOwnKeys(params)) {
            throw new HttpError(
              400,
              "ASSISTANT_TOOL_INVALID_ARGUMENT",
              "Le paramètre params est requis et ne peut pas être vide.",
            );
          }
          const result = await input.handlers.create({
            objectType,
            params,
          });
          mutationSuccessCount += 1;

          toolOutputs.push({
            type: "function_call_output",
            call_id: toolCall.callId,
            output: serializeUnknown(result),
          });
          continue;
        }

        const objectType = normalizeAssistantObjectType(args.objectType);
        const objectId = normalizeOptionalString(args.objectId);
        if (!objectType || !objectId) {
          throw new HttpError(
            400,
            "ASSISTANT_TOOL_INVALID_ARGUMENT",
            "Les paramètres objectType et objectId sont requis.",
          );
        }

        const params = isRecord(args.params)
          ? args.params
          : extractFlatToolParams(args, ["objectType", "objectId"]);
        if (!hasOwnKeys(params)) {
          throw new HttpError(
            400,
            "ASSISTANT_TOOL_INVALID_ARGUMENT",
            "Le paramètre params est requis et ne peut pas être vide.",
          );
        }
        const result = await input.handlers.update({
          objectType,
          objectId,
          params,
        });
        mutationSuccessCount += 1;

        toolOutputs.push({
          type: "function_call_output",
          call_id: toolCall.callId,
          output: serializeUnknown(result),
        });
      } catch (error) {
        toolOutputs.push({
          type: "function_call_output",
          call_id: toolCall.callId,
          output: serializeUnknown(buildAssistantToolErrorPayload(error)),
        });
        if (toolCall.name === "create" || toolCall.name === "update") {
          mutationFailureCount += 1;
          if (!firstMutationError) {
            if (error instanceof HttpError) {
              firstMutationError = error.message;
            } else if (error instanceof Error) {
              firstMutationError = error.message;
            } else {
              firstMutationError = "Erreur outil inconnue";
            }
          }
        }
      }
    }

    requestBody = {
      model,
      previous_response_id: responseId,
      input: toolOutputs,
      tools: ASSISTANT_OPENAI_TOOL_DEFINITIONS,
      tool_choice: "auto",
      max_output_tokens: 900,
    };
  }

  return null;
};

const executeCreate = async (input: {
  orgId: string;
  objectType: AssistantObjectType;
  params: Record<string, unknown>;
}): Promise<{ objectId: string; summary: string; result: unknown }> => {
  if (input.objectType === "user") {
    const created = await usersService.create({
      orgId: input.orgId,
      changeMode: "AI",
      data: {
        firstName: normalizeOptionalString(input.params.firstName),
        lastName: normalizeOptionalString(input.params.lastName),
        email: normalizeOptionalString(input.params.email),
        phone: normalizeOptionalString(input.params.phone),
        address: normalizeOptionalString(input.params.address),
        postalCode: normalizeOptionalString(input.params.postalCode),
        city: normalizeOptionalString(input.params.city),
        personalNotes: normalizeOptionalString(input.params.personalNotes),
        accountType: "CLIENT",
      },
    });

    return {
      objectId: created.id,
      summary: `Utilisateur créé: ${toLookupLabel(created)}.`,
      result: created,
    };
  }

  if (input.objectType === "bien") {
    const title = normalizeOptionalString(input.params.title);
    const city = normalizeOptionalString(input.params.city);
    const postalCode = normalizeOptionalString(input.params.postalCode);
    const address = normalizeOptionalString(input.params.address);

    if (!title || !city || !postalCode || !address) {
      throw new HttpError(
        400,
        "ASSISTANT_INVALID_CREATE_PAYLOAD",
        "Le bien nécessite title, city, postalCode et address.",
      );
    }

    const created = await propertiesService.create({
      orgId: input.orgId,
      title,
      city,
      postalCode,
      address,
      details: parseJsonObject(JSON.stringify(input.params.details ?? {})),
      changeMode: "AI",
    });

    return {
      objectId: created.id,
      summary: `Bien créé: ${created.title}.`,
      result: created,
    };
  }

  if (input.objectType === "rdv") {
    const title = normalizeOptionalString(input.params.title) ?? "Rendez-vous";
    const propertyId = normalizeOptionalString(input.params.propertyId);
    const startsAt = normalizeOptionalString(input.params.startsAt);
    const endsAt = normalizeOptionalString(input.params.endsAt);

    if (!propertyId || !startsAt || !endsAt) {
      throw new HttpError(
        400,
        "ASSISTANT_INVALID_CREATE_PAYLOAD",
        "Le rendez-vous nécessite propertyId, startsAt et endsAt.",
      );
    }

    const created = await calendarService.createManualAppointment({
      orgId: input.orgId,
      title,
      propertyId,
      userId: normalizeOptionalString(input.params.userId),
      startsAt,
      endsAt,
      address: normalizeOptionalString(input.params.address),
      comment: normalizeOptionalString(input.params.comment),
      changeMode: "AI",
    });

    return {
      objectId: created.id,
      summary: `Rendez-vous créé: ${created.title} (${formatTime(created.startsAt)}).`,
      result: created,
    };
  }

  if (input.objectType === "visite") {
    const propertyId = normalizeOptionalString(input.params.propertyId);
    const prospectUserId = normalizeOptionalString(input.params.prospectUserId);
    const startsAt = normalizeOptionalString(input.params.startsAt);
    const endsAt = normalizeOptionalString(input.params.endsAt);

    if (!propertyId || !prospectUserId || !startsAt || !endsAt) {
      throw new HttpError(
        400,
        "ASSISTANT_INVALID_CREATE_PAYLOAD",
        "La visite nécessite propertyId, prospectUserId, startsAt et endsAt.",
      );
    }

    const created = await propertiesService.addVisit({
      orgId: input.orgId,
      propertyId,
      prospectUserId,
      startsAt,
      endsAt,
      changeMode: "AI",
    });

    return {
      objectId: created.id,
      summary: `Visite créée pour ${created.propertyTitle}.`,
      result: created,
    };
  }

  if (input.objectType === "lien") {
    const typeLien = normalizeOptionalString(input.params.typeLien);
    const objectId1 = normalizeOptionalString(input.params.objectId1);
    const objectId2 = normalizeOptionalString(input.params.objectId2);

    if (!typeLien || !objectId1 || !objectId2) {
      throw new HttpError(
        400,
        "ASSISTANT_INVALID_CREATE_PAYLOAD",
        "Le lien nécessite typeLien, objectId1 et objectId2.",
      );
    }

    const params = isRecord(input.params.params)
      ? input.params.params
      : extractFlatToolParams(input.params, ["typeLien", "objectId1", "objectId2"]);

    const created = await linksService.upsert({
      orgId: input.orgId,
      typeLien,
      objectId1,
      objectId2,
      params,
    });

    return {
      objectId: created.item.id,
      summary: created.created
        ? `Lien créé: ${created.item.typeLien} (${created.item.objectId1} -> ${created.item.objectId2}).`
        : `Lien mis à jour: ${created.item.typeLien} (${created.item.objectId1} -> ${created.item.objectId2}).`,
      result: created.item,
    };
  }

  throw new HttpError(400, "ASSISTANT_UNSUPPORTED_OBJECT", "Type d'objet non supporté");
};

const executeUpdate = async (input: {
  orgId: string;
  objectType: AssistantObjectType;
  objectId: string;
  params: Record<string, unknown>;
}): Promise<{ objectId: string; summary: string; result: unknown }> => {
  if (input.objectType === "user") {
    const updated = await usersService.patchById({
      orgId: input.orgId,
      id: input.objectId,
      changeMode: "AI",
      data: {
        firstName: readPatchStringField(input.params, "firstName"),
        lastName: readPatchStringField(input.params, "lastName"),
        email: readPatchStringField(input.params, "email"),
        phone: readPatchStringField(input.params, "phone"),
        address: readPatchStringField(input.params, "address"),
        postalCode: readPatchStringField(input.params, "postalCode"),
        city: readPatchStringField(input.params, "city"),
        personalNotes: readPatchStringField(input.params, "personalNotes"),
        accountType: undefined,
      },
    });

    return {
      objectId: updated.id,
      summary: `Utilisateur mis à jour: ${toLookupLabel(updated)}.`,
      result: updated,
    };
  }

  if (input.objectType === "bien") {
    const normalizedParams = normalizeBienUpdateParams(input.params);
    const existing = await propertiesService.getById({
      orgId: input.orgId,
      id: input.objectId,
    });
    const existingDetails = flattenBienDetailsPatch(
      isRecord(existing.details) ? (existing.details as Record<string, unknown>) : {},
    );
    const hasDetailsPatch = Object.keys(normalizedParams.detailsPatch).length > 0;
    const hasPropertyScalarPatch =
      typeof normalizedParams.title !== "undefined" ||
      typeof normalizedParams.city !== "undefined" ||
      typeof normalizedParams.postalCode !== "undefined" ||
      typeof normalizedParams.address !== "undefined" ||
      typeof normalizedParams.price !== "undefined" ||
      typeof normalizedParams.hiddenExpectedDocumentKeys !== "undefined";
    const shouldPatchProperty = hasPropertyScalarPatch || hasDetailsPatch;
    const updated = shouldPatchProperty
      ? await propertiesService.patchById({
          orgId: input.orgId,
          id: input.objectId,
          changeMode: "AI",
          data: {
            title: normalizedParams.title,
            city: normalizedParams.city,
            postalCode: normalizedParams.postalCode,
            address: normalizedParams.address,
            price: normalizedParams.price,
            details: hasDetailsPatch
              ? mergePropertyDetailsPatch(existingDetails, normalizedParams.detailsPatch)
              : undefined,
            hiddenExpectedDocumentKeys: normalizedParams.hiddenExpectedDocumentKeys,
          },
        })
      : existing;

    return {
      objectId: updated.id,
      summary: `Bien mis à jour: ${updated.title}.`,
      result: updated,
    };
  }

  if (input.objectType === "rdv") {
    const updated = await calendarService.patchManualAppointmentComment({
      orgId: input.orgId,
      id: input.objectId,
      comment: readPatchStringField(input.params, "comment"),
      changeMode: "AI",
    });

    return {
      objectId: updated.id,
      summary: `Rendez-vous mis à jour: ${updated.title}.`,
      result: updated,
    };
  }

  if (input.objectType === "visite") {
    const updated = await propertiesService.patchVisitById({
      orgId: input.orgId,
      id: input.objectId,
      changeMode: "AI",
      data: {
        compteRendu: readPatchStringField(input.params, "compteRendu"),
        bonDeVisiteFileId: readPatchStringField(input.params, "bonDeVisiteFileId"),
      },
    });

    return {
      objectId: updated.id,
      summary: `Visite mise à jour pour ${updated.propertyTitle}.`,
      result: updated,
    };
  }

  if (input.objectType === "lien") {
    const updated = await linksService.patchById({
      orgId: input.orgId,
      id: input.objectId,
      params: input.params,
    });

    return {
      objectId: updated.id,
      summary: `Lien mis à jour: ${updated.typeLien}.`,
      result: updated,
    };
  }

  throw new HttpError(400, "ASSISTANT_UNSUPPORTED_OBJECT", "Type d'objet non supporté");
};

const formatWebSearchResponse = (citations: AssistantCitation[]): string => {
  if (citations.length === 0) {
    return "Je n'ai trouvé aucune source web pertinente.";
  }

  return `Voici ce que j'ai trouvé sur internet:\n${citations
    .map((citation) => `- ${citation.title} (${citation.url})`)
    .join("\n")}`;
};

const buildAssistantToolParams = (
  objectType: AssistantObjectType,
  typeLien?: string,
): ObjectFieldDefinition[] => {
  if (objectType === "lien") {
    if (!typeLien) {
      throw new HttpError(
        400,
        "ASSISTANT_LINK_TYPE_REQUIRED",
        "typeLien est requis pour getParams quand objectType=lien.",
      );
    }

    const definition = getLinkDataStructure(typeLien);
    if (!definition) {
      throw new HttpError(404, "LINK_TYPE_NOT_FOUND", "Type de lien introuvable.");
    }

    return [
      {
        key: "typeLien",
        name: "Type de lien",
        group: "general",
        type: "string",
        required: true,
      },
      {
        key: "objectId1",
        name: `ID ${definition.objectType1}`,
        group: "general",
        type: "string",
        required: true,
      },
      {
        key: "objectId2",
        name: `ID ${definition.objectType2}`,
        group: "general",
        type: "string",
        required: true,
      },
      ...definition.paramsSchema,
    ];
  }

  return getObjectDataStructure(objectType);
};

const trackAssistantTurn = async (input: {
  orgId: string;
  conversationId: string;
  userMessage: string;
  assistantResponse: string;
  context: AssistantMessageContext | null;
  intentKind: ParsedIntent["kind"];
  explicitWebSearch: boolean;
  citations: AssistantCitation[];
  webSearchTrace?: AssistantWebSearchTrace | null;
  skipAICallLog?: boolean;
}): Promise<void> => {
  const payload = {
    conversationId: input.conversationId,
    context: input.context,
    intent: input.intentKind,
    explicitWebSearch: input.explicitWebSearch,
    userMessage: input.userMessage,
  };
  const responsePayload = {
    assistantResponse: input.assistantResponse,
    citations: input.citations,
    webSearch: input.webSearchTrace
      ? {
          provider: input.webSearchTrace.provider,
          model: input.webSearchTrace.model,
          prompt: input.webSearchTrace.prompt,
          responseText: input.webSearchTrace.responseText,
          inputTokens: input.webSearchTrace.inputTokens,
          outputTokens: input.webSearchTrace.outputTokens,
          totalTokens: input.webSearchTrace.totalTokens,
          price: input.webSearchTrace.price,
        }
      : null,
  };

  console.info("[ASSISTANT][TURN]", JSON.stringify({ prompt: payload, response: responsePayload }));

  if (input.skipAICallLog) {
    return;
  }

  await trackAICallSafe({
    orgId: input.orgId,
    useCase: input.webSearchTrace ? "ASSISTANT_WEB_SEARCH" : "ASSISTANT_CHAT",
    prompt: JSON.stringify(payload),
    textResponse: JSON.stringify(responsePayload),
    price: input.webSearchTrace?.price ?? 0,
    inputTokens: input.webSearchTrace?.inputTokens ?? undefined,
    outputTokens: input.webSearchTrace?.outputTokens ?? undefined,
    totalTokens: input.webSearchTrace?.totalTokens ?? undefined,
  });
};

export const assistantService = {
  async getConversation(input: {
    orgId: string;
    userId: string;
    assistantSoul?: string | null;
  }): Promise<AssistantConversationResponse> {
    const conversation = await ensureConversation({
      orgId: input.orgId,
      userId: input.userId,
      assistantSoul: input.assistantSoul,
    });

    return buildConversationResponse({
      orgId: input.orgId,
      conversationId: conversation.id,
    });
  },

  async resetConversation(input: {
    orgId: string;
    userId: string;
    assistantSoul?: string | null;
  }): Promise<AssistantConversationResponse> {
    const conversation = await ensureConversation({
      orgId: input.orgId,
      userId: input.userId,
      assistantSoul: input.assistantSoul,
    });

    await db
      .delete(assistantMessages)
      .where(
        and(
          eq(assistantMessages.conversationId, conversation.id),
          eq(assistantMessages.orgId, input.orgId),
        ),
      );

    await appendConversationMessage({
      conversationId: conversation.id,
      orgId: input.orgId,
      role: "SYSTEM",
      text: toAssistantSoul(input.assistantSoul),
    });

    await appendConversationMessage({
      conversationId: conversation.id,
      orgId: input.orgId,
      role: "ASSISTANT",
      text: DEFAULT_GREETING,
    });

    return buildConversationResponse({
      orgId: input.orgId,
      conversationId: conversation.id,
    });
  },

  async postUserMessage(input: {
    orgId: string;
    userId: string;
    message: string;
    context?: AssistantMessageContext | null;
    assistantSoul?: string | null;
  }): Promise<{
    conversation: AssistantConversationResponse;
    assistantMessage: AssistantMessageResponse;
  }> {
    const conversation = await ensureConversation({
      orgId: input.orgId,
      userId: input.userId,
      assistantSoul: input.assistantSoul,
    });

    const message = input.message.trim();
    if (!message) {
      throw new HttpError(400, "ASSISTANT_EMPTY_MESSAGE", "Le message assistant est vide.");
    }
    const messageContext = normalizeAssistantMessageContext(input.context);

    await appendConversationMessage({
      conversationId: conversation.id,
      orgId: input.orgId,
      role: "USER",
      text: message,
      citations: [],
    });

    const intent = parseIntent(message);
    const explicitWebSearch = wantsExplicitWebSearch(message);

    const respond = async (
      text: string,
      options?: {
        citations?: AssistantCitation[];
        webSearchTrace?: AssistantWebSearchTrace | null;
        skipAICallLog?: boolean;
      },
    ): Promise<{
      conversation: AssistantConversationResponse;
      assistantMessage: AssistantMessageResponse;
    }> => {
      const citations = options?.citations ?? [];
      const assistantRow = await appendConversationMessage({
        conversationId: conversation.id,
        orgId: input.orgId,
        role: "ASSISTANT",
        text,
        citations,
      });
      const assistantMessage = toAssistantMessageResponse(assistantRow);

      await trackAssistantTurn({
        orgId: input.orgId,
        conversationId: conversation.id,
        userMessage: message,
        assistantResponse: text,
        context: messageContext,
        intentKind: intent.kind,
        explicitWebSearch,
        citations,
        webSearchTrace: options?.webSearchTrace ?? null,
        skipAICallLog: options?.skipAICallLog ?? false,
      });

      return {
        conversation: await buildConversationResponse({
          orgId: input.orgId,
          conversationId: conversation.id,
        }),
        assistantMessage,
      };
    };

    const respondWithOptionalWebFallback = async (
      localFallbackText: string,
    ): Promise<{
      conversation: AssistantConversationResponse;
      assistantMessage: AssistantMessageResponse;
    }> => {
      if (!explicitWebSearch) {
        return respond(localFallbackText);
      }

      const webSearch = await assistantWebSearchProvider.search({
        orgId: input.orgId,
        query: message,
      });

      if (webSearch.citations.length === 0) {
        return respond(
          `${localFallbackText}\n\nJe n'ai trouvé aucune source web pertinente.`,
          { webSearchTrace: webSearch.trace },
        );
      }

      return respond(formatWebSearchResponse(webSearch.citations), {
        citations: webSearch.citations,
        webSearchTrace: webSearch.trace,
      });
    };

    if (messageContext?.objectType === "bien") {
      const structuredListingUpdate = extractStructuredBienDetailsFromListing(message);
      if (structuredListingUpdate.shouldHandle) {
        const updateResult = await assistantService.toolUpdate({
          orgId: input.orgId,
          userId: input.userId,
          conversationId: conversation.id,
          objectType: "bien",
          objectId: messageContext.objectId,
          params: {
            details: structuredListingUpdate.detailsPatch,
          },
        });

        const extractedPreview = structuredListingUpdate.extracted
          .slice(0, 12)
          .map((item) => `- ${item}`)
          .join("\n");
        const assistantText = [
          "## Mise à jour technique appliquée",
          extractedPreview
            ? `Champs détectés dans le descriptif:\n${extractedPreview}`
            : "Descriptif détecté et enregistré.",
          updateResult.summary,
        ].join("\n\n");

        return respond(assistantText);
      }
    }

    const messageRows = await listConversationRows({
      orgId: input.orgId,
      conversationId: conversation.id,
      limit: 40,
    });
    const modelTurn = await runOpenAIToolDrivenTurn({
      orgId: input.orgId,
      conversationId: conversation.id,
      context: messageContext,
      messageRows,
      handlers: {
        search: async (toolInput) =>
          assistantService.toolSearch({
            orgId: input.orgId,
            q: toolInput.q,
            objectType: toolInput.objectType,
          }),
        get: async (toolInput) =>
          assistantService.toolGet({
            orgId: input.orgId,
            objectType: toolInput.objectType,
            objectId: toolInput.objectId,
          }),
        getParams: (toolInput) =>
          assistantService.toolGetParams({
            objectType: toolInput.objectType,
            typeLien: toolInput.typeLien,
          }),
        create: async (toolInput) =>
          assistantService.toolCreate({
            orgId: input.orgId,
            userId: input.userId,
            conversationId: conversation.id,
            objectType: toolInput.objectType,
            params: toolInput.params,
          }),
        update: async (toolInput) =>
          assistantService.toolUpdate({
            orgId: input.orgId,
            userId: input.userId,
            conversationId: conversation.id,
            objectType: toolInput.objectType,
            objectId: toolInput.objectId,
            params: toolInput.params,
          }),
      },
    });

    if (modelTurn) {
      if (modelTurn.mutationFailureCount > 0 && modelTurn.mutationSuccessCount === 0) {
        const firstError = modelTurn.firstMutationError?.trim();
        const failureText = firstError
          ? `Je n'ai pas pu exécuter l'action demandée: ${firstError}`
          : "Je n'ai pas pu exécuter l'action demandée. Vérifiez les paramètres puis réessayez.";
        return respond(failureText, {
          citations: modelTurn.citations,
          skipAICallLog: true,
        });
      }

      return respond(modelTurn.text, {
        citations: modelTurn.citations,
        skipAICallLog: true,
      });
    }

    if (intent.kind === "list_rdv_today") {
      const todayWindow = resolveTodayWindow();
      const appointments = await calendarService.listManualAppointments({
        orgId: input.orgId,
        from: todayWindow.from,
        to: todayWindow.to,
      });

      const text =
        appointments.items.length === 0
          ? "Vous n'avez aucun rendez-vous aujourd'hui."
          : `Rendez-vous d'aujourd'hui:\n${appointments.items
              .map(
                (item) =>
                  `- ${formatTime(item.startsAt)} ${item.title} (${item.propertyTitle}${item.userFirstName ? ` · ${item.userFirstName} ${item.userLastName ?? ""}` : ""})`,
              )
              .join("\n")}`;

      return respond(text);
    }

    if (intent.kind === "pool_check") {
      const listed = await propertiesService.list({
        orgId: input.orgId,
        query: intent.propertyQuery,
        limit: 5,
      });

      if (listed.items.length === 0) {
        return respondWithOptionalWebFallback(
          "Je ne trouve pas ce bien. Donnez-moi le nom exact ou l'adresse complète.",
        );
      }

      if (listed.items.length > 1) {
        return respond(
          `J'ai trouvé plusieurs biens: ${listed.items
            .map((item) => item.title)
            .join(", ")}. Lequel souhaitez-vous ?`,
        );
      }

      const property = listed.items[0]!;
      const details = property.details as Record<string, unknown>;
      const poolStatus = extractPoolStatus(details);

      const responseText =
        poolStatus === "OUI"
          ? `Oui, il y a une piscine sur ${property.title}.`
          : poolStatus === "NON"
            ? `Non, ${property.title} n'a pas de piscine.`
            : poolStatus === "PISCINABLE"
              ? `Le bien ${property.title} est indiqué comme piscinable.`
              : `Je n'ai pas l'information piscine pour ${property.title}.`;

      return respond(responseText);
    }

    if (intent.kind === "surface_check") {
      const listed = await propertiesService.list({
        orgId: input.orgId,
        query: intent.propertyQuery,
        limit: 5,
      });

      if (listed.items.length === 0) {
        return respondWithOptionalWebFallback(
          "Je ne trouve pas ce bien. Donnez-moi le nom exact ou l'adresse complète.",
        );
      }

      if (listed.items.length > 1) {
        return respond(
          `J'ai trouvé plusieurs biens: ${listed.items
            .map((item) => item.title)
            .join(", ")}. Lequel souhaitez-vous ?`,
        );
      }

      const property = listed.items[0]!;
      const details = property.details as Record<string, unknown>;
      const surface = extractSurface(details);
      if (surface === null) {
        return respond(`Je n'ai pas la surface renseignée pour ${property.title}.`);
      }

      return respond(`La surface de ${property.title} est de ${formatSurface(surface)} m².`);
    }

    if (intent.kind === "create_client") {
      if (!intent.phone && !intent.email) {
        return respond("Pour créer l'utilisateur, il me faut au moins un email ou un téléphone.");
      }
      const created = await assistantService.toolCreate({
        orgId: input.orgId,
        userId: input.userId,
        conversationId: conversation.id,
        objectType: "user",
        params: {
          firstName: intent.firstName,
          lastName: intent.lastName,
          phone: intent.phone,
          email: intent.email,
          accountType: "CLIENT",
        },
      });

      return respond(created.summary);
    }

    if (intent.kind === "create_bien") {
      const missing: string[] = [];
      if (!intent.city) {
        missing.push("ville");
      }
      if (!intent.address) {
        missing.push("adresse");
      }
      if (!intent.postalCode) {
        missing.push("code postal");
      }

      if (missing.length > 0) {
        return respond(`Pour créer le bien, il me manque: ${missing.join(", ")}.`);
      }
      const propertyType =
        intent.propertyType === "Maison"
          ? "MAISON"
          : intent.propertyType === "Appartement"
            ? "APPARTEMENT"
            : intent.propertyType === "Immeuble"
              ? "IMMEUBLE"
              : intent.propertyType === "Terrain"
                ? "TERRAIN"
                : intent.propertyType === "Local"
                  ? "LOCAL_COMMERCIAL"
                  : null;

      const created = await assistantService.toolCreate({
        orgId: input.orgId,
        userId: input.userId,
        conversationId: conversation.id,
        objectType: "bien",
        params: {
          title: `${intent.propertyType ?? "Bien"} ${intent.city}`.trim(),
          city: intent.city,
          postalCode: intent.postalCode,
          address: intent.address,
          details: propertyType ? { propertyType } : {},
        },
      });

      return respond(
        `${created.summary}\n\nVous pouvez ensuite créer un lien propriétaire avec un utilisateur.`,
      );
    }

    if (intent.kind === "create_rdv") {
      const propertiesFound = await propertiesService.list({
        orgId: input.orgId,
        query: intent.propertyQuery,
        limit: 5,
      });
      if (propertiesFound.items.length === 0) {
        return respond(`Je ne trouve pas le bien « ${intent.propertyQuery} ».`);
      }

      if (propertiesFound.items.length > 1) {
        return respond(
          `Plusieurs biens correspondent: ${propertiesFound.items.map((item) => item.title).join(", ")}.`,
        );
      }

      const usersFound = await usersService.list({
        orgId: input.orgId,
        limit: 5,
        query: intent.clientQuery,
      });

      if (usersFound.items.length === 0) {
        return respond(`Je ne trouve pas l'utilisateur « ${intent.clientQuery} ».`);
      }

      if (usersFound.items.length > 1) {
        return respond(
          `Plusieurs utilisateurs correspondent: ${usersFound.items
            .map((item) => toLookupLabel(item))
            .join(", ")}.`,
        );
      }

      const property = propertiesFound.items[0]!;
      const linkedUser = usersFound.items[0]!;
      const created = await assistantService.toolCreate({
        orgId: input.orgId,
        userId: input.userId,
        conversationId: conversation.id,
        objectType: "rdv",
        params: {
          title: `Rendez-vous avec ${toLookupLabel(linkedUser)}`,
          propertyId: property.id,
          userId: linkedUser.id,
          startsAt: intent.startsAt.toISOString(),
          endsAt: intent.endsAt.toISOString(),
          address: null,
          comment: null,
        },
      });

      return respond(created.summary);
    }

    return respondWithOptionalWebFallback(
      "Je peux vous aider sur les biens, utilisateurs, rendez-vous, visites et liens. Donnez-moi une action précise.",
    );
  },

  async toolSearch(input: {
    orgId: string;
    q: string;
    objectType?: AssistantObjectType;
  }): Promise<Record<string, unknown>> {
    const q = input.q.trim();
    if (!q) {
      return { items: [] };
    }

    if (!input.objectType || input.objectType === "bien") {
      const listed = await propertiesService.list({
        orgId: input.orgId,
        query: q,
        limit: 20,
      });
      if (input.objectType === "bien") {
        return listed;
      }
    }

    if (!input.objectType || input.objectType === "user") {
      const listed = await usersService.list({
        orgId: input.orgId,
        query: q,
        limit: 20,
      });
      if (input.objectType === "user") {
        return listed;
      }
    }

    if (!input.objectType || input.objectType === "rdv") {
      const listed = await calendarService.listManualAppointments({ orgId: input.orgId });
      const filtered = listed.items.filter((item) =>
        normalizeText(`${item.title} ${item.propertyTitle} ${item.userFirstName ?? ""} ${item.userLastName ?? ""}`).includes(
          normalizeText(q),
        ),
      );
      if (input.objectType === "rdv") {
        return { items: filtered };
      }
    }

    if (!input.objectType || input.objectType === "lien") {
      const listed = await linksService.list({
        orgId: input.orgId,
        limit: 100,
      });
      const normalizedQ = normalizeText(q);
      const filtered = listed.items.filter((item) =>
        normalizeText(`${item.typeLien} ${item.objectId1} ${item.objectId2}`).includes(normalizedQ),
      );
      if (input.objectType === "lien") {
        return { items: filtered };
      }
    }

    const listedVisits = await propertiesService.listCalendarVisits({ orgId: input.orgId });
    const filteredVisits = listedVisits.items.filter((item) =>
      normalizeText(`${item.propertyTitle} ${item.prospectFirstName} ${item.prospectLastName}`).includes(
        normalizeText(q),
      ),
    );

    if (input.objectType === "visite") {
      return { items: filteredVisits };
    }

    return {
      items: [
        ...(await propertiesService.list({ orgId: input.orgId, query: q, limit: 10 })).items.map((item) => ({
          objectType: "bien",
          data: item,
        })),
        ...(await usersService.list({
          orgId: input.orgId,
          query: q,
          limit: 10,
        })).items.map((item) => ({
          objectType: "user",
          data: item,
        })),
        ...(await linksService.list({
          orgId: input.orgId,
          limit: 50,
        })).items
          .filter((item) =>
            normalizeText(`${item.typeLien} ${item.objectId1} ${item.objectId2}`).includes(normalizeText(q)),
          )
          .slice(0, 10)
          .map((item) => ({ objectType: "lien", data: item })),
        ...filteredVisits.slice(0, 10).map((item) => ({ objectType: "visite", data: item })),
      ],
    };
  },

  async toolGet(input: {
    orgId: string;
    objectType: AssistantObjectType;
    objectId: string;
  }): Promise<unknown> {
    if (input.objectType === "bien") {
      return propertiesService.getById({ orgId: input.orgId, id: input.objectId });
    }

    if (input.objectType === "user") {
      return usersService.getById({ orgId: input.orgId, id: input.objectId });
    }

    if (input.objectType === "rdv") {
      return calendarService.getManualAppointmentById({ orgId: input.orgId, id: input.objectId });
    }

    if (input.objectType === "lien") {
      return linksService.getById({ orgId: input.orgId, id: input.objectId });
    }

    return propertiesService.getVisitById({ orgId: input.orgId, id: input.objectId });
  },

  toolGetParams(input: { objectType: AssistantObjectType; typeLien?: string }): unknown {
    return buildAssistantToolParams(input.objectType, input.typeLien);
  },

  async toolCreate(input: {
    orgId: string;
    userId: string;
    conversationId: string;
    objectType: AssistantObjectType;
    params: Record<string, unknown>;
  }): Promise<AssistantToolMutationResult> {
    await assertConversationOwnership({
      orgId: input.orgId,
      userId: input.userId,
      conversationId: input.conversationId,
    });

    const execution = await executeCreate({
      orgId: input.orgId,
      objectType: input.objectType,
      params: input.params,
    });

    return {
      status: "EXECUTED",
      objectId: execution.objectId,
      summary: execution.summary,
      result: execution.result,
    };
  },

  async toolUpdate(input: {
    orgId: string;
    userId: string;
    conversationId: string;
    objectType: AssistantObjectType;
    objectId: string;
    params: Record<string, unknown>;
  }): Promise<AssistantToolMutationResult> {
    await assertConversationOwnership({
      orgId: input.orgId,
      userId: input.userId,
      conversationId: input.conversationId,
    });

    const execution = await executeUpdate({
      orgId: input.orgId,
      objectType: input.objectType,
      objectId: input.objectId,
      params: input.params,
    });

    return {
      status: "EXECUTED",
      objectId: execution.objectId,
      summary: execution.summary,
      result: execution.result,
    };
  },
};
