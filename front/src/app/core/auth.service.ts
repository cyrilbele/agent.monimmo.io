import { computed, inject, Injectable, signal } from "@angular/core";

import type { AuthResponse } from "./api.models";
import { ApiClientService } from "./api-client.service";
import {
  ACCESS_TOKEN_STORAGE_KEY,
  REFRESH_TOKEN_STORAGE_KEY,
  SESSION_EMAIL_STORAGE_KEY,
} from "./constants";

@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly api = inject(ApiClientService);

  readonly accessToken = signal<string | null>(this.readStorage(ACCESS_TOKEN_STORAGE_KEY));
  readonly refreshToken = signal<string | null>(this.readStorage(REFRESH_TOKEN_STORAGE_KEY));
  readonly userEmail = signal<string | null>(this.readStorage(SESSION_EMAIL_STORAGE_KEY));
  readonly authenticated = computed(() => Boolean(this.accessToken()));

  isAuthenticated(): boolean {
    return this.authenticated();
  }

  async login(email: string, password: string): Promise<void> {
    const payload = await this.api.request<AuthResponse>("POST", "/auth/login", {
      auth: false,
      body: { email, password },
    });

    this.persistSession(payload);
  }

  async register(payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Promise<void> {
    const response = await this.api.request<AuthResponse>("POST", "/auth/register", {
      auth: false,
      body: payload,
    });

    this.persistSession(response);
  }

  async forgotPassword(email: string): Promise<void> {
    await this.api.request<void>("POST", "/auth/forgot-password", {
      auth: false,
      body: { email },
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.api.request<void>("POST", "/auth/reset-password", {
      auth: false,
      body: { token, newPassword },
    });
  }

  async logout(): Promise<void> {
    const refreshToken = this.refreshToken();

    if (refreshToken) {
      try {
        await this.api.request<void>("POST", "/auth/logout", {
          auth: false,
          body: { refreshToken },
        });
      } catch {
        // Toujours purger localement même si l'API de logout échoue.
      }
    }

    this.clearSession();
  }

  clearSession(): void {
    this.accessToken.set(null);
    this.refreshToken.set(null);
    this.userEmail.set(null);

    if (typeof localStorage === "undefined") {
      return;
    }

    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(SESSION_EMAIL_STORAGE_KEY);
  }

  private persistSession(payload: AuthResponse): void {
    this.accessToken.set(payload.accessToken);
    this.refreshToken.set(payload.refreshToken);
    this.userEmail.set(payload.user.email ?? null);

    if (typeof localStorage === "undefined") {
      return;
    }

    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, payload.accessToken);
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, payload.refreshToken);
    localStorage.setItem(SESSION_EMAIL_STORAGE_KEY, payload.user.email ?? "");
  }

  private readStorage(key: string): string | null {
    if (typeof localStorage === "undefined") {
      return null;
    }

    const value = localStorage.getItem(key);
    return value ? value : null;
  }
}
