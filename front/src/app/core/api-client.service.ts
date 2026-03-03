import { Injectable } from "@angular/core";

import type { ErrorResponse } from "./api.models";
import { normalizeApiBaseUrl } from "./auth-helpers";
import { sessionStore } from "./session-store";

interface RequestOptions {
  auth?: boolean;
  body?: unknown;
  params?: Record<string, string | number | boolean | null | undefined>;
}

const resolveApiBaseUrl = (): string => {
  const runtimeValue =
    typeof window !== "undefined"
      ? (window as Window & { MONIMMO_API_BASE_URL?: string }).MONIMMO_API_BASE_URL
      : undefined;

  return normalizeApiBaseUrl(runtimeValue);
};

const AJAX_CACHE_NAME = "monimmo-ajax-cache-v1";

const isNetworkError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "TypeError" ||
    error.message.toLowerCase().includes("network") ||
    error.message.toLowerCase().includes("fetch")
  );
};

export const clearApiAjaxCache = async (): Promise<void> => {
  if (typeof caches === "undefined") {
    return;
  }

  try {
    await caches.delete(AJAX_CACHE_NAME);
  } catch {
    // no-op
  }
};

@Injectable({ providedIn: "root" })
export class ApiClientService {
  private readonly baseUrl = resolveApiBaseUrl();

  async request<T>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const withAuth = options.auth ?? true;
    const url = this.buildUrl(path, options.params);

    const headers = new Headers({
      Accept: "application/json",
    });

    if (withAuth) {
      const token = this.getAccessToken();
      if (!token) {
        throw new Error("Session expirée. Veuillez vous reconnecter.");
      }

      headers.set("Authorization", `Bearer ${token}`);
    }

    const hasBody = typeof options.body !== "undefined";

    if (hasBody && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    const body = hasBody
      ? options.body instanceof FormData
        ? options.body
        : JSON.stringify(options.body)
      : undefined;
    const cacheEnabled = this.shouldUseAjaxCache(method, url);
    const cacheKey = this.buildCacheKey(url);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
      });
    } catch (error) {
      if (cacheEnabled && isNetworkError(error)) {
        const cachedResponse = await this.readCachedResponse(cacheKey);
        if (cachedResponse) {
          return cachedResponse as T;
        }
      }

      throw error;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const responseForCache = cacheEnabled && response.ok ? response.clone() : null;
    const data = await this.readJson(response);

    if (responseForCache) {
      await this.writeCachedResponse(cacheKey, responseForCache);
    }

    if (!response.ok) {
      const payload = data as Partial<ErrorResponse> | null;
      this.handleInvalidTokenError(payload?.message ?? null);
      throw new Error(payload?.message ?? `Requête impossible (${response.status}).`);
    }

    return data as T;
  }

  private buildUrl(
    path: string,
    params: Record<string, string | number | boolean | null | undefined> | undefined,
  ): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalizedPath}`);

    if (!params) {
      return url.toString();
    }

    for (const [key, value] of Object.entries(params)) {
      if (value === null || typeof value === "undefined" || value === "") {
        continue;
      }

      url.searchParams.set(key, String(value));
    }

    return url.toString();
  }

  private async readJson(response: Response): Promise<unknown> {
    const body = await response.text();

    if (!body) {
      return null;
    }

    try {
      return JSON.parse(body) as unknown;
    } catch {
      return null;
    }
  }

  private shouldUseAjaxCache(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    url: string,
  ): boolean {
    if (method !== "GET") {
      return false;
    }

    const parsed = new URL(url);
    return !parsed.pathname.startsWith("/auth/") && !parsed.pathname.startsWith("/privacy/");
  }

  private buildCacheKey(url: string): string {
    const parsed = new URL(url);
    return parsed.toString();
  }

  private async writeCachedResponse(cacheKey: string, response: Response): Promise<void> {
    if (typeof caches === "undefined") {
      return;
    }

    try {
      const cache = await caches.open(AJAX_CACHE_NAME);
      await cache.put(cacheKey, response);
    } catch {
      // no-op
    }
  }

  private async readCachedResponse(cacheKey: string): Promise<unknown | null> {
    if (typeof caches === "undefined") {
      return null;
    }

    try {
      const cache = await caches.open(AJAX_CACHE_NAME);
      const match = await cache.match(cacheKey);
      if (!match) {
        return null;
      }

      return this.readJson(match);
    } catch {
      return null;
    }
  }

  private getAccessToken(): string {
    return sessionStore.accessToken() ?? "";
  }

  private handleInvalidTokenError(message: string | null): void {
    if (typeof message !== "string") {
      return;
    }

    if (!message.toLowerCase().includes("token invalide")) {
      return;
    }

    this.clearStoredSession();
    this.redirectToLogin();
  }

  private clearStoredSession(): void {
    sessionStore.clear();
    void clearApiAjaxCache();
  }

  private redirectToLogin(): void {
    if (typeof window === "undefined") {
      return;
    }

    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const onLoginPage = currentPath.startsWith("/login");
    if (onLoginPage) {
      return;
    }

    const redirect = encodeURIComponent(currentPath || "/app");
    window.location.assign(`/login?redirect=${redirect}`);
  }
}
