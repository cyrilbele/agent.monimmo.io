import { inject, Injectable, signal } from "@angular/core";

import type { AppSettingsResponse } from "../core/api.models";
import { ApiClientService } from "../core/api-client.service";

const DEFAULT_NOTARY_FEE_PCT = 8;
const MIN_NOTARY_FEE_PCT = 0;
const MAX_NOTARY_FEE_PCT = 100;

@Injectable({ providedIn: "root" })
export class AppSettingsService {
  private readonly api = inject(ApiClientService);

  readonly notaryFeePct = signal<number>(DEFAULT_NOTARY_FEE_PCT);
  readonly loaded = signal(false);

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<number> {
    try {
      const response = await this.api.request<AppSettingsResponse>("GET", "/me/settings");
      const normalized = this.normalizeNotaryFeePct(response.notaryFeePct);
      this.notaryFeePct.set(normalized);
      return normalized;
    } catch {
      return this.notaryFeePct();
    } finally {
      this.loaded.set(true);
    }
  }

  async updateNotaryFeePct(value: number): Promise<number> {
    const normalized = this.normalizeNotaryFeePct(value);
    const response = await this.api.request<AppSettingsResponse>("PATCH", "/me/settings", {
      body: { notaryFeePct: normalized },
    });
    const persisted = this.normalizeNotaryFeePct(response.notaryFeePct);
    this.notaryFeePct.set(persisted);
    return persisted;
  }

  private normalizeNotaryFeePct(value: number): number {
    if (!Number.isFinite(value)) {
      return DEFAULT_NOTARY_FEE_PCT;
    }

    const clamped = Math.min(Math.max(value, MIN_NOTARY_FEE_PCT), MAX_NOTARY_FEE_PCT);
    return Number(clamped.toFixed(2));
  }
}

export { DEFAULT_NOTARY_FEE_PCT };
