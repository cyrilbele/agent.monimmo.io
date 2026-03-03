import { computed, inject, Injectable } from "@angular/core";

import type { AuthResponse } from "./api.models";
import { ApiClientService } from "./api-client.service";
import { sessionStore } from "./session-store";

@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly api = inject(ApiClientService);

  readonly accessToken = sessionStore.accessToken;
  readonly refreshToken = sessionStore.refreshToken;
  readonly userEmail = sessionStore.userEmail;
  readonly userRole = sessionStore.userRole;
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
    sessionStore.clear();
  }

  private persistSession(payload: AuthResponse): void {
    sessionStore.setFromAuthResponse(payload);
  }
}
