import { Injectable } from "@angular/core";

import type { ErrorResponse } from "./api.models";
import {
  ACCESS_TOKEN_STORAGE_KEY,
} from "./constants";
import { normalizeApiBaseUrl } from "./auth-helpers";

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

    const response = await fetch(url, {
      method,
      headers,
      body: hasBody
        ? options.body instanceof FormData
          ? options.body
          : JSON.stringify(options.body)
        : undefined,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const data = await this.readJson(response);

    if (!response.ok) {
      const payload = data as Partial<ErrorResponse> | null;
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

  private getAccessToken(): string {
    if (typeof localStorage === "undefined") {
      return "";
    }

    return localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) ?? "";
  }
}
