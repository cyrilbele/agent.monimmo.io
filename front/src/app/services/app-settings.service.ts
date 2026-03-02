import { inject, Injectable, signal } from "@angular/core";

import type { AppSettingsPatchRequest, AppSettingsResponse } from "../core/api.models";
import { ApiClientService } from "../core/api-client.service";

const DEFAULT_NOTARY_FEE_PCT = 8;
const MIN_NOTARY_FEE_PCT = 0;
const MAX_NOTARY_FEE_PCT = 100;

@Injectable({ providedIn: "root" })
export class AppSettingsService {
  private readonly api = inject(ApiClientService);

  readonly notaryFeePct = signal<number>(DEFAULT_NOTARY_FEE_PCT);
  readonly valuationAiOutputFormat = signal<string>("");
  readonly loaded = signal(false);

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<AppSettingsResponse> {
    try {
      const response = await this.api.request<AppSettingsResponse>("GET", "/me/settings");
      const normalized = this.normalizeResponse(response);
      this.applySettings(normalized);
      return normalized;
    } catch {
      return {
        notaryFeePct: this.notaryFeePct(),
        valuationAiOutputFormat: this.valuationAiOutputFormat(),
      };
    } finally {
      this.loaded.set(true);
    }
  }

  async updateSettings(input: AppSettingsPatchRequest): Promise<AppSettingsResponse> {
    const payload: AppSettingsPatchRequest = {};
    if (typeof input.notaryFeePct === "number") {
      payload.notaryFeePct = this.normalizeNotaryFeePct(input.notaryFeePct);
    }
    if (typeof input.valuationAiOutputFormat !== "undefined") {
      payload.valuationAiOutputFormat = this.normalizeValuationAiOutputFormatInput(
        input.valuationAiOutputFormat,
      );
    }

    const response = await this.api.request<AppSettingsResponse>("PATCH", "/me/settings", {
      body: payload,
    });
    const normalized = this.normalizeResponse(response);
    this.applySettings(normalized);
    return normalized;
  }

  async updateNotaryFeePct(value: number): Promise<number> {
    const response = await this.updateSettings({
      notaryFeePct: value,
    });
    return response.notaryFeePct;
  }

  async updateValuationAiOutputFormat(value: string | null): Promise<string> {
    const response = await this.updateSettings({
      valuationAiOutputFormat: value,
    });
    return response.valuationAiOutputFormat;
  }

  private normalizeNotaryFeePct(value: number): number {
    if (!Number.isFinite(value)) {
      return DEFAULT_NOTARY_FEE_PCT;
    }

    const clamped = Math.min(Math.max(value, MIN_NOTARY_FEE_PCT), MAX_NOTARY_FEE_PCT);
    return Number(clamped.toFixed(2));
  }

  private normalizeResponse(response: AppSettingsResponse): AppSettingsResponse {
    return {
      notaryFeePct: this.normalizeNotaryFeePct(response.notaryFeePct),
      valuationAiOutputFormat: this.normalizeValuationAiOutputFormatResponse(
        response.valuationAiOutputFormat,
      ),
    };
  }

  private applySettings(response: AppSettingsResponse): void {
    this.notaryFeePct.set(response.notaryFeePct);
    this.valuationAiOutputFormat.set(response.valuationAiOutputFormat);
  }

  private normalizeValuationAiOutputFormatResponse(value: unknown): string {
    if (typeof value !== "string") {
      return this.valuationAiOutputFormat();
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : this.valuationAiOutputFormat();
  }

  private normalizeValuationAiOutputFormatInput(
    value: string | null,
  ): string | null {
    if (value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
}

export { DEFAULT_NOTARY_FEE_PCT };
