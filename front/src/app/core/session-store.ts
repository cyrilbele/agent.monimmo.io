import { signal } from "@angular/core";

import type { AuthResponse, UserRole } from "./api.models";

const accessToken = signal<string | null>(null);
const refreshToken = signal<string | null>(null);
const userEmail = signal<string | null>(null);
const userRole = signal<UserRole | null>(null);

export const sessionStore = {
  accessToken,
  refreshToken,
  userEmail,
  userRole,
  clear(): void {
    accessToken.set(null);
    refreshToken.set(null);
    userEmail.set(null);
    userRole.set(null);
  },
  setFromAuthResponse(payload: AuthResponse): void {
    accessToken.set(payload.accessToken);
    refreshToken.set(payload.refreshToken);
    userEmail.set(payload.user.email ?? null);
    userRole.set(payload.user.role);
  },
  setTokens(input: { accessToken: string; refreshToken: string }): void {
    accessToken.set(input.accessToken);
    refreshToken.set(input.refreshToken);
  },
};
