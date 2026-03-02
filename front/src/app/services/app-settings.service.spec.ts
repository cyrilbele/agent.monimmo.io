import { TestBed } from "@angular/core/testing";
import {
  AppSettingsService,
  DEFAULT_NOTARY_FEE_PCT,
} from "./app-settings.service";
import { ApiClientService } from "../core/api-client.service";

describe("AppSettingsService", () => {
  it("utilise 8% par defaut, charge le backend puis persiste les mises a jour", async () => {
    const calls: unknown[][] = [];
    const defaultFormat = "## Format par défaut";
    TestBed.configureTestingModule({
      providers: [
        AppSettingsService,
        {
          provide: ApiClientService,
          useValue: {
            request: (...args: unknown[]) => {
              calls.push(args);
              if (args[0] === "GET") {
                return Promise.resolve({
                  notaryFeePct: 7.4,
                  valuationAiOutputFormat: defaultFormat,
                });
              }
              if (args[0] === "PATCH") {
                return Promise.resolve({
                  notaryFeePct: 6.9,
                  valuationAiOutputFormat: defaultFormat,
                });
              }
              return Promise.resolve({});
            },
          },
        },
      ],
    });

    const service = TestBed.inject(AppSettingsService);
    expect(service.notaryFeePct()).toBe(DEFAULT_NOTARY_FEE_PCT);
    expect(service.valuationAiOutputFormat()).toBe("");
    await service.refresh();
    expect(service.notaryFeePct()).toBe(7.4);
    expect(service.valuationAiOutputFormat()).toBe(defaultFormat);

    await service.updateNotaryFeePct(6.9);
    expect(service.notaryFeePct()).toBe(6.9);
    expect(service.valuationAiOutputFormat()).toBe(defaultFormat);
    expect(calls).toEqual([
      ["GET", "/me/settings"],
      ["GET", "/me/settings"],
      ["PATCH", "/me/settings", { body: { notaryFeePct: 6.9 } }],
    ]);
  });

  it("normalise les valeurs invalides et hors bornes", async () => {
    TestBed.configureTestingModule({
      providers: [
        AppSettingsService,
        {
          provide: ApiClientService,
          useValue: {
            request: (_method: string, _path: string, options?: { body?: { notaryFeePct?: number } }) =>
              Promise.resolve({
                notaryFeePct: options?.body?.notaryFeePct ?? DEFAULT_NOTARY_FEE_PCT,
                valuationAiOutputFormat: "## Format",
              }),
          },
        },
      ],
    });
    const service = TestBed.inject(AppSettingsService);

    await service.updateNotaryFeePct(-12);
    expect(service.notaryFeePct()).toBe(0);

    await service.updateNotaryFeePct(150);
    expect(service.notaryFeePct()).toBe(100);
  });

  it("met a jour le format de sortie IA", async () => {
    const calls: unknown[][] = [];
    TestBed.configureTestingModule({
      providers: [
        AppSettingsService,
        {
          provide: ApiClientService,
          useValue: {
            request: (...args: unknown[]) => {
              calls.push(args);
              if (args[0] === "GET") {
                return Promise.resolve({
                  notaryFeePct: DEFAULT_NOTARY_FEE_PCT,
                  valuationAiOutputFormat: "## Format initial",
                });
              }

              return Promise.resolve({
                notaryFeePct: DEFAULT_NOTARY_FEE_PCT,
                valuationAiOutputFormat: "## Format personnalisé",
              });
            },
          },
        },
      ],
    });

    const service = TestBed.inject(AppSettingsService);
    await service.refresh();
    const persisted = await service.updateValuationAiOutputFormat("## Format personnalisé");
    expect(persisted).toBe("## Format personnalisé");
    expect(service.valuationAiOutputFormat()).toBe("## Format personnalisé");
    expect(calls).toContainEqual([
      "PATCH",
      "/me/settings",
      { body: { valuationAiOutputFormat: "## Format personnalisé" } },
    ]);
  });
});
