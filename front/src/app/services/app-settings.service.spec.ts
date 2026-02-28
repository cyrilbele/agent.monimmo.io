import { TestBed } from "@angular/core/testing";
import {
  AppSettingsService,
  DEFAULT_NOTARY_FEE_PCT,
  NOTARY_FEE_PCT_STORAGE_KEY,
} from "./app-settings.service";

describe("AppSettingsService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("utilise 8% par defaut et persiste les mises a jour", () => {
    TestBed.configureTestingModule({
      providers: [AppSettingsService],
    });

    const service = TestBed.inject(AppSettingsService);
    expect(service.notaryFeePct()).toBe(DEFAULT_NOTARY_FEE_PCT);

    service.updateNotaryFeePct(7.4);
    expect(service.notaryFeePct()).toBe(7.4);
    expect(localStorage.getItem(NOTARY_FEE_PCT_STORAGE_KEY)).toBe("7.4");
  });

  it("normalise les valeurs invalides et hors bornes", () => {
    localStorage.setItem(NOTARY_FEE_PCT_STORAGE_KEY, "invalid");

    TestBed.configureTestingModule({
      providers: [AppSettingsService],
    });
    const service = TestBed.inject(AppSettingsService);
    expect(service.notaryFeePct()).toBe(DEFAULT_NOTARY_FEE_PCT);

    service.updateNotaryFeePct(-12);
    expect(service.notaryFeePct()).toBe(0);

    service.updateNotaryFeePct(150);
    expect(service.notaryFeePct()).toBe(100);
  });
});
