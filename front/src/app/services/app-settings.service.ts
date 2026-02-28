import { Injectable, signal } from "@angular/core";

const NOTARY_FEE_PCT_STORAGE_KEY = "monimmo.settings.notaryFeePct";
const DEFAULT_NOTARY_FEE_PCT = 8;
const MIN_NOTARY_FEE_PCT = 0;
const MAX_NOTARY_FEE_PCT = 100;

@Injectable({ providedIn: "root" })
export class AppSettingsService {
  readonly notaryFeePct = signal<number>(this.readNotaryFeePct());

  updateNotaryFeePct(value: number): number {
    const normalized = this.normalizeNotaryFeePct(value);
    this.notaryFeePct.set(normalized);
    this.persistNotaryFeePct(normalized);
    return normalized;
  }

  private readNotaryFeePct(): number {
    if (typeof localStorage === "undefined") {
      return DEFAULT_NOTARY_FEE_PCT;
    }

    const raw = localStorage.getItem(NOTARY_FEE_PCT_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_NOTARY_FEE_PCT;
    }

    const parsed = Number(raw);
    return this.normalizeNotaryFeePct(parsed);
  }

  private persistNotaryFeePct(value: number): void {
    if (typeof localStorage === "undefined") {
      return;
    }

    localStorage.setItem(NOTARY_FEE_PCT_STORAGE_KEY, String(value));
  }

  private normalizeNotaryFeePct(value: number): number {
    if (!Number.isFinite(value)) {
      return DEFAULT_NOTARY_FEE_PCT;
    }

    const clamped = Math.min(Math.max(value, MIN_NOTARY_FEE_PCT), MAX_NOTARY_FEE_PCT);
    return Number(clamped.toFixed(2));
  }
}

export { DEFAULT_NOTARY_FEE_PCT, NOTARY_FEE_PCT_STORAGE_KEY };
