import { externalFetch } from "../http/external-fetch";

type FetchLike = typeof fetch;

export type PropertyCoordinates = {
  latitude: number;
  longitude: number;
};

const GEOCODING_API_URL = "https://data.geopf.fr/geocodage/search";
const GEOCODING_TIMEOUT_MS = 6000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizeText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const isFiniteCoordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const parseCoordinatesFromFeature = (feature: unknown): PropertyCoordinates | null => {
  if (!isRecord(feature)) {
    return null;
  }

  const geometry = feature.geometry;
  if (!isRecord(geometry)) {
    return null;
  }

  const coordinates = geometry.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const [longitude, latitude] = coordinates;
  if (!isFiniteCoordinate(latitude) || !isFiniteCoordinate(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
};

const fetchJson = async (fetchImpl: FetchLike, url: string): Promise<unknown> => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), GEOCODING_TIMEOUT_MS);

  try {
    const response = await externalFetch({
      service: "geocoding",
      url,
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
      fetchImpl,
    });

    if (!response.ok) {
      throw new Error(`request_failed_${response.status}`);
    }

    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

export const findCoordinatesForAddress = async (input: {
  address: string;
  postalCode: string;
  city: string;
  fetchImpl?: FetchLike;
}): Promise<PropertyCoordinates | null> => {
  const address = sanitizeText(input.address);
  const postalCode = sanitizeText(input.postalCode);
  const city = sanitizeText(input.city);

  if (!address || !postalCode || !city) {
    return null;
  }

  const endpoint = new URL(GEOCODING_API_URL);
  endpoint.searchParams.set("q", `${address} ${postalCode} ${city}`);
  endpoint.searchParams.set("postcode", postalCode);
  endpoint.searchParams.set("city", city);
  endpoint.searchParams.set("limit", "1");
  endpoint.searchParams.set("autocomplete", "0");

  try {
    const payload = await fetchJson(input.fetchImpl ?? fetch, endpoint.toString());
    if (!isRecord(payload)) {
      return null;
    }

    const features = payload.features;
    if (!Array.isArray(features) || features.length === 0) {
      return null;
    }

    return parseCoordinatesFromFeature(features[0]);
  } catch {
    return null;
  }
};
