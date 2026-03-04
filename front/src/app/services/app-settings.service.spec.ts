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
                  aiProvider: "openai",
                  valuationAiOutputFormat: defaultFormat,
                  assistantSoul: "Soul test",
                });
              }
              if (args[0] === "PATCH") {
                return Promise.resolve({
                  notaryFeePct: 6.9,
                  aiProvider: "openai",
                  valuationAiOutputFormat: defaultFormat,
                  assistantSoul: "Soul test",
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
    expect(service.aiProvider()).toBe("openai");
    expect(service.valuationAiOutputFormat()).toBe("");
    expect(service.assistantSoul().length).toBeGreaterThan(0);
    await service.refresh();
    expect(service.notaryFeePct()).toBe(7.4);
    expect(service.aiProvider()).toBe("openai");
    expect(service.valuationAiOutputFormat()).toBe(defaultFormat);
    expect(service.assistantSoul()).toBe("Soul test");

    await service.updateNotaryFeePct(6.9);
    expect(service.notaryFeePct()).toBe(6.9);
    expect(service.aiProvider()).toBe("openai");
    expect(service.valuationAiOutputFormat()).toBe(defaultFormat);
    expect(service.assistantSoul()).toBe("Soul test");
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
                aiProvider: "openai",
                valuationAiOutputFormat: "## Format",
                assistantSoul: "Soul test",
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
                  aiProvider: "openai",
                  valuationAiOutputFormat: "## Format initial",
                  assistantSoul: "Soul test",
                });
              }

              return Promise.resolve({
                notaryFeePct: DEFAULT_NOTARY_FEE_PCT,
                aiProvider: "openai",
                valuationAiOutputFormat: "## Format personnalisé",
                assistantSoul: "Soul test",
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

  it("met a jour le provider IA", async () => {
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
                  aiProvider: "openai",
                  valuationAiOutputFormat: "## Format initial",
                  assistantSoul: "Soul test",
                });
              }

              return Promise.resolve({
                notaryFeePct: DEFAULT_NOTARY_FEE_PCT,
                aiProvider: "anthropic",
                valuationAiOutputFormat: "## Format initial",
                assistantSoul: "Soul test",
              });
            },
          },
        },
      ],
    });

    const service = TestBed.inject(AppSettingsService);
    await service.refresh();
    await service.updateSettings({ aiProvider: "anthropic" });

    expect(service.aiProvider()).toBe("anthropic");
    expect(calls).toContainEqual([
      "PATCH",
      "/me/settings",
      { body: { aiProvider: "anthropic" } },
    ]);
  });
});
