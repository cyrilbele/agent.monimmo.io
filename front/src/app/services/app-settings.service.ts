import { inject, Injectable, signal } from "@angular/core";

import type {
  AiProvider,
  AppSettingsPatchRequest,
  AppSettingsResponse,
} from "../core/api.models";
import { ApiClientService } from "../core/api-client.service";

const DEFAULT_NOTARY_FEE_PCT = 8;
const DEFAULT_AI_PROVIDER: AiProvider = "openai";
const MIN_NOTARY_FEE_PCT = 0;
const MAX_NOTARY_FEE_PCT = 100;
const DEFAULT_ASSISTANT_SOUL =
  "Tu es Monimmo, un assistant immobilier pragmatique, clair et orienté action pour les agents français.";

@Injectable({ providedIn: "root" })
export class AppSettingsService {
  private readonly api = inject(ApiClientService);

  readonly notaryFeePct = signal<number>(DEFAULT_NOTARY_FEE_PCT);
  readonly aiProvider = signal<AiProvider>(DEFAULT_AI_PROVIDER);
  readonly valuationAiOutputFormat = signal<string>("");
  readonly assistantSoul = signal<string>(DEFAULT_ASSISTANT_SOUL);
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
        aiProvider: this.aiProvider(),
        valuationAiOutputFormat: this.valuationAiOutputFormat(),
        assistantSoul: this.assistantSoul(),
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
    if (typeof input.aiProvider === "string") {
      payload.aiProvider = this.normalizeAiProvider(input.aiProvider);
    }
    if (typeof input.valuationAiOutputFormat !== "undefined") {
      payload.valuationAiOutputFormat = this.normalizeValuationAiOutputFormatInput(
        input.valuationAiOutputFormat,
      );
    }
    if (typeof input.assistantSoul !== "undefined") {
      payload.assistantSoul = this.normalizeAssistantSoulInput(input.assistantSoul);
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
      aiProvider: this.normalizeAiProvider(response.aiProvider),
      valuationAiOutputFormat: this.normalizeValuationAiOutputFormatResponse(
        response.valuationAiOutputFormat,
      ),
      assistantSoul: this.normalizeAssistantSoulResponse(response.assistantSoul),
    };
  }

  private applySettings(response: AppSettingsResponse): void {
    this.notaryFeePct.set(response.notaryFeePct);
    this.aiProvider.set(response.aiProvider);
    this.valuationAiOutputFormat.set(response.valuationAiOutputFormat);
    this.assistantSoul.set(response.assistantSoul);
  }

  private normalizeAiProvider(value: unknown): AiProvider {
    if (value === "anthropic") {
      return "anthropic";
    }

    return DEFAULT_AI_PROVIDER;
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

  private normalizeAssistantSoulResponse(value: unknown): string {
    if (typeof value !== "string") {
      return this.assistantSoul();
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : this.assistantSoul();
  }

  private normalizeAssistantSoulInput(value: string | null): string | null {
    if (value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
}

export { DEFAULT_NOTARY_FEE_PCT };
