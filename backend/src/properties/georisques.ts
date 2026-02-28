type PropertyLocationInput = {
  address: string | null;
  postalCode: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
};

type RiskApiItem = {
  label: string;
  categoryCode: string | null;
  source: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type PropertyRisksResponse = {
  propertyId: string;
  status: "OK" | "NO_DATA" | "UNAVAILABLE";
  source: "GEORISQUES";
  georisquesUrl: string;
  reportPdfUrl: string | null;
  generatedAt: string;
  message: string | null;
  location: {
    address: string | null;
    postalCode: string;
    city: string;
    inseeCode: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  items: RiskApiItem[];
};

const GEO_API_BASE_URL = "https://www.georisques.gouv.fr/api/v1";
const GEO_PUBLIC_URL = "https://www.georisques.gouv.fr";
const GEO_PUBLIC_RAPPORT_URL = `${GEO_PUBLIC_URL}/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2`;
const GEO_API_TIMEOUT_MS = 8000;

type FetchLike = typeof fetch;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizeText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeLabel = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase()
    .trim();

const toGeorisquesUrl = (params: {
  location: PropertyLocationInput;
  inseeCode: string | null;
}): string => {
  const city = sanitizeText(params.location.city);
  const postalCode = sanitizeText(params.location.postalCode);
  const streetAddress = sanitizeText(params.location.address);
  const addressLabel =
    streetAddress && postalCode && city
      ? `${streetAddress}, ${postalCode} ${city}`
      : [streetAddress ?? "", postalCode ?? "", city ?? ""].join(" ").trim();
  const hasCoordinates =
    typeof params.location.latitude === "number" &&
    Number.isFinite(params.location.latitude) &&
    typeof params.location.longitude === "number" &&
    Number.isFinite(params.location.longitude);

  if (!addressLabel && !city && !hasCoordinates) {
    return GEO_PUBLIC_URL;
  }

  const endpoint = new URL(GEO_PUBLIC_RAPPORT_URL);
  endpoint.searchParams.set("type", "adresse");
  endpoint.searchParams.set("typeForm", "adresse");
  endpoint.searchParams.set("form-adresse", "true");

  if (city) {
    endpoint.searchParams.set("city", city);
    endpoint.searchParams.set("commune", city);
  }

  if (addressLabel) {
    endpoint.searchParams.set("adresse", addressLabel);
    endpoint.searchParams.set("propertiesType", streetAddress ? "housenumber" : "municipality");
  }

  if (params.inseeCode) {
    endpoint.searchParams.set("codeInsee", params.inseeCode);
  }

  if (hasCoordinates) {
    const longitudeValue = String(params.location.longitude);
    const latitudeValue = String(params.location.latitude);
    endpoint.searchParams.set("lon", longitudeValue);
    endpoint.searchParams.set("lat", latitudeValue);
    endpoint.searchParams.set("longitude", longitudeValue);
    endpoint.searchParams.set("latitude", latitudeValue);
  }

  return endpoint.toString();
};

const buildRapportPdfUrl = (params: {
  inseeCode: string | null;
  location: PropertyLocationInput;
}): string | null => {
  const endpoint = new URL(`${GEO_API_BASE_URL}/rapport_pdf`);

  if (
    typeof params.location.latitude === "number" &&
    Number.isFinite(params.location.latitude) &&
    typeof params.location.longitude === "number" &&
    Number.isFinite(params.location.longitude)
  ) {
    endpoint.searchParams.set(
      "latlon",
      `${params.location.longitude},${params.location.latitude}`,
    );
    return endpoint.toString();
  }

  const addressTerms = [
    params.location.address ?? "",
    params.location.postalCode,
    params.location.city,
  ]
    .join(" ")
    .trim();
  if (addressTerms) {
    endpoint.searchParams.set("adresse", addressTerms);
    return endpoint.toString();
  }

  if (params.inseeCode) {
    endpoint.searchParams.set("code_insee", params.inseeCode);
    return endpoint.toString();
  }

  return null;
};

const fetchJson = async (fetchImpl: FetchLike, url: string): Promise<unknown> => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), GEO_API_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`request_failed_${response.status}`);
    }

    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const resolveInseeCode = async (
  fetchImpl: FetchLike,
  input: { postalCode: string; city: string },
): Promise<string | null> => {
  const url = new URL("https://geo.api.gouv.fr/communes");
  url.searchParams.set("codePostal", input.postalCode);
  url.searchParams.set("nom", input.city);
  url.searchParams.set("fields", "nom,code,codesPostaux");
  url.searchParams.set("boost", "population");
  url.searchParams.set("limit", "10");

  const payload = await fetchJson(fetchImpl, url.toString());
  if (!Array.isArray(payload)) {
    return null;
  }

  const candidates = payload.filter(isRecord);
  if (candidates.length === 0) {
    return null;
  }

  const normalizedCity = normalizeLabel(input.city);

  const exact = candidates.find((candidate) => {
    const name = sanitizeText(candidate.nom);
    return name ? normalizeLabel(name) === normalizedCity : false;
  });
  if (exact) {
    return sanitizeText(exact.code);
  }

  return sanitizeText(candidates[0]?.code);
};

export const getPropertyRisks = async (input: {
  propertyId: string;
  location: PropertyLocationInput;
  fetchImpl?: FetchLike;
}): Promise<PropertyRisksResponse> => {
  const fetchImpl = input.fetchImpl ?? fetch;
  const generatedAt = new Date().toISOString();

  let inseeCode: string | null = null;
  try {
    inseeCode = await resolveInseeCode(fetchImpl, {
      postalCode: input.location.postalCode,
      city: input.location.city,
    });
  } catch {
    inseeCode = null;
  }

  const georisquesUrl = toGeorisquesUrl({
    location: input.location,
    inseeCode,
  });
  const reportPdfUrl = buildRapportPdfUrl({
    inseeCode,
    location: input.location,
  });

  return {
    propertyId: input.propertyId,
    status: "NO_DATA",
    source: "GEORISQUES",
    georisquesUrl,
    reportPdfUrl,
    generatedAt,
    message: reportPdfUrl
      ? "Consultez le rapport PDF Georisques ou la page Georisques pour le detail des risques."
      : "Consultez la page Georisques pour le detail des risques.",
    location: {
      address: input.location.address,
      postalCode: input.location.postalCode,
      city: input.location.city,
      inseeCode,
      latitude: input.location.latitude,
      longitude: input.location.longitude,
    },
    items: [],
  };
};
