import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap } from "@angular/router";
import type {
  AccountUserListResponse,
  FileListResponse,
  MessageListResponse,
  PropertyComparablesResponse,
  PropertyProspectListResponse,
  PropertyResponse,
  PropertyRiskResponse,
  PropertyValuationAIResponse,
  PropertyVisitListResponse,
} from "../../core/api.models";
import { FileService } from "../../services/file.service";
import {
  InseeCityService,
  type InseeCityIndicators,
} from "../../services/insee-city.service";
import { MessageService } from "../../services/message.service";
import { PropertyService } from "../../services/property.service";
import { UserService } from "../../services/user.service";
import { VocalService } from "../../services/vocal.service";
import { PropertyDetailPageComponent } from "./property-detail-page.component";

describe("PropertyDetailPageComponent comparables", () => {
  it("charge les comparables au changement d'onglet valorisation", async () => {
    const propertyResponse: PropertyResponse = {
      id: "property_1",
      title: "Appartement Bastille",
      city: "Paris",
      postalCode: "75011",
      address: "12 rue Oberkampf",
      price: 320000,
      details: {
        general: {
          propertyType: "MAISON",
        },
        characteristics: {
          livingArea: 70,
          landArea: 130,
        },
        finance: {
          propertyTax: 1200,
        },
        copropriete: {
          monthlyCharges: 200,
        },
      },
      status: "PROSPECTION",
      orgId: "org_demo",
      createdAt: "2026-02-01T10:00:00.000Z",
      updatedAt: "2026-02-01T10:00:00.000Z",
    };

    const risksResponse: PropertyRiskResponse = {
      propertyId: "property_1",
      status: "NO_DATA",
      source: "GEORISQUES",
      georisquesUrl: "https://www.georisques.gouv.fr",
      reportPdfUrl: null,
      generatedAt: "2026-02-01T10:00:00.000Z",
      message: null,
      location: {
        address: "12 rue Oberkampf",
        postalCode: "75011",
        city: "Paris",
        inseeCode: "75111",
        latitude: 48.8566,
        longitude: 2.3522,
      },
      items: [],
    };

    const comparablesResponse: PropertyComparablesResponse = {
      propertyId: "property_1",
      propertyType: "MAISON",
      source: "LIVE",
      windowYears: 10,
      search: {
        center: { latitude: 48.8566, longitude: 2.3522 },
        finalRadiusM: 3000,
        radiiTried: [1000, 2000, 3000],
        targetCount: 100,
        targetReached: false,
      },
      summary: {
        count: 2,
        medianPrice: 310000,
        medianPricePerM2: 5200,
        minPrice: 295000,
        maxPrice: 325000,
      },
      subject: {
        surfaceM2: 70,
        askingPrice: 320000,
        affinePriceAtSubjectSurface: null,
        predictedPrice: 315000,
        deviationPct: 1.6,
        pricingPosition: "NORMAL",
      },
      regression: {
        slope: 3500,
        intercept: 70000,
        r2: 0.72,
        pointsUsed: 2,
      },
      points: [
        {
          saleDate: "2024-05-10T00:00:00.000Z",
          surfaceM2: 68,
          landSurfaceM2: 120,
          salePrice: 295000,
          pricePerM2: 4338,
          distanceM: 420,
          city: "Paris",
          postalCode: "75011",
        },
        {
          saleDate: "2024-09-10T00:00:00.000Z",
          surfaceM2: 72,
          landSurfaceM2: 140,
          salePrice: 325000,
          pricePerM2: 4513,
          distanceM: 560,
          city: "Paris",
          postalCode: "75011",
        },
      ],
    };

    const getComparablesCalls: Array<{ propertyId: string; options?: unknown }> = [];
    const patchCalls: Array<{ propertyId: string; payload: unknown }> = [];
    let currentPropertyResponse: PropertyResponse = propertyResponse;

    const propertyServiceMock: Partial<PropertyService> = {
      getById: () => Promise.resolve(currentPropertyResponse),
      listProspects: () => Promise.resolve({ items: [] } as PropertyProspectListResponse),
      listVisits: () => Promise.resolve({ items: [] } as PropertyVisitListResponse),
      getRisks: () => Promise.resolve(risksResponse),
      getComparables: (propertyId: string, options?: unknown) => {
        getComparablesCalls.push({ propertyId, options });
        return Promise.resolve(comparablesResponse);
      },
      patch: (propertyId, payload) => {
        patchCalls.push({ propertyId, payload });
        const patchPayload = payload as { details?: Record<string, unknown> };
        currentPropertyResponse = {
          ...currentPropertyResponse,
          details: patchPayload.details
            ? {
                ...(currentPropertyResponse.details as Record<string, unknown>),
                ...patchPayload.details,
              }
            : currentPropertyResponse.details,
        };
        return Promise.resolve(currentPropertyResponse);
      },
    };

    const messageServiceMock: Partial<MessageService> = {
      listByProperty: () => Promise.resolve({ items: [] } as MessageListResponse),
    };

    const fileServiceMock: Partial<FileService> = {
      listByProperty: () => Promise.resolve({ items: [] } as FileListResponse),
    };

    const userServiceMock: Partial<UserService> = {
      list: () => Promise.resolve({ items: [] } as AccountUserListResponse),
    };
    const inseeCityIndicators: InseeCityIndicators = {
      inseeCode: "75111",
      city: "Paris",
      postalCode: "75011",
      populationCurrent: 0,
      populationCurrentYear: null,
      populationGrowthPct: null,
      populationGrowthAbs: null,
      populationStartYear: null,
      populationEndYear: null,
      populationDensityPerKm2: null,
      medianIncome: null,
      medianIncomeYear: null,
      ownersRatePct: null,
      ownersRateYear: null,
      ownersRateScope: null,
      unemploymentRatePct: null,
      unemploymentYear: null,
      averageAge: null,
      averageAgeYear: null,
      povertyRatePct: null,
      giniIndex: null,
    };
    const inseeCityServiceMock: Partial<InseeCityService> = {
      getCityIndicators: () => Promise.resolve(inseeCityIndicators),
    };

    TestBed.configureTestingModule({
      imports: [PropertyDetailPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: "property_1" }),
            },
          },
        },
        { provide: PropertyService, useValue: propertyServiceMock },
        { provide: MessageService, useValue: messageServiceMock },
        { provide: FileService, useValue: fileServiceMock },
        { provide: UserService, useValue: userServiceMock },
        { provide: InseeCityService, useValue: inseeCityServiceMock },
        { provide: VocalService, useValue: {} },
      ],
    });

    const fixture = TestBed.createComponent(PropertyDetailPageComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getComparablesCalls.length).toBe(0);

    component.setMainTab("valuation");
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getComparablesCalls.length).toBe(1);
    expect(getComparablesCalls[0]?.propertyId).toBe("property_1");
    expect(
      (getComparablesCalls[0]?.options as { forceRefresh?: boolean } | undefined)?.forceRefresh,
    ).toBe(true);
    expect(component.comparables()?.summary.count).toBe(2);
    expect(component.comparablesFrontRegression().pointsUsed).toBe(2);
    expect(component.paginatedComparableSales().length).toBe(2);
    expect(component.paginatedComparableSales()[0]?.saleDate).toBe("2024-09-10T00:00:00.000Z");

    expect(component.comparables()?.propertyType).toBe("MAISON");
    const hostElement = fixture.nativeElement as HTMLElement;
    const rangeMarkers = Array.from(hostElement.querySelectorAll(".range-marker")) as HTMLElement[];
    expect(rangeMarkers.length).toBe(2);
    expect(rangeMarkers.every((marker) => !marker.classList.contains("range-marker--hidden"))).toBe(
      true,
    );
    const markerStyle = getComputedStyle(rangeMarkers[0] as Element);
    expect(markerStyle.position).toBe("absolute");
    expect(markerStyle.borderTopStyle).toBe("solid");

    const dualRangeInputs = Array.from(
      hostElement.querySelectorAll(".dual-range__input"),
    ) as HTMLElement[];
    expect(dualRangeInputs.length).toBe(4);
    expect(getComputedStyle(dualRangeInputs[0] as Element).position).toBe("absolute");
    const coproCategory = component.propertyCategories.find((category) => category.id === "copropriete");
    expect(coproCategory?.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining([
        "sharedPool",
        "sharedTennis",
        "sharedMiniGolf",
        "privateSeaAccess",
        "guardedResidence",
        "fencedResidence",
      ]),
    );
    const amenitiesCategory = component.propertyCategories.find((category) => category.id === "amenities");
    const gardenField = amenitiesCategory?.fields.find((field) => field.key === "garden");
    expect(gardenField?.options?.map((option) => option.value)).toEqual([
      "NON",
      "OUI_NU",
      "OUI_ARBORE",
      "OUI_PAYSAGE",
    ]);
    const poolField = amenitiesCategory?.fields.find((field) => field.key === "pool");
    expect(poolField?.options?.map((option) => option.value)).toEqual(["NON", "PISCINABLE", "OUI"]);
    const fencedField = amenitiesCategory?.fields.find((field) => field.key === "fenced");
    expect(fencedField).toBeDefined();
    if (!fencedField) {
      throw new Error("Champ fenced introuvable");
    }
    expect(component.shouldDisplayPropertyField("amenities", fencedField)).toBe(true);
    component.property.set({
      ...(component.property() as PropertyResponse),
      details: {
        ...((component.property()?.details as Record<string, unknown>) ?? {}),
        general: {
          ...(((component.property()?.details as Record<string, unknown>)?.["general"] as Record<
            string,
            unknown
          >) ?? {}),
          propertyType: "APPARTEMENT",
        },
      },
    });
    expect(component.shouldDisplayPropertyField("amenities", fencedField)).toBe(false);

    component.onRentalMonthlyRentChange("1500");
    component.onRentalHoldingYearsChange("10");
    component.onRentalResalePriceChange("380000");
    await fixture.whenStable();
    fixture.detectChanges();

    const rental = component.rentalProfitability();
    expect(rental.notaryFeePct).toBe(8);
    expect(rental.initialInvestment).toBe(345600);
    expect(rental.annualNetCashflow).toBe(14400);
    expect(rental.irrPct === null || rental.irrPct > 0).toBe(true);
    expect(patchCalls.length).toBe(3);
    const financeDetails = ((component.property()?.details as Record<string, unknown>)["finance"] ??
      {}) as Record<string, unknown>;
    expect(financeDetails["propertyTax"]).toBe(1200);
    expect(financeDetails["monthlyRent"]).toBe(1500);
    expect(financeDetails["rentalHoldingYears"]).toBe(10);
    expect(financeDetails["rentalResalePrice"]).toBe(380000);
  });

  it("permet de mettre a jour le prix de vente et de relancer l'analyse IA", async () => {
    const propertyResponse: PropertyResponse = {
      id: "property_valuation_ai",
      title: "Maison Cagnes-sur-Mer",
      city: "Cagnes-sur-Mer",
      postalCode: "06800",
      address: "22 avenue des Oliviers",
      price: 620000,
      details: {
        general: {
          propertyType: "MAISON",
        },
        characteristics: {
          livingArea: 120,
          rooms: 5,
          standing: "HAUT_DE_GAMME",
          condition: "RENOVE",
          hasCracks: "true",
          foundationUnderpinningDone: "false",
        },
        amenities: {
          pool: "true",
        },
        regulation: {
          dpeClass: "C",
        },
      },
      status: "PROSPECTION",
      orgId: "org_demo",
      createdAt: "2026-02-01T10:00:00.000Z",
      updatedAt: "2026-02-01T10:00:00.000Z",
    };

    const comparablesResponse: PropertyComparablesResponse = {
      propertyId: "property_valuation_ai",
      propertyType: "MAISON",
      source: "LIVE",
      windowYears: 10,
      search: {
        center: { latitude: 43.66, longitude: 7.15 },
        finalRadiusM: 3000,
        radiiTried: [1000, 2000, 3000],
        targetCount: 100,
        targetReached: false,
      },
      summary: {
        count: 3,
        medianPrice: 615000,
        medianPricePerM2: 5100,
        minPrice: 560000,
        maxPrice: 690000,
      },
      subject: {
        surfaceM2: 120,
        askingPrice: 620000,
        affinePriceAtSubjectSurface: null,
        predictedPrice: 610000,
        deviationPct: 1.6,
        pricingPosition: "NORMAL",
      },
      regression: {
        slope: 4200,
        intercept: 82000,
        r2: 0.68,
        pointsUsed: 3,
      },
      points: [
        {
          saleDate: "2025-02-10T00:00:00.000Z",
          surfaceM2: 118,
          landSurfaceM2: 700,
          salePrice: 605000,
          pricePerM2: 5127,
          distanceM: 1200,
          city: "Cagnes-sur-Mer",
          postalCode: "06800",
        },
        {
          saleDate: "2024-11-10T00:00:00.000Z",
          surfaceM2: 125,
          landSurfaceM2: 760,
          salePrice: 635000,
          pricePerM2: 5080,
          distanceM: 1800,
          city: "Cagnes-sur-Mer",
          postalCode: "06800",
        },
        {
          saleDate: "2024-07-10T00:00:00.000Z",
          surfaceM2: 130,
          landSurfaceM2: 820,
          salePrice: 690000,
          pricePerM2: 5307,
          distanceM: 2600,
          city: "Cagnes-sur-Mer",
          postalCode: "06800",
        },
      ],
    };

    const runValuationResponse: PropertyValuationAIResponse = {
      propertyId: "property_valuation_ai",
      aiCalculatedValuation: 645000,
      valuationJustification:
        "## Synthèse valorisation\n\n- DPE C\n- Bon standing\n- Comparables récents proches de 640 k€",
      promptUsed: "Prompt de valorisation IA",
      generatedAt: "2026-03-01T10:00:00.000Z",
      comparableCountUsed: 3,
      criteriaUsed: [
        { label: "DPE (classe énergie)", value: "C" },
        { label: "Standing", value: "Haut de gamme" },
      ],
    };

    const patchCalls: Array<{ propertyId: string; payload: unknown }> = [];
    const valuationCalls: Array<{ propertyId: string; payload: unknown }> = [];
    const promptCalls: Array<{ propertyId: string; payload: unknown }> = [];
    let currentPropertyResponse: PropertyResponse = propertyResponse;

    const propertyServiceMock: Partial<PropertyService> = {
      getById: () => Promise.resolve(propertyResponse),
      listProspects: () => Promise.resolve({ items: [] } as PropertyProspectListResponse),
      listVisits: () => Promise.resolve({ items: [] } as PropertyVisitListResponse),
      getRisks: () =>
        Promise.resolve({
          propertyId: "property_valuation_ai",
          status: "NO_DATA",
          source: "GEORISQUES",
          georisquesUrl: "https://www.georisques.gouv.fr",
          reportPdfUrl: null,
          generatedAt: "2026-02-01T10:00:00.000Z",
          message: null,
          location: {
            address: "22 avenue des Oliviers",
            postalCode: "06800",
            city: "Cagnes-sur-Mer",
            inseeCode: "06027",
            latitude: 43.66,
            longitude: 7.15,
          },
          items: [],
        } as PropertyRiskResponse),
      getComparables: () => Promise.resolve(comparablesResponse),
      patch: (propertyId, payload) => {
        patchCalls.push({ propertyId, payload });
        const patchPayload = payload as {
          price?: number;
          details?: Record<string, unknown>;
        };
        currentPropertyResponse = {
          ...currentPropertyResponse,
          price:
            typeof patchPayload.price === "number"
              ? patchPayload.price
              : currentPropertyResponse.price,
          details: patchPayload.details
            ? {
                ...(currentPropertyResponse.details as Record<string, unknown>),
                ...patchPayload.details,
              }
            : currentPropertyResponse.details,
        };
        return Promise.resolve({
          ...currentPropertyResponse,
        });
      },
      runValuationAnalysis: (propertyId, payload) => {
        valuationCalls.push({ propertyId, payload });
        return Promise.resolve(runValuationResponse);
      },
      generateValuationPrompt: (propertyId, payload) => {
        promptCalls.push({ propertyId, payload });
        return Promise.resolve({
          propertyId,
          promptUsed: "Prompt regénéré à la volée",
        });
      },
    };

    TestBed.configureTestingModule({
      imports: [PropertyDetailPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: "property_valuation_ai" }),
            },
          },
        },
        { provide: PropertyService, useValue: propertyServiceMock },
        { provide: MessageService, useValue: { listByProperty: () => Promise.resolve({ items: [] } as MessageListResponse) } },
        { provide: FileService, useValue: { listByProperty: () => Promise.resolve({ items: [] } as FileListResponse) } },
        { provide: UserService, useValue: { list: () => Promise.resolve({ items: [] } as AccountUserListResponse) } },
        { provide: InseeCityService, useValue: { getCityIndicators: () => Promise.resolve({}) } },
        { provide: VocalService, useValue: {} },
      ],
    });

    const fixture = TestBed.createComponent(PropertyDetailPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component.setMainTab("valuation");
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.valuationKeyCriteria().length).toBeGreaterThan(0);
    expect(component.valuationKeyCriteria().length).toBeLessThanOrEqual(5);
    expect(component.valuationKeyCriteria().some((criterion) => criterion.field.key === "dpeClass")).toBe(true);
    expect(component.valuationKeyCriteria().some((criterion) => criterion.field.key === "pool")).toBe(true);
    expect(component.valuationKeyCriteria().some((criterion) => criterion.field.key === "standing")).toBe(true);
    expect(component.valuationSalePriceInput()).toBe("620000");

    component.onValuationSalePriceInput("650000");
    await component.saveValuationSalePrice();
    expect(patchCalls[0]).toEqual({
      propertyId: "property_valuation_ai",
      payload: { price: 650000 },
    });
    expect(component.property()?.price).toBe(650000);
    expect(component.comparables()?.subject.askingPrice).toBe(650000);
    expect(component.valuationSalePriceFeedback()).toBe("Prix de vente mis à jour.");

    component.onValuationAgentJustificationInput(
      "## Avis agent\n\n- Prix cohérent avec les ventes proches.\n- Ajustement limité au regard du vis-à-vis.",
    );
    await component.saveValuationAgentOpinion();
    expect(patchCalls.length).toBe(2);
    expect(patchCalls[1]?.propertyId).toBe("property_valuation_ai");
    expect(patchCalls[1]?.payload).toEqual(
      expect.objectContaining({
        price: 650000,
        details: expect.objectContaining({
          valuationAgent: expect.objectContaining({
            proposedSalePrice: 650000,
            justification:
              "## Avis agent\n\n- Prix cohérent avec les ventes proches.\n- Ajustement limité au regard du vis-à-vis.",
          }),
        }),
      }),
    );
    expect(component.valuationAgentOpinionFeedback()).toBe("Avis agent enregistré.");

    await component.rerunValuationAnalysis();
    expect(valuationCalls.length).toBe(1);
    expect(valuationCalls[0]?.propertyId).toBe("property_valuation_ai");
    expect(
      (
        valuationCalls[0]?.payload as {
          comparableFilters?: { propertyType?: string };
          agentAdjustedPrice?: number | null;
        }
      )?.comparableFilters?.propertyType,
    ).toBe("MAISON");
    expect(
      (
        valuationCalls[0]?.payload as {
          comparableFilters?: { propertyType?: string };
          agentAdjustedPrice?: number | null;
        }
      )?.agentAdjustedPrice,
    ).toBe(650000);

    expect(component.valuationAiSnapshot()?.aiCalculatedValuation).toBe(645000);
    expect(component.valuationAiSnapshot()?.valuationJustification).toContain("DPE C");
    expect(component.valuationAiJustificationHtml()).toContain("<h2");
    expect(component.valuationAiJustificationHtml()).toContain("<li>DPE C</li>");
    expect(component.valuationAiFeedback()).toBe("Analyse IA mise à jour.");
    expect(
      (
        (component.property()?.details as Record<string, unknown>)?.[
          "valuationAiSnapshot"
        ] as Record<string, unknown>
      )?.["promptUsed"],
    ).toBeUndefined();

    await component.toggleValuationPromptVisibility();
    expect(component.valuationAiPromptVisible()).toBe(true);
    expect(component.valuationAiPromptText()).toBe("Prompt regénéré à la volée");
    expect(promptCalls.length).toBe(1);
    expect(promptCalls[0]?.propertyId).toBe("property_valuation_ai");
    expect(
      (
        promptCalls[0]?.payload as {
          comparableFilters?: { propertyType?: string };
          agentAdjustedPrice?: number | null;
        }
      )?.comparableFilters?.propertyType,
    ).toBe("MAISON");
  });

  it("affiche le champ fosse aux normes uniquement pour fosse septique et nettoie la valeur sinon", async () => {
    const propertyResponse: PropertyResponse = {
      id: "property_sanitation",
      title: "Maison assainissement",
      city: "Cagnes-sur-Mer",
      postalCode: "06800",
      address: "5 avenue des Oliviers",
      price: 590000,
      details: {
        general: {
          propertyType: "MAISON",
        },
        characteristics: {
          livingArea: 110,
          sanitationType: "TOUT_A_L_EGOUT",
          septicTankCompliant: "true",
        },
      },
      status: "PROSPECTION",
      orgId: "org_demo",
      createdAt: "2026-02-01T10:00:00.000Z",
      updatedAt: "2026-02-01T10:00:00.000Z",
    };

    const patchCalls: Array<{ propertyId: string; payload: unknown }> = [];
    let currentPropertyResponse: PropertyResponse = propertyResponse;

    const propertyServiceMock: Partial<PropertyService> = {
      getById: () => Promise.resolve(currentPropertyResponse),
      listProspects: () => Promise.resolve({ items: [] } as PropertyProspectListResponse),
      listVisits: () => Promise.resolve({ items: [] } as PropertyVisitListResponse),
      getRisks: () =>
        Promise.resolve({
          propertyId: "property_sanitation",
          status: "NO_DATA",
          source: "GEORISQUES",
          georisquesUrl: "https://www.georisques.gouv.fr",
          reportPdfUrl: null,
          generatedAt: "2026-02-01T10:00:00.000Z",
          message: null,
          location: {
            address: "5 avenue des Oliviers",
            postalCode: "06800",
            city: "Cagnes-sur-Mer",
            inseeCode: "06027",
            latitude: 43.66,
            longitude: 7.15,
          },
          items: [],
        } as PropertyRiskResponse),
      patch: (propertyId, payload) => {
        patchCalls.push({ propertyId, payload });
        const patchPayload = payload as { details?: Record<string, unknown> };
        currentPropertyResponse = {
          ...currentPropertyResponse,
          details: patchPayload.details
            ? {
                ...(currentPropertyResponse.details as Record<string, unknown>),
                ...patchPayload.details,
              }
            : currentPropertyResponse.details,
        };
        return Promise.resolve({
          ...currentPropertyResponse,
        });
      },
    };

    TestBed.configureTestingModule({
      imports: [PropertyDetailPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: "property_sanitation" }),
            },
          },
        },
        { provide: PropertyService, useValue: propertyServiceMock },
        {
          provide: MessageService,
          useValue: { listByProperty: () => Promise.resolve({ items: [] } as MessageListResponse) },
        },
        {
          provide: FileService,
          useValue: { listByProperty: () => Promise.resolve({ items: [] } as FileListResponse) },
        },
        {
          provide: UserService,
          useValue: { list: () => Promise.resolve({ items: [] } as AccountUserListResponse) },
        },
        { provide: InseeCityService, useValue: { getCityIndicators: () => Promise.resolve({}) } },
        { provide: VocalService, useValue: {} },
      ],
    });

    const fixture = TestBed.createComponent(PropertyDetailPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    await component.loadPropertyBundle();
    fixture.detectChanges();
    expect(component.error()).toBeNull();

    component.setActivePropertyCategory("characteristics");
    fixture.detectChanges();

    const category = component.activePropertyCategoryDefinition();
    const septicField = category.fields.find((field) => field.key === "septicTankCompliant");
    expect(septicField).toBeDefined();
    if (!septicField) {
      throw new Error("Champ septicTankCompliant introuvable");
    }

    expect(component.shouldDisplayPropertyField("characteristics", septicField)).toBe(false);

    component.startEditingActiveCategory();
    fixture.detectChanges();

    const firstForm = component.categoryForms()["characteristics"] ?? null;
    expect(Object.keys(component.categoryForms())).toContain("characteristics");
    expect(firstForm).not.toBeNull();
    if (!firstForm) {
      throw new Error("Formulaire caractéristiques introuvable");
    }
    firstForm.controls["sanitationType"].setValue("FOSSE_SEPTIQUE");
    firstForm.controls["septicTankCompliant"].setValue("true");
    expect(component.shouldDisplayPropertyField("characteristics", septicField)).toBe(true);

    await component.saveActivePropertyCategory();
    expect(patchCalls.length).toBe(1);
    expect(patchCalls[0]?.propertyId).toBe("property_sanitation");
    expect(
      (
        patchCalls[0]?.payload as {
          details?: { characteristics?: Record<string, unknown> };
        }
      )?.details?.characteristics?.["sanitationType"],
    ).toBe("FOSSE_SEPTIQUE");
    expect(
      (
        patchCalls[0]?.payload as {
          details?: { characteristics?: Record<string, unknown> };
        }
      )?.details?.characteristics?.["septicTankCompliant"],
    ).toBe("true");

    component.startEditingActiveCategory();
    fixture.detectChanges();

    const secondForm = component.categoryForms()["characteristics"] ?? null;
    expect(secondForm).not.toBeNull();
    if (!secondForm) {
      throw new Error("Formulaire caractéristiques introuvable");
    }
    secondForm.controls["sanitationType"].setValue("TOUT_A_L_EGOUT");
    secondForm.controls["septicTankCompliant"].setValue("true");
    expect(component.shouldDisplayPropertyField("characteristics", septicField)).toBe(false);

    await component.saveActivePropertyCategory();
    expect(patchCalls.length).toBe(2);
    expect(
      (
        patchCalls[1]?.payload as {
          details?: { characteristics?: Record<string, unknown> };
        }
      )?.details?.characteristics?.["sanitationType"],
    ).toBe("TOUT_A_L_EGOUT");
    expect(
      (
        patchCalls[1]?.payload as {
          details?: { characteristics?: Record<string, unknown> };
        }
      )?.details?.characteristics?.["septicTankCompliant"],
    ).toBeNull();

    const updatedCharacteristics =
      (((component.property()?.details as Record<string, unknown>)["characteristics"] ??
        {}) as Record<string, unknown>);
    expect(updatedCharacteristics["septicTankCompliant"]).toBeNull();
  });

  it("restaure et persiste les filtres comparables surface et terrain", async () => {
    const propertyResponse: PropertyResponse = {
      id: "property_filters",
      title: "Maison filtres",
      city: "Cagnes-sur-Mer",
      postalCode: "06800",
      address: "10 avenue des Pins",
      price: 610000,
      details: {
        general: {
          propertyType: "MAISON",
        },
        characteristics: {
          livingArea: 122,
          landArea: 760,
        },
        valuationComparableFilters: {
          surfaceMinM2: 119,
          surfaceMaxM2: 126,
          landSurfaceMinM2: 710,
          landSurfaceMaxM2: 780,
        },
      },
      status: "PROSPECTION",
      orgId: "org_demo",
      createdAt: "2026-02-01T10:00:00.000Z",
      updatedAt: "2026-02-01T10:00:00.000Z",
    };

    const comparablesResponse: PropertyComparablesResponse = {
      propertyId: "property_filters",
      propertyType: "MAISON",
      source: "LIVE",
      windowYears: 10,
      search: {
        center: { latitude: 43.66, longitude: 7.15 },
        finalRadiusM: 3000,
        radiiTried: [1000, 2000, 3000],
        targetCount: 100,
        targetReached: false,
      },
      summary: {
        count: 3,
        medianPrice: 615000,
        medianPricePerM2: 5100,
        minPrice: 560000,
        maxPrice: 690000,
      },
      subject: {
        surfaceM2: 122,
        askingPrice: 610000,
        affinePriceAtSubjectSurface: null,
        predictedPrice: 608000,
        deviationPct: 0.3,
        pricingPosition: "NORMAL",
      },
      regression: {
        slope: 4200,
        intercept: 82000,
        r2: 0.68,
        pointsUsed: 3,
      },
      points: [
        {
          saleDate: "2025-02-10T00:00:00.000Z",
          surfaceM2: 118,
          landSurfaceM2: 700,
          salePrice: 605000,
          pricePerM2: 5127,
          distanceM: 1200,
          city: "Cagnes-sur-Mer",
          postalCode: "06800",
        },
        {
          saleDate: "2024-11-10T00:00:00.000Z",
          surfaceM2: 125,
          landSurfaceM2: 760,
          salePrice: 635000,
          pricePerM2: 5080,
          distanceM: 1800,
          city: "Cagnes-sur-Mer",
          postalCode: "06800",
        },
        {
          saleDate: "2024-07-10T00:00:00.000Z",
          surfaceM2: 130,
          landSurfaceM2: 820,
          salePrice: 690000,
          pricePerM2: 5307,
          distanceM: 2600,
          city: "Cagnes-sur-Mer",
          postalCode: "06800",
        },
      ],
    };

    const patchCalls: Array<{ propertyId: string; payload: unknown }> = [];
    let currentPropertyResponse: PropertyResponse = propertyResponse;

    const propertyServiceMock: Partial<PropertyService> = {
      getById: () => Promise.resolve(propertyResponse),
      listProspects: () => Promise.resolve({ items: [] } as PropertyProspectListResponse),
      listVisits: () => Promise.resolve({ items: [] } as PropertyVisitListResponse),
      getRisks: () =>
        Promise.resolve({
          propertyId: "property_filters",
          status: "NO_DATA",
          source: "GEORISQUES",
          georisquesUrl: "https://www.georisques.gouv.fr",
          reportPdfUrl: null,
          generatedAt: "2026-02-01T10:00:00.000Z",
          message: null,
          location: {
            address: "10 avenue des Pins",
            postalCode: "06800",
            city: "Cagnes-sur-Mer",
            inseeCode: "06027",
            latitude: 43.66,
            longitude: 7.15,
          },
          items: [],
        } as PropertyRiskResponse),
      getComparables: () => Promise.resolve(comparablesResponse),
      patch: (propertyId, payload) => {
        patchCalls.push({ propertyId, payload });
        const patchPayload = payload as { details?: Record<string, unknown> };
        currentPropertyResponse = {
          ...currentPropertyResponse,
          details: patchPayload.details
            ? {
                ...(currentPropertyResponse.details as Record<string, unknown>),
                ...patchPayload.details,
              }
            : currentPropertyResponse.details,
        };
        return Promise.resolve({
          ...currentPropertyResponse,
        });
      },
    };

    TestBed.configureTestingModule({
      imports: [PropertyDetailPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: "property_filters" }),
            },
          },
        },
        { provide: PropertyService, useValue: propertyServiceMock },
        { provide: MessageService, useValue: { listByProperty: () => Promise.resolve({ items: [] } as MessageListResponse) } },
        { provide: FileService, useValue: { listByProperty: () => Promise.resolve({ items: [] } as FileListResponse) } },
        { provide: UserService, useValue: { list: () => Promise.resolve({ items: [] } as AccountUserListResponse) } },
        { provide: InseeCityService, useValue: { getCityIndicators: () => Promise.resolve({}) } },
        { provide: VocalService, useValue: {} },
      ],
    });

    const fixture = TestBed.createComponent(PropertyDetailPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component.setMainTab("valuation");
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.comparableSurfaceMinM2()).toBe(119);
    expect(component.comparableSurfaceMaxM2()).toBe(126);
    expect(component.comparableTerrainMinM2()).toBe(710);
    expect(component.comparableTerrainMaxM2()).toBe(780);

    component.onComparableSurfaceMinChange("120");
    component.onComparableSurfaceMaxChange("124");
    component.onComparableTerrainMinChange("720");
    component.onComparableTerrainMaxChange("770");
    await new Promise((resolve) => setTimeout(resolve, 250));
    await fixture.whenStable();

    expect(patchCalls.length).toBe(1);
    expect(patchCalls[0]).toEqual({
      propertyId: "property_filters",
      payload: {
        details: {
          valuationComparableFilters: {
            surfaceMinM2: 120,
            surfaceMaxM2: 124,
            landSurfaceMinM2: 720,
            landSurfaceMaxM2: 770,
          },
        },
      },
    });
  });

  it("persiste l'année de dernière rénovation et les détails complémentaires agent", async () => {
    const propertyResponse: PropertyResponse = {
      id: "property_renovation",
      title: "Maison rénovation",
      city: "Mougins",
      postalCode: "06250",
      address: "14 chemin des Oliviers",
      price: 820000,
      details: {
        general: {
          propertyType: "MAISON",
        },
        characteristics: {
          livingArea: 145,
          landArea: 980,
          lastRenovationYear: 2011,
          agentAdditionalDetails: "Ancien commentaire",
        },
      },
      status: "PROSPECTION",
      orgId: "org_demo",
      createdAt: "2026-02-01T10:00:00.000Z",
      updatedAt: "2026-02-01T10:00:00.000Z",
    };

    const patchCalls: Array<{ propertyId: string; payload: unknown }> = [];
    let currentPropertyResponse: PropertyResponse = propertyResponse;
    const risksResponse: PropertyRiskResponse = {
      propertyId: "property_renovation",
      status: "NO_DATA",
      source: "GEORISQUES",
      georisquesUrl: "https://www.georisques.gouv.fr",
      reportPdfUrl: null,
      generatedAt: "2026-02-01T10:00:00.000Z",
      message: null,
      location: {
        address: "14 chemin des Oliviers",
        postalCode: "06250",
        city: "Mougins",
        inseeCode: null,
        latitude: null,
        longitude: null,
      },
      items: [],
    };

    const propertyServiceMock: Partial<PropertyService> = {
      getById: () => Promise.resolve(currentPropertyResponse),
      listProspects: () => Promise.resolve({ items: [] } as PropertyProspectListResponse),
      listVisits: () => Promise.resolve({ items: [] } as PropertyVisitListResponse),
      getRisks: () => Promise.resolve(risksResponse),
      getComparables: () => Promise.resolve(null as unknown as PropertyComparablesResponse),
      patch: (propertyId, payload) => {
        patchCalls.push({ propertyId, payload });
        const patchPayload = payload as { details?: Record<string, unknown> };
        currentPropertyResponse = {
          ...currentPropertyResponse,
          details: patchPayload.details
            ? {
                ...(currentPropertyResponse.details as Record<string, unknown>),
                ...patchPayload.details,
              }
            : currentPropertyResponse.details,
        };
        return Promise.resolve(currentPropertyResponse);
      },
    };

    TestBed.configureTestingModule({
      imports: [PropertyDetailPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: "property_renovation" }),
            },
          },
        },
        { provide: PropertyService, useValue: propertyServiceMock },
        {
          provide: MessageService,
          useValue: { listByProperty: () => Promise.resolve({ items: [] } as MessageListResponse) },
        },
        {
          provide: FileService,
          useValue: { listByProperty: () => Promise.resolve({ items: [] } as FileListResponse) },
        },
        {
          provide: UserService,
          useValue: { list: () => Promise.resolve({ items: [] } as AccountUserListResponse) },
        },
        { provide: InseeCityService, useValue: { getCityIndicators: () => Promise.resolve({}) } },
        { provide: VocalService, useValue: {} },
      ],
    });

    const fixture = TestBed.createComponent(PropertyDetailPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    await component.loadPropertyBundle();
    fixture.detectChanges();

    component.setActivePropertyCategory("characteristics");
    component.startEditingActiveCategory();
    fixture.detectChanges();

    const form = component.categoryForms()["characteristics"] ?? null;
    expect(form).not.toBeNull();
    if (!form) {
      throw new Error("Formulaire caractéristiques introuvable");
    }

    expect(form.controls["lastRenovationYear"]).toBeDefined();
    expect(form.controls["agentAdditionalDetails"]).toBeDefined();

    form.controls["lastRenovationYear"].setValue("2020");
    form.controls["agentAdditionalDetails"].setValue(
      "  Façade rénovée, cuisine refaite, isolation des combles.  ",
    );

    await component.saveActivePropertyCategory();

    expect(patchCalls.length).toBe(1);
    expect(patchCalls[0]?.propertyId).toBe("property_renovation");
    expect(
      (
        patchCalls[0]?.payload as {
          details?: { characteristics?: Record<string, unknown> };
        }
      )?.details?.characteristics?.["lastRenovationYear"],
    ).toBe(2020);
    expect(
      (
        patchCalls[0]?.payload as {
          details?: { characteristics?: Record<string, unknown> };
        }
      )?.details?.characteristics?.["agentAdditionalDetails"],
    ).toBe("Façade rénovée, cuisine refaite, isolation des combles.");
    expect(component.requestFeedback()).toBe("Informations mises à jour.");

    const updatedCharacteristics =
      (((component.property()?.details as Record<string, unknown>)["characteristics"] ??
        {}) as Record<string, unknown>);
    expect(updatedCharacteristics["lastRenovationYear"]).toBe(2020);
    expect(updatedCharacteristics["agentAdditionalDetails"]).toBe(
      "Façade rénovée, cuisine refaite, isolation des combles.",
    );
  });

  it("garde les comparables quand distanceM est null", async () => {
    const propertyResponse: PropertyResponse = {
      id: "property_2",
      title: "Maison Antibes",
      city: "Antibes",
      postalCode: "06600",
      address: "1 avenue de la mer",
      price: 980000,
      details: {
        general: {
          propertyType: "MAISON",
        },
        characteristics: {
          livingArea: 160,
          landArea: 1500,
        },
      },
      status: "PROSPECTION",
      orgId: "org_demo",
      createdAt: "2026-02-01T10:00:00.000Z",
      updatedAt: "2026-02-01T10:00:00.000Z",
    };

    const risksResponse: PropertyRiskResponse = {
      propertyId: "property_2",
      status: "NO_DATA",
      source: "GEORISQUES",
      georisquesUrl: "https://www.georisques.gouv.fr",
      reportPdfUrl: null,
      generatedAt: "2026-02-01T10:00:00.000Z",
      message: null,
      location: {
        address: "1 avenue de la mer",
        postalCode: "06600",
        city: "Antibes",
        inseeCode: "06004",
        latitude: 43.64,
        longitude: 7.04,
      },
      items: [],
    };

    const comparablesResponse: PropertyComparablesResponse = {
      propertyId: "property_2",
      propertyType: "MAISON",
      source: "CACHE",
      windowYears: 10,
      search: {
        center: { latitude: 43.64, longitude: 7.04 },
        finalRadiusM: 1000,
        radiiTried: [1000],
        targetCount: 100,
        targetReached: true,
      },
      summary: {
        count: 2,
        medianPrice: 709947,
        medianPricePerM2: 5438.65,
        minPrice: 619894,
        maxPrice: 800000,
      },
      subject: {
        surfaceM2: 160,
        askingPrice: 980000,
        affinePriceAtSubjectSurface: null,
        predictedPrice: 903427.12,
        deviationPct: 8.48,
        pricingPosition: "NORMAL",
      },
      regression: {
        slope: 5826.52,
        intercept: -28816.08,
        r2: 0.54,
        pointsUsed: 2,
      },
      points: [
        {
          saleDate: "2025-06-11T00:00:00.000Z",
          surfaceM2: 171,
          landSurfaceM2: null,
          salePrice: 800000,
          pricePerM2: 4678.36,
          distanceM: null,
          city: null,
          postalCode: null,
        },
        {
          saleDate: "2025-04-29T00:00:00.000Z",
          surfaceM2: 100,
          landSurfaceM2: 1344,
          salePrice: 619894,
          pricePerM2: 6198.94,
          distanceM: null,
          city: null,
          postalCode: null,
        },
      ],
    };

    const propertyServiceMock: Partial<PropertyService> = {
      getById: () => Promise.resolve(propertyResponse),
      listProspects: () => Promise.resolve({ items: [] } as PropertyProspectListResponse),
      listVisits: () => Promise.resolve({ items: [] } as PropertyVisitListResponse),
      getRisks: () => Promise.resolve(risksResponse),
      getComparables: () => Promise.resolve(comparablesResponse),
    };

    const messageServiceMock: Partial<MessageService> = {
      listByProperty: () => Promise.resolve({ items: [] } as MessageListResponse),
    };

    const fileServiceMock: Partial<FileService> = {
      listByProperty: () => Promise.resolve({ items: [] } as FileListResponse),
    };

    const userServiceMock: Partial<UserService> = {
      list: () => Promise.resolve({ items: [] } as AccountUserListResponse),
    };

    const inseeCityServiceMock: Partial<InseeCityService> = {
      getCityIndicators: () =>
        Promise.resolve({
          inseeCode: "06004",
          city: "Antibes",
          postalCode: "06600",
          populationCurrent: 0,
          populationCurrentYear: null,
          populationGrowthPct: null,
          populationGrowthAbs: null,
          populationStartYear: null,
          populationEndYear: null,
          populationDensityPerKm2: null,
          medianIncome: null,
          medianIncomeYear: null,
          ownersRatePct: null,
          ownersRateYear: null,
          ownersRateScope: null,
          unemploymentRatePct: null,
          unemploymentYear: null,
          averageAge: null,
          averageAgeYear: null,
          povertyRatePct: null,
          giniIndex: null,
        } as InseeCityIndicators),
    };

    TestBed.configureTestingModule({
      imports: [PropertyDetailPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: "property_2" }),
            },
          },
        },
        { provide: PropertyService, useValue: propertyServiceMock },
        { provide: MessageService, useValue: messageServiceMock },
        { provide: FileService, useValue: fileServiceMock },
        { provide: UserService, useValue: userServiceMock },
        { provide: InseeCityService, useValue: inseeCityServiceMock },
        { provide: VocalService, useValue: {} },
      ],
    });

    const fixture = TestBed.createComponent(PropertyDetailPageComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component.setMainTab("valuation");
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.comparablesRadiusDomain()?.max).toBe(1000);
    expect(component.filteredComparablePoints().length).toBe(1);
    expect(component.comparablesDisplayedSummary().count).toBe(1);
    expect(component.comparablesDisplayedSummary().medianPricePerM2).not.toBeNull();
    expect(component.paginatedComparableSales().length).toBe(1);
  });

  it("calcule la progression des types documentaires et persiste les documents attendus masques", async () => {
    let persistedHiddenExpectedDocumentKeys: string[] = [];
    const patchCalls: string[][] = [];
    const basePropertyResponse: PropertyResponse = {
      id: "property_docs",
      title: "Appartement Lyon",
      city: "Lyon",
      postalCode: "69001",
      address: "10 rue de la Republique",
      price: 410000,
      details: {},
      hiddenExpectedDocumentKeys: [],
      status: "MANDAT_SIGNE",
      orgId: "org_demo",
      createdAt: "2026-02-01T10:00:00.000Z",
      updatedAt: "2026-02-01T10:00:00.000Z",
    };

    const risksResponse: PropertyRiskResponse = {
      propertyId: "property_docs",
      status: "NO_DATA",
      source: "GEORISQUES",
      georisquesUrl: "https://www.georisques.gouv.fr",
      reportPdfUrl: null,
      generatedAt: "2026-02-01T10:00:00.000Z",
      message: null,
      location: {
        address: "10 rue de la Republique",
        postalCode: "69001",
        city: "Lyon",
        inseeCode: "69123",
        latitude: 45.764,
        longitude: 4.8357,
      },
      items: [],
    };

    const filesResponse: FileListResponse = {
      items: [
        {
          id: "file_1",
          propertyId: "property_docs",
          typeDocument: "MANDAT_VENTE_SIGNE",
          fileName: "mandat.pdf",
          mimeType: "application/pdf",
          size: 1024,
          status: "UPLOADED",
          storageKey: "files/mandat.pdf",
          createdAt: "2026-02-01T10:00:00.000Z",
        },
        {
          id: "file_2",
          propertyId: "property_docs",
          typeDocument: "OFFRE_ACHAT_SIGNEE",
          fileName: "offre-achat.pdf",
          mimeType: "application/pdf",
          size: 2048,
          status: "UPLOADED",
          storageKey: "files/offre-achat.pdf",
          createdAt: "2026-02-02T10:00:00.000Z",
        },
      ],
    };

    const propertyServiceMock: Partial<PropertyService> = {
      getById: () =>
        Promise.resolve({
          ...basePropertyResponse,
          hiddenExpectedDocumentKeys: [...persistedHiddenExpectedDocumentKeys],
        }),
      patch: (_propertyId, payload) => {
        persistedHiddenExpectedDocumentKeys = [...(payload.hiddenExpectedDocumentKeys ?? [])];
        patchCalls.push([...persistedHiddenExpectedDocumentKeys]);
        return Promise.resolve({
          ...basePropertyResponse,
          hiddenExpectedDocumentKeys: [...persistedHiddenExpectedDocumentKeys],
        });
      },
      listProspects: () => Promise.resolve({ items: [] } as PropertyProspectListResponse),
      listVisits: () => Promise.resolve({ items: [] } as PropertyVisitListResponse),
      getRisks: () => Promise.resolve(risksResponse),
    };

    const messageServiceMock: Partial<MessageService> = {
      listByProperty: () => Promise.resolve({ items: [] } as MessageListResponse),
    };

    const fileServiceMock: Partial<FileService> = {
      listByProperty: () => Promise.resolve(filesResponse),
    };

    const userServiceMock: Partial<UserService> = {
      list: () => Promise.resolve({ items: [] } as AccountUserListResponse),
    };

    TestBed.configureTestingModule({
      imports: [PropertyDetailPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: "property_docs" }),
            },
          },
        },
        { provide: PropertyService, useValue: propertyServiceMock },
        { provide: MessageService, useValue: messageServiceMock },
        { provide: FileService, useValue: fileServiceMock },
        { provide: UserService, useValue: userServiceMock },
        { provide: InseeCityService, useValue: {} },
        { provide: VocalService, useValue: {} },
      ],
    });

    const firstFixture = TestBed.createComponent(PropertyDetailPageComponent);
    const firstComponent = firstFixture.componentInstance;

    firstFixture.detectChanges();
    await firstFixture.whenStable();
    firstFixture.detectChanges();
    firstComponent.files.set(filesResponse.items);

    firstComponent.setMainTab("documents");
    firstComponent.setActiveDocumentTab("mandat");
    firstFixture.detectChanges();

    const mandatTab = firstComponent.documentTabs.find((tab) => tab.id === "mandat");
    expect(mandatTab).toBeDefined();
    expect(firstComponent.documentTabProgressLabel(mandatTab!)).toBe("2/2");
    expect(firstComponent.expectedDocumentsForActiveTab().map((item) => item.provided)).toEqual([true, true]);

    firstComponent.hideExpectedDocument("mandat", 0);
    firstFixture.detectChanges();
    expect(firstComponent.hiddenExpectedDocumentKeys()).toContain("mandat::MANDAT_VENTE_SIGNE");
    expect(firstComponent.expectedDocumentsForActiveTab().length).toBe(1);
    expect(firstComponent.expectedDocumentsForActiveTab().some((item) => item.index === 0)).toBe(false);
    expect(firstComponent.documentTabProgressLabel(mandatTab!)).toBe("1/1");

    await firstFixture.whenStable();
    firstFixture.detectChanges();

    expect(patchCalls).toEqual([["mandat::MANDAT_VENTE_SIGNE"]]);

    firstFixture.destroy();

    const secondFixture = TestBed.createComponent(PropertyDetailPageComponent);
    const secondComponent = secondFixture.componentInstance;
    secondFixture.detectChanges();
    await secondFixture.whenStable();
    await secondComponent.loadPropertyBundle();
    secondFixture.detectChanges();
    secondComponent.files.set(filesResponse.items);

    secondComponent.setMainTab("documents");
    secondComponent.setActiveDocumentTab("mandat");
    secondFixture.detectChanges();

    expect(secondComponent.hiddenExpectedDocumentKeys()).toEqual(["mandat::MANDAT_VENTE_SIGNE"]);
    expect(secondComponent.expectedDocumentsForActiveTab().length).toBe(1);

    secondComponent.restoreHiddenExpectedDocumentsForTab("mandat");
    await secondFixture.whenStable();
    secondFixture.detectChanges();

    expect(secondComponent.activeTabHasHiddenExpectedDocuments()).toBe(false);
    expect(secondComponent.expectedDocumentsForActiveTab().length).toBe(2);
    expect(patchCalls).toEqual([["mandat::MANDAT_VENTE_SIGNE"], []]);
  });

  it("masque l onglet documents copropriete si le bien n est pas en copropriete", async () => {
    const propertyResponse: PropertyResponse = {
      id: "property_no_copro",
      title: "Maison Toulouse",
      city: "Toulouse",
      postalCode: "31000",
      address: "5 rue Alsace",
      price: 360000,
      details: {
        copropriete: {
          isCopropriete: false,
        },
      },
      status: "PROSPECTION",
      orgId: "org_demo",
      createdAt: "2026-02-01T10:00:00.000Z",
      updatedAt: "2026-02-01T10:00:00.000Z",
    };

    const propertyServiceMock: Partial<PropertyService> = {
      getById: () => Promise.resolve(propertyResponse),
      listProspects: () => Promise.resolve({ items: [] } as PropertyProspectListResponse),
      listVisits: () => Promise.resolve({ items: [] } as PropertyVisitListResponse),
      getRisks: () =>
        Promise.resolve({
          propertyId: "property_no_copro",
          status: "NO_DATA",
          source: "GEORISQUES",
          georisquesUrl: "https://www.georisques.gouv.fr",
          reportPdfUrl: null,
          generatedAt: "2026-02-01T10:00:00.000Z",
          message: null,
          location: {
            address: "5 rue Alsace",
            postalCode: "31000",
            city: "Toulouse",
            inseeCode: "31555",
            latitude: 43.6,
            longitude: 1.44,
          },
          items: [],
        } as PropertyRiskResponse),
    };

    const messageServiceMock: Partial<MessageService> = {
      listByProperty: () => Promise.resolve({ items: [] } as MessageListResponse),
    };

    const fileServiceMock: Partial<FileService> = {
      listByProperty: () => Promise.resolve({ items: [] } as FileListResponse),
    };

    const userServiceMock: Partial<UserService> = {
      list: () => Promise.resolve({ items: [] } as AccountUserListResponse),
    };

    TestBed.configureTestingModule({
      imports: [PropertyDetailPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: "property_no_copro" }),
            },
          },
        },
        { provide: PropertyService, useValue: propertyServiceMock },
        { provide: MessageService, useValue: messageServiceMock },
        { provide: FileService, useValue: fileServiceMock },
        { provide: UserService, useValue: userServiceMock },
        { provide: InseeCityService, useValue: {} },
        { provide: VocalService, useValue: {} },
      ],
    });

    const fixture = TestBed.createComponent(PropertyDetailPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    component.property.set(propertyResponse);

    component.setMainTab("documents");
    fixture.detectChanges();

    component.visibleDocumentTabs();
    component.setActiveDocumentTab("copropriete");
    expect(component.activeDocumentTabDefinition().id).not.toBe("copropriete");
  });

  it("couvre le flux statuts, prospect et visite", async () => {
    const statusCalls: string[] = [];
    const baseProperty: PropertyResponse = {
      id: "property_flow",
      title: "Maison Nice",
      city: "Nice",
      postalCode: "06000",
      address: "3 avenue Jean Médecin",
      price: 550000,
      details: {},
      status: "PROSPECTION",
      orgId: "org_demo",
      createdAt: "2026-02-01T10:00:00.000Z",
      updatedAt: "2026-02-01T10:00:00.000Z",
    };

    let currentStatus = baseProperty.status;

    const propertyServiceMock: Partial<PropertyService> = {
      getById: () => Promise.resolve({ ...baseProperty, status: currentStatus }),
      listProspects: () => Promise.resolve({ items: [] } as PropertyProspectListResponse),
      listVisits: () => Promise.resolve({ items: [] } as PropertyVisitListResponse),
      getRisks: () =>
        Promise.resolve({
          propertyId: "property_flow",
          status: "NO_DATA",
          source: "GEORISQUES",
          georisquesUrl: "https://www.georisques.gouv.fr",
          reportPdfUrl: null,
          generatedAt: "2026-02-01T10:00:00.000Z",
          message: null,
          location: {
            address: "3 avenue Jean Médecin",
            postalCode: "06000",
            city: "Nice",
            inseeCode: "06088",
            latitude: 43.7031,
            longitude: 7.2661,
          },
          items: [],
        } as PropertyRiskResponse),
      updateStatus: (_propertyId, status) => {
        currentStatus = status;
        statusCalls.push(status);
        return Promise.resolve({ ...baseProperty, status });
      },
      addProspect: async () =>
        ({
          id: "prospect_1",
          propertyId: "property_flow",
          userId: "user_1",
          firstName: "Julie",
          lastName: "Robert",
          email: "julie@example.com",
          phone: "0611111111",
          address: null,
          postalCode: null,
          city: null,
          relationRole: "PROSPECT",
          createdAt: "2026-02-02T10:00:00.000Z",
        }) as const,
      addVisit: async () =>
        ({
          id: "visit_1",
          propertyId: "property_flow",
          propertyTitle: "Maison Nice",
          prospectUserId: "user_1",
          prospectFirstName: "Julie",
          prospectLastName: "Robert",
          prospectEmail: "julie@example.com",
          prospectPhone: "0611111111",
          startsAt: "2026-02-03T10:00:00.000Z",
          endsAt: "2026-02-03T11:00:00.000Z",
          compteRendu: null,
          bonDeVisiteFileId: null,
          bonDeVisiteFileName: null,
          createdAt: "2026-02-03T09:00:00.000Z",
          updatedAt: "2026-02-03T09:00:00.000Z",
        }) as const,
    };

    const userServiceMock: Partial<UserService> = {
      list: () =>
        Promise.resolve({
          items: [
            {
              id: "user_1",
              firstName: "Julie",
              lastName: "Robert",
              email: "julie@example.com",
              phone: "0611111111",
              orgId: "org_demo",
              accountType: "CLIENT",
              role: "CLIENT",
              address: null,
              postalCode: null,
              city: null,
              personalNotes: null,
              linkedProperties: [],
              createdAt: "2026-02-01T10:00:00.000Z",
              updatedAt: "2026-02-01T10:00:00.000Z",
            },
          ],
        } as AccountUserListResponse),
    };

    TestBed.configureTestingModule({
      imports: [PropertyDetailPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: "property_flow" }),
            },
          },
        },
        { provide: PropertyService, useValue: propertyServiceMock },
        { provide: MessageService, useValue: { listByProperty: () => Promise.resolve({ items: [] } as MessageListResponse) } },
        { provide: FileService, useValue: { listByProperty: () => Promise.resolve({ items: [] } as FileListResponse) } },
        { provide: UserService, useValue: userServiceMock },
        { provide: InseeCityService, useValue: { getCityIndicators: () => Promise.resolve({}) } },
        { provide: VocalService, useValue: { upload: () => Promise.resolve({}) } },
      ],
    });

    const fixture = TestBed.createComponent(PropertyDetailPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    await component.updateStatus("MANDAT_SIGNE");
    await component.goToNextStatus();
    await component.goToPreviousStatus();
    await component.archiveProperty();
    expect(statusCalls).toEqual(["MANDAT_SIGNE", "EN_DIFFUSION", "MANDAT_SIGNE", "ARCHIVE"]);

    component.openProspectModal();
    component.setProspectMode("new");
    component.prospectForm.controls.firstName.setValue("Julie");
    component.prospectForm.controls.lastName.setValue("Robert");
    component.prospectForm.controls.phone.setValue("0611111111");
    component.prospectForm.controls.email.setValue("julie@example.com");
    await component.addProspect();
    expect(component.prospects().length).toBe(1);

    component.openVisitModal();
    component.setVisitProspectMode("new");
    component.visitForm.controls.startsAt.setValue("2026-02-03T10:00");
    component.visitForm.controls.endsAt.setValue("2026-02-03T11:00");
    component.visitForm.controls.firstName.setValue("Julie");
    component.visitForm.controls.lastName.setValue("Robert");
    component.visitForm.controls.phone.setValue("0611111111");
    component.visitForm.controls.email.setValue("julie@example.com");
    await component.addVisit();
    expect(component.visits().length).toBe(1);
    expect(component.requestFeedback()).toBe("Visite ajoutée.");
  });

  it("couvre les helpers de formatage et de filtrage comparables", async () => {
    const propertyResponse: PropertyResponse = {
      id: "property_helpers",
      title: "Appartement Lyon",
      city: "Lyon",
      postalCode: "69001",
      address: "10 rue de la République",
      price: 410000,
      details: {
        general: { propertyType: "APPARTEMENT" },
        characteristics: { livingArea: 80 },
      },
      status: "PROSPECTION",
      orgId: "org_demo",
      createdAt: "2026-02-01T10:00:00.000Z",
      updatedAt: "2026-02-01T10:00:00.000Z",
    };

    const comparablesResponse: PropertyComparablesResponse = {
      propertyId: "property_helpers",
      propertyType: "APPARTEMENT",
      source: "LIVE",
      windowYears: 10,
      search: {
        center: { latitude: 45.764, longitude: 4.8357 },
        finalRadiusM: 3000,
        radiiTried: [1000, 2000, 3000],
        targetCount: 100,
        targetReached: false,
      },
      summary: {
        count: 3,
        medianPrice: 350000,
        medianPricePerM2: 5000,
        minPrice: 300000,
        maxPrice: 380000,
      },
      subject: {
        surfaceM2: 80,
        askingPrice: 360000,
        affinePriceAtSubjectSurface: null,
        predictedPrice: 355000,
        deviationPct: 1.4,
        pricingPosition: "NORMAL",
      },
      regression: {
        slope: 4200,
        intercept: 15000,
        r2: 0.63,
        pointsUsed: 3,
      },
      points: [
        {
          saleDate: "2024-10-10T00:00:00.000Z",
          surfaceM2: 78,
          landSurfaceM2: null,
          salePrice: 350000,
          pricePerM2: 4487,
          distanceM: 450,
          city: "Lyon",
          postalCode: "69001",
        },
        {
          saleDate: "2024-09-10T00:00:00.000Z",
          surfaceM2: 82,
          landSurfaceM2: null,
          salePrice: 360000,
          pricePerM2: 4390,
          distanceM: 900,
          city: "Lyon",
          postalCode: "69001",
        },
        {
          saleDate: "2024-08-10T00:00:00.000Z",
          surfaceM2: 90,
          landSurfaceM2: null,
          salePrice: 380000,
          pricePerM2: 4222,
          distanceM: 1400,
          city: "Lyon",
          postalCode: "69001",
        },
      ],
    };

    TestBed.configureTestingModule({
      imports: [PropertyDetailPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: "property_helpers" }),
            },
          },
        },
        {
          provide: PropertyService,
          useValue: {
            getById: () => Promise.resolve(propertyResponse),
            listProspects: () => Promise.resolve({ items: [] } as PropertyProspectListResponse),
            listVisits: () => Promise.resolve({ items: [] } as PropertyVisitListResponse),
            getComparables: () => Promise.resolve(comparablesResponse),
            getRisks: () =>
              Promise.resolve({
                propertyId: "property_helpers",
                status: "NO_DATA",
                source: "GEORISQUES",
                georisquesUrl: "https://www.georisques.gouv.fr",
                reportPdfUrl: null,
                generatedAt: "2026-02-01T10:00:00.000Z",
                message: null,
                location: {
                  address: "10 rue de la République",
                  postalCode: "69001",
                  city: "Lyon",
                  inseeCode: "69123",
                  latitude: 45.764,
                  longitude: 4.8357,
                },
                items: [],
              } as PropertyRiskResponse),
          },
        },
        { provide: MessageService, useValue: { listByProperty: () => Promise.resolve({ items: [] } as MessageListResponse) } },
        { provide: FileService, useValue: { listByProperty: () => Promise.resolve({ items: [] } as FileListResponse) } },
        { provide: UserService, useValue: { list: () => Promise.resolve({ items: [] } as AccountUserListResponse) } },
        { provide: InseeCityService, useValue: { getCityIndicators: () => Promise.resolve({}) } },
        { provide: VocalService, useValue: {} },
      ],
    });

    const fixture = TestBed.createComponent(PropertyDetailPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component.setMainTab("valuation");
    await fixture.whenStable();
    fixture.detectChanges();

    component.onComparableRadiusFilterChange("1000");
    component.onComparableSurfaceMinChange("79");
    component.onComparableSurfaceMaxChange("85");
    component.onLatestSimilarRadiusFilterChange("1200");
    component.onLatestSimilarSurfaceMinChange("76");
    component.onLatestSimilarSurfaceMaxChange("84");
    component.goToSalesPage(2);
    component.goToPreviousSalesPage();
    component.goToNextSalesPage();

    expect(component.sliderPercent(80, 70, 90)).toBe(50);
    expect(component.comparablePricingLabel("OVER_PRICED")).toBe("Au-dessus du marche");
    expect(component.formatSize(900)).toBe("900 o");
    expect(component.formatSize(8_200)).toContain("Ko");
    expect(component.formatSize(3_000_000)).toContain("Mo");
    expect(component.prospectRelationLabel("OWNER")).toBe("Propriétaire");
    expect(component.prospectRelationLabel("OTHER")).toBe("OTHER");
    expect(component.paginatedComparableSales().length).toBeGreaterThan(0);
    expect(component.comparablesDisplayedSummary().count).toBeGreaterThan(0);
  });

  it("évalue les computed principaux et couvre les flux upload/vocal", async () => {
    const propertyResponse: PropertyResponse = {
      id: "property_computed",
      title: "Maison Grasse",
      city: "Grasse",
      postalCode: "06130",
      address: "7 avenue des Fleurs",
      price: null,
      details: {
        general: { propertyType: "MAISON" },
        characteristics: { livingArea: 120, landArea: 900 },
        finance: {
          salePriceTtc: 620000,
          propertyTax: 1800,
          annualChargesEstimate: 1200,
          monthlyRent: 2100,
        },
        copropriete: {
          isCopropriete: "false",
          monthlyCharges: 120,
        },
      },
      hiddenExpectedDocumentKeys: ["mandat::MANDAT_VENTE_SIGNE"],
      status: "VISITES",
      orgId: "org_demo",
      createdAt: "2026-02-01T10:00:00.000Z",
      updatedAt: "2026-02-01T10:00:00.000Z",
    };

    const comparablesResponse: PropertyComparablesResponse = {
      propertyId: "property_computed",
      propertyType: "MAISON",
      source: "LIVE",
      windowYears: 10,
      search: {
        center: { latitude: 43.658, longitude: 6.924 },
        finalRadiusM: 5000,
        radiiTried: [1000, 3000, 5000],
        targetCount: 100,
        targetReached: false,
      },
      summary: {
        count: 4,
        medianPrice: 610000,
        medianPricePerM2: 5000,
        minPrice: 520000,
        maxPrice: 710000,
      },
      subject: {
        surfaceM2: 120,
        askingPrice: 620000,
        affinePriceAtSubjectSurface: null,
        predictedPrice: 605000,
        deviationPct: 2.4,
        pricingPosition: "NORMAL",
      },
      regression: {
        slope: 4200,
        intercept: 85000,
        r2: 0.66,
        pointsUsed: 4,
      },
      points: [
        {
          saleDate: "2025-01-10T00:00:00.000Z",
          surfaceM2: 110,
          landSurfaceM2: 800,
          salePrice: 560000,
          pricePerM2: 5090,
          distanceM: 950,
          city: "Grasse",
          postalCode: "06130",
        },
        {
          saleDate: "2024-11-10T00:00:00.000Z",
          surfaceM2: 118,
          landSurfaceM2: 870,
          salePrice: 595000,
          pricePerM2: 5042,
          distanceM: 1400,
          city: "Grasse",
          postalCode: "06130",
        },
        {
          saleDate: "2024-09-10T00:00:00.000Z",
          surfaceM2: 125,
          landSurfaceM2: 920,
          salePrice: 640000,
          pricePerM2: 5120,
          distanceM: 2200,
          city: "Grasse",
          postalCode: "06130",
        },
        {
          saleDate: "2024-06-10T00:00:00.000Z",
          surfaceM2: 140,
          landSurfaceM2: 1100,
          salePrice: 710000,
          pricePerM2: 5071,
          distanceM: 4200,
          city: "Grasse",
          postalCode: "06130",
        },
      ],
    };

    const fileServiceMock: Partial<FileService> = {
      listByProperty: () => Promise.resolve({ items: [] } as FileListResponse),
      upload: () =>
        Promise.resolve({
          id: "file_uploaded_1",
          propertyId: "property_computed",
          typeDocument: "DPE",
          fileName: "diag.pdf",
          mimeType: "application/pdf",
          size: 123,
          status: "UPLOADED",
          storageKey: "files/diag.pdf",
          createdAt: "2026-02-03T10:00:00.000Z",
        }),
    };

    const vocalServiceMock: Partial<VocalService> = {
      upload: () =>
        Promise.resolve({
          id: "vocal_1",
          propertyId: "property_computed",
          fileId: "file_vocal_1",
          status: "UPLOADED",
          createdAt: "2026-02-03T10:00:00.000Z",
        }),
    };

    TestBed.configureTestingModule({
      imports: [PropertyDetailPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: "property_computed" }),
            },
          },
        },
        {
          provide: PropertyService,
          useValue: {
            getById: () => Promise.resolve(propertyResponse),
            listProspects: () => Promise.resolve({ items: [] } as PropertyProspectListResponse),
            listVisits: () => Promise.resolve({ items: [] } as PropertyVisitListResponse),
            patch: (_propertyId: string, payload: { details?: Record<string, unknown> }) =>
              Promise.resolve({
                ...propertyResponse,
                details: payload.details
                  ? {
                      ...(propertyResponse.details as Record<string, unknown>),
                      ...payload.details,
                    }
                  : propertyResponse.details,
              }),
            getRisks: () =>
              Promise.resolve({
                propertyId: "property_computed",
                status: "NO_DATA",
                source: "GEORISQUES",
                georisquesUrl: "https://www.georisques.gouv.fr",
                reportPdfUrl: null,
                generatedAt: "2026-02-01T10:00:00.000Z",
                message: null,
                location: {
                  address: "7 avenue des Fleurs",
                  postalCode: "06130",
                  city: "Grasse",
                  inseeCode: "06069",
                  latitude: 43.658,
                  longitude: 6.924,
                },
                items: [],
              } as PropertyRiskResponse),
          },
        },
        { provide: MessageService, useValue: { listByProperty: () => Promise.resolve({ items: [] } as MessageListResponse) } },
        { provide: FileService, useValue: fileServiceMock },
        {
          provide: UserService,
          useValue: {
            list: () =>
              Promise.resolve({
                items: [
                  {
                    id: "client_1",
                    firstName: "Anais",
                    lastName: "Meyer",
                    email: "anais@example.com",
                    phone: "0601010101",
                    orgId: "org_demo",
                    accountType: "CLIENT",
                    role: "CLIENT",
                    address: null,
                    postalCode: null,
                    city: null,
                    personalNotes: null,
                    linkedProperties: [],
                    createdAt: "2026-02-01T10:00:00.000Z",
                    updatedAt: "2026-02-01T10:00:00.000Z",
                  },
                ],
              } as AccountUserListResponse),
          },
        },
        {
          provide: InseeCityService,
          useValue: {
            getCityIndicators: () =>
              Promise.resolve({
                inseeCode: "06069",
                city: "Grasse",
                postalCode: "06130",
                populationCurrent: 50000,
                populationCurrentYear: 2024,
                populationGrowthPct: 3.2,
                populationGrowthAbs: 1500,
                populationStartYear: 2010,
                populationEndYear: 2024,
                populationDensityPerKm2: 1100,
                medianIncome: 23000,
                medianIncomeYear: 2014,
                ownersRatePct: 58,
                ownersRateYear: 2015,
                ownersRateScope: "Commune",
                unemploymentRatePct: 9.2,
                unemploymentYear: 2024,
                averageAge: 41.2,
                averageAgeYear: 2014,
                povertyRatePct: 14.2,
                giniIndex: 0.39,
              }),
          },
        },
        { provide: VocalService, useValue: vocalServiceMock },
      ],
    });

    const fixture = TestBed.createComponent(PropertyDetailPageComponent);
    const component = fixture.componentInstance;
    const internals = component as unknown as Record<string, (...args: unknown[]) => unknown>;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component.files.set([
      {
        id: "file_a",
        propertyId: "property_computed",
        typeDocument: "MANDAT_VENTE_SIGNE",
        fileName: "mandat.pdf",
        mimeType: "application/pdf",
        size: 100,
        status: "UPLOADED",
        storageKey: "files/mandat.pdf",
        createdAt: "2026-02-01T10:00:00.000Z",
      },
    ]);
    component.prospects.set([
      {
        id: "prospect_a",
        propertyId: "property_computed",
        userId: "client_1",
        firstName: "Anais",
        lastName: "Meyer",
        email: "anais@example.com",
        phone: "0601010101",
        address: null,
        postalCode: null,
        city: null,
        relationRole: "PROSPECT",
        createdAt: "2026-02-01T10:00:00.000Z",
      },
    ]);
    component.visits.set([
      {
        id: "visit_a",
        propertyId: "property_computed",
        propertyTitle: "Maison Grasse",
        prospectUserId: "client_1",
        prospectFirstName: "Anais",
        prospectLastName: "Meyer",
        prospectEmail: "anais@example.com",
        prospectPhone: "0601010101",
        startsAt: "2026-02-01T12:00:00.000Z",
        endsAt: "2026-02-01T13:00:00.000Z",
        compteRendu: null,
        bonDeVisiteFileId: null,
        bonDeVisiteFileName: null,
        createdAt: "2026-02-01T11:00:00.000Z",
        updatedAt: "2026-02-01T11:00:00.000Z",
      },
    ]);
    component.comparables.set(comparablesResponse);
    (internals["initializeComparablesFilters"] as (arg: PropertyComparablesResponse) => void)(comparablesResponse);
    const subjectPoint = (internals["resolveSubjectPointForChart"] as (
      arg: PropertyComparablesResponse,
    ) => { x: number; y: number } | null)(comparablesResponse);
    expect(subjectPoint?.x).toBe(120);
    expect(subjectPoint?.y).toBe(620000);
    const elevatedSubjectComparables: PropertyComparablesResponse = {
      ...comparablesResponse,
      subject: {
        ...comparablesResponse.subject,
        askingPrice: 900000,
      },
    };
    component.comparables.set(elevatedSubjectComparables);
    expect((component.comparablesChartDomains()?.yDomain.max ?? 0) > 900000).toBe(true);
    component.comparables.set(comparablesResponse);
    component.onRentalMonthlyRentChange("2200");
    component.onRentalHoldingYearsChange("11");
    component.onRentalResalePriceChange("690000");
    component.setMainTab("documents");
    component.setActiveDocumentTab("mandat");

    expect(component.activePropertyCategoryDefinition()).toBeDefined();
    component.activePropertyForm();
    component.visibleDocumentTabs();
    expect(component.providedDocumentTypes().has("MANDAT_VENTE_SIGNE")).toBe(true);
    expect(component.documentsForActiveTab()).toHaveLength(1);
    expect(component.expectedDocumentsForActiveTab().length).toBeGreaterThan(0);
    component.activeTabHasHiddenExpectedDocuments();
    component.previousStatus();
    component.nextStatus();
    expect(component.selectedFileName()).toBeNull();
    expect(component.recordedVocalLabel()).toBeNull();
    expect(component.filteredProspectClients().length).toBeGreaterThanOrEqual(0);
    expect(component.filteredVisitClients().length).toBeGreaterThanOrEqual(0);
    expect(component.sortedVisits()[0]?.id).toBe("visit_a");
    expect(component.comparableTargetSurfaceM2()).toBe(120);
    component.comparableTargetLandSurfaceM2();
    component.comparablesRadiusDomain();
    component.comparablesSurfaceDomain();
    component.comparablesSurfaceSlider();
    component.comparablesTerrainDomain();
    component.comparablesTerrainSlider();
    expect(component.filteredComparablePoints().length).toBeGreaterThan(0);
    expect(component.filteredComparableSalesSorted().length).toBeGreaterThan(0);
    expect(component.salesPagination().totalPages).toBeGreaterThan(0);
    expect(component.paginatedComparableSales().length).toBeGreaterThan(0);
    expect(component.comparablesDisplayedSummary().count).toBeGreaterThan(0);
    expect(component.comparablesFrontRegression().pointsUsed).toBeGreaterThan(0);
    expect(component.comparablesFrontPricing()).not.toBeNull();
    expect(component.comparableSalesSortDirection("saleDate")).toBe("desc");
    expect(component.comparableSalesSortIndicator("saleDate")).toBe("↓");
    expect(component.comparableSalesAriaSort("saleDate")).toBe("descending");
    expect(component.filteredComparableSalesSorted().map((point) => point.saleDate)).toEqual([
      "2025-01-10T00:00:00.000Z",
      "2024-11-10T00:00:00.000Z",
      "2024-09-10T00:00:00.000Z",
      "2024-06-10T00:00:00.000Z",
    ]);

    component.sortComparableSalesBy("surfaceM2");
    expect(component.comparableSalesSortDirection("surfaceM2")).toBe("asc");
    expect(component.comparableSalesSortIndicator("surfaceM2")).toBe("↑");
    expect(component.comparableSalesAriaSort("saleDate")).toBe("none");
    expect(component.filteredComparableSalesSorted().map((point) => point.surfaceM2)).toEqual([
      110, 118, 125, 140,
    ]);

    component.sortComparableSalesBy("surfaceM2");
    expect(component.comparableSalesSortDirection("surfaceM2")).toBe("desc");
    expect(component.filteredComparableSalesSorted().map((point) => point.surfaceM2)).toEqual([
      140, 125, 118, 110,
    ]);

    component.sortComparableSalesBy("landSurfaceM2");
    expect(component.comparableSalesSortDirection("landSurfaceM2")).toBe("asc");
    expect(component.filteredComparableSalesSorted().map((point) => point.landSurfaceM2)).toEqual([
      800, 870, 920, 1100,
    ]);

    component.sortComparableSalesBy("salePrice");
    expect(component.comparableSalesSortDirection("salePrice")).toBe("asc");
    expect(component.filteredComparableSalesSorted().map((point) => point.salePrice)).toEqual([
      560000, 595000, 640000, 710000,
    ]);

    component.sortComparableSalesBy("pricePerM2");
    expect(component.comparableSalesSortDirection("pricePerM2")).toBe("asc");
    expect(component.filteredComparableSalesSorted().map((point) => point.pricePerM2)).toEqual([
      5042, 5071, 5090, 5120,
    ]);

    component.sortComparableSalesBy("pricePerM2");
    expect(component.comparableSalesSortDirection("pricePerM2")).toBe("desc");
    expect(component.filteredComparableSalesSorted().map((point) => point.pricePerM2)).toEqual([
      5120, 5090, 5071, 5042,
    ]);
    const marketTrendRows = component.marketTrendRows();
    expect(marketTrendRows).toHaveLength(5);
    expect(marketTrendRows[0]?.year).toBe(2021);
    expect(marketTrendRows[0]?.salesCount).toBe(0);
    expect(marketTrendRows[3]?.salesCount).toBe(3);
    expect(marketTrendRows[4]?.salesCount).toBe(1);
    expect((marketTrendRows[4]?.salesCountVariationPct ?? 0) < 0).toBe(true);
    expect((marketTrendRows[4]?.avgPricePerM2VariationPct ?? 0) > 0).toBe(true);
    expect(component.variationClass(marketTrendRows[4]?.salesCountVariationPct ?? null)).toBe(
      "text-red-700",
    );
    expect(component.variationClass(1)).toBe("text-emerald-700");
    expect(component.variationClass(0)).toBe("text-slate-700");
    expect(component.variationClass(null)).toBe("text-slate-500");
    expect(
      component.rentalProfitability().irrPct === null || (component.rentalProfitability().irrPct ?? 0) > 0,
    ).toBe(true);
    expect(
      component.inseeModule().city === null || component.inseeModule().city === "Grasse",
    ).toBe(true);
    expect(component.latestSimilarComparableSalesCriteria()).not.toBeNull();
    expect(component.latestSimilarRadiusSlider()).not.toBeNull();
    expect(component.latestSimilarSurfaceSlider()).not.toBeNull();
    component.latestSimilarTerrainSlider();
    expect(component.latestSimilarComparableSales().length).toBeGreaterThan(0);
    expect(component.comparablesChartDomains()).not.toBeNull();
    const outlierComparables: PropertyComparablesResponse = {
      ...comparablesResponse,
      points: [
        ...comparablesResponse.points,
        {
          saleDate: "2024-03-10T00:00:00.000Z",
          surfaceM2: 120,
          landSurfaceM2: 820,
          salePrice: 4_700_000,
          pricePerM2: 39_166,
          distanceM: 1800,
          city: "Grasse",
          postalCode: "06130",
        },
        {
          saleDate: "2024-02-10T00:00:00.000Z",
          surfaceM2: 100,
          landSurfaceM2: 800,
          salePrice: 40_000,
          pricePerM2: 400,
          distanceM: 1500,
          city: "Grasse",
          postalCode: "06130",
        },
      ],
    };
    component.comparables.set(outlierComparables);
    (internals["initializeComparablesFilters"] as (arg: PropertyComparablesResponse) => void)(
      outlierComparables,
    );
    expect(component.filteredComparablePoints().some((point) => point.salePrice === 4_700_000)).toBe(true);
    expect(component.filteredComparablePoints().some((point) => point.salePrice === 40_000)).toBe(false);
    expect(component.chartComparablePoints().some((point) => point.salePrice === 4_700_000)).toBe(false);
    expect((component.comparablesChartDomains()?.yDomain.max ?? 0) < 4_700_000).toBe(true);

    component.openUploadModal();
    expect(component.uploadModalOpen()).toBe(true);
    component.onFileInputChange(new Event("change"));
    const originalFileToBase64 = internals["fileToBase64"];
    const originalBlobToBase64 = internals["blobToBase64"];
    internals["fileToBase64"] = () => Promise.resolve("Zm9v");
    component.selectedFile.set(new File(["doc"], "diag.pdf", { type: "application/pdf" }));
    await component.uploadFile();
    expect(component.uploadFeedback()).toBe("Document ajouté.");
    component.onUploadBackdropClick({ target: "same", currentTarget: "same" } as unknown as MouseEvent);

    component.openVocalModal();
    component.recordedVocal.set(new Blob(["audio"], { type: "audio/webm" }));
    internals["blobToBase64"] = () => Promise.resolve("Zm9v");
    await component.uploadVocalRecording();
    expect(component.requestFeedback()).toContain("Vocal ajouté");
    component.clearRecordedVocal();
    component.closeVocalModal(true);
    component.onVocalBackdropClick({ target: "same", currentTarget: "same" } as unknown as MouseEvent);
    internals["fileToBase64"] = originalFileToBase64;
    internals["blobToBase64"] = originalBlobToBase64;

    expect((internals["parseOptionalNumber"] as (value: string) => number | null)("12,5")).toBe(12.5);
    expect((internals["parseOptionalNumber"] as (value: string) => number | null)("x")).toBeNull();
    expect((internals["parsePositiveNumber"] as (value: unknown) => number | null)("1 200")).toBeNull();
    expect((internals["parseComparableSaleTimestamp"] as (value?: string) => number | null)(undefined)).toBeNull();
    expect((internals["formatComparableSaleDate"] as (value?: string) => string | null)("2024-01-01T00:00:00.000Z")).not.toBeNull();
    expect((internals["normalizeEmptyAsNull"] as (value: string) => string | null)("   ")).toBeNull();
    expect((internals["toIsoFromDateTimeInput"] as (value: string) => string | null)("bad")).toBeNull();
    expect((internals["parseBooleanDetail"] as (value: unknown) => boolean | null)("true")).toBe(true);
    expect((internals["parseBooleanDetail"] as (value: unknown) => boolean | null)(" FALSE ")).toBe(false);
    expect((internals["parseBooleanDetail"] as (value: unknown) => boolean | null)(42)).toBeNull();
    expect((internals["isAudioRecordingSupported"] as () => boolean)()).toBe(false);
    (internals["stopRecorderTracks"] as () => void)();

    component.comparables.set(null);
    component.onComparableRadiusFilterChange("900");
    component.onComparableSurfaceMinChange("90");
    component.onComparableSurfaceMaxChange("130");
    component.onComparableTerrainMinChange("700");
    component.onComparableTerrainMaxChange("1000");
    component.onLatestSimilarRadiusFilterChange("1200");
    component.onLatestSimilarSurfaceMinChange("95");
    component.onLatestSimilarSurfaceMaxChange("125");
    component.onLatestSimilarTerrainMinChange("700");
    component.onLatestSimilarTerrainMaxChange("1000");
    expect(component.comparableSurfaceMinM2()).toBeNull();
    expect(component.comparableTerrainMaxM2()).toBeNull();

    component.comparables.set(comparablesResponse);
    (internals["initializeComparablesFilters"] as (arg: PropertyComparablesResponse) => void)(
      comparablesResponse,
    );
    component.onComparableRadiusFilterChange("x");
    component.onComparableSurfaceMinChange("x");
    component.onComparableSurfaceMaxChange("x");
    component.onComparableTerrainMinChange("x");
    component.onComparableTerrainMaxChange("x");
    component.onLatestSimilarRadiusFilterChange("x");
    component.onLatestSimilarSurfaceMinChange("x");
    component.onLatestSimilarSurfaceMaxChange("x");
    component.onLatestSimilarTerrainMinChange("x");
    component.onLatestSimilarTerrainMaxChange("x");

    const noSurfaceComparables: PropertyComparablesResponse = {
      ...comparablesResponse,
      points: comparablesResponse.points.map((point) => ({ ...point, surfaceM2: 0 })),
    };
    (internals["initializeComparablesFilters"] as (arg: PropertyComparablesResponse) => void)(
      noSurfaceComparables,
    );
    expect(component.comparableSurfaceMinM2()).toBeNull();
    expect(component.latestSimilarSurfaceMaxM2()).toBeNull();

    const noTerrainComparables: PropertyComparablesResponse = {
      ...comparablesResponse,
      points: comparablesResponse.points.map((point) => ({ ...point, landSurfaceM2: null })),
    };
    (internals["initializeComparablesFilters"] as (arg: PropertyComparablesResponse) => void)(
      noTerrainComparables,
    );
    expect(component.comparableTerrainMinM2()).toBeNull();
    expect(component.latestSimilarTerrainMaxM2()).toBeNull();

    const apartmentComparables: PropertyComparablesResponse = {
      ...comparablesResponse,
      propertyType: "APPARTEMENT",
    };
    component.comparables.set(apartmentComparables);
    (internals["initializeComparablesFilters"] as (arg: PropertyComparablesResponse) => void)(
      apartmentComparables,
    );
    expect(component.latestSimilarTerrainSlider()).toBeNull();

    const selectedClient: AccountUserListResponse["items"][number] = {
      id: "client_1",
      firstName: "Anais",
      lastName: "Meyer",
      email: "anais@example.com",
      phone: "0601010101",
      orgId: "org_demo",
      accountType: "CLIENT",
      role: "CLIENT",
      address: null,
      postalCode: null,
      city: null,
      personalNotes: null,
      linkedProperties: [],
      createdAt: "2026-02-01T10:00:00.000Z",
      updatedAt: "2026-02-01T10:00:00.000Z",
    };
    const fallbackClient: AccountUserListResponse["items"][number] = {
      ...selectedClient,
      id: "client_2",
      email: "anais.secondary@example.com",
      phone: "0601010199",
    };
    component.clients.set([selectedClient, fallbackClient]);
    (internals["applyProspectLookupValue"] as (lookup: string) => void)("anais@example.com");
    expect(component.prospectForm.controls.userId.value).toBe("client_1");
    (internals["applyVisitLookupValue"] as (lookup: string) => void)("anais@example.com");
    expect(component.visitForm.controls.userId.value).toBe("client_1");
    expect((internals["findClientFromLookup"] as (lookup: string) => unknown)("anais")).toBeNull();
    expect(
      ((internals["findClientFromLookup"] as (lookup: string) => { id: string } | null)(
        "anais@example.com",
      ) ?? { id: null }).id,
    ).toBe("client_1");
    component.prospectForm.controls.userId.setValue("missing");
    component.prospectForm.controls.existingLookup.setValue("anais@example.com");
    expect(
      ((internals["resolveSelectedProspectClient"] as () => { id: string } | null)() ?? { id: null })
        .id,
    ).toBe("client_1");
    component.visitForm.controls.userId.setValue("missing");
    component.visitForm.controls.existingLookup.setValue("anais@example.com");
    expect(
      ((internals["resolveSelectedVisitClient"] as () => { id: string } | null)() ?? { id: null }).id,
    ).toBe("client_1");

    expect((internals["toCanonicalHiddenExpectedDocumentKey"] as (key: string) => string | null)("")).toBeNull();
    expect((internals["toCanonicalHiddenExpectedDocumentKey"] as (key: string) => string | null)("legacy-key")).toBe(
      "legacy-key",
    );
    expect((internals["toCanonicalHiddenExpectedDocumentKey"] as (key: string) => string | null)("mandat::")).toBeNull();
    expect(
      (internals["toCanonicalHiddenExpectedDocumentKey"] as (key: string) => string | null)("mandat::0"),
    ).toBe("mandat::MANDAT_VENTE_SIGNE");
    expect(
      (internals["normalizeHiddenExpectedDocumentKeys"] as (value: unknown) => string[])([
        "mandat::0",
        "mandat::MANDAT_VENTE_SIGNE",
        "legacy-key",
      ]),
    ).toEqual(["mandat::MANDAT_VENTE_SIGNE", "legacy-key"]);

    const boolField = { key: "isCopropriete", label: "copro", type: "boolean" } as const;
    const poolSelectField = { key: "pool", label: "Piscine", type: "select" } as const;
    const gardenSelectField = { key: "garden", label: "Jardin", type: "select" } as const;
    const numberField = { key: "livingArea", label: "surface", type: "number" } as const;
    const textField = { key: "notes", label: "notes", type: "text" } as const;
    const dateField = { key: "mandateSignedAt", label: "mandat", type: "date" } as const;
    expect((internals["toControlValue"] as (value: unknown, field: unknown) => string)(true, boolField)).toBe(
      "true",
    );
    expect((internals["toControlValue"] as (value: unknown, field: unknown) => string)("FALSE", boolField)).toBe(
      "false",
    );
    expect((internals["toControlValue"] as (value: unknown, field: unknown) => string)("foo", boolField)).toBe(
      "",
    );
    expect(
      (internals["toControlValue"] as (value: unknown, field: unknown) => string)(
        "2026-02-01T10:00:00.000Z",
        dateField,
      ),
    ).toBe("2026-02-01");
    expect((internals["toControlValue"] as (value: unknown, field: unknown) => string)("true", poolSelectField)).toBe(
      "OUI",
    );
    expect((internals["toControlValue"] as (value: unknown, field: unknown) => string)("false", poolSelectField)).toBe(
      "NON",
    );
    expect(
      (internals["toControlValue"] as (value: unknown, field: unknown) => string)(
        "true",
        gardenSelectField,
      ),
    ).toBe("OUI_NU");
    expect((internals["parseFieldFormValue"] as (value: string, field: unknown) => unknown)("true", boolField)).toBe(
      true,
    );
    expect((internals["parseFieldFormValue"] as (value: string, field: unknown) => unknown)("false", boolField)).toBe(
      false,
    );
    expect((internals["parseFieldFormValue"] as (value: string, field: unknown) => unknown)("x", boolField)).toBeNull();
    expect((internals["parseFieldFormValue"] as (value: string, field: unknown) => unknown)("", numberField)).toBeNull();
    expect((internals["parseFieldFormValue"] as (value: string, field: unknown) => unknown)("12,5", numberField)).toBe(
      12.5,
    );
    expect(() =>
      (internals["parseFieldFormValue"] as (value: string, field: unknown) => unknown)("abc", numberField),
    ).toThrowError("invalid_number");
    expect((internals["parseFieldFormValue"] as (value: string, field: unknown) => unknown)("  test  ", textField)).toBe(
      "test",
    );
    expect(
      (internals["parseFieldFormValue"] as (value: string, field: unknown) => unknown)(
        "true",
        poolSelectField,
      ),
    ).toBe("OUI");
    expect(
      (internals["parseFieldFormValue"] as (value: string, field: unknown) => unknown)(
        "false",
        gardenSelectField,
      ),
    ).toBe("NON");
    expect((internals["isFieldValueEmpty"] as (value: unknown) => boolean)("   ")).toBe(true);
    expect((internals["isFieldValueEmpty"] as (value: unknown) => boolean)(12)).toBe(false);
    const patchPayload: Record<string, unknown> = {};
    (internals["assignPropertyPatchValue"] as (payload: unknown, key: string, value: string) => void)(
      patchPayload,
      "title",
      "Titre MAJ",
    );
    (internals["assignPropertyPatchValue"] as (payload: unknown, key: string, value: string) => void)(
      patchPayload,
      "city",
      "Grasse",
    );
    (internals["assignPropertyPatchValue"] as (payload: unknown, key: string, value: string) => void)(
      patchPayload,
      "postalCode",
      "06130",
    );
    (internals["assignPropertyPatchValue"] as (payload: unknown, key: string, value: string) => void)(
      patchPayload,
      "address",
      "7 avenue des Fleurs",
    );
    (internals["assignPropertyPatchValue"] as (payload: unknown, key: string, value: string) => void)(
      patchPayload,
      "other",
      "ignored",
    );
    expect(patchPayload).toEqual({
      title: "Titre MAJ",
      city: "Grasse",
      postalCode: "06130",
      address: "7 avenue des Fleurs",
    });

    let stoppedTracks = 0;
    (component as unknown as { mediaStream: { getTracks: () => Array<{ stop: () => void }> } | null }).mediaStream = {
      getTracks: () => [{ stop: () => { stoppedTracks += 1; } }, { stop: () => { stoppedTracks += 1; } }],
    };
    (internals["stopRecorderTracks"] as () => void)();
    expect(stoppedTracks).toBe(2);

    const originalFileReader = globalThis.FileReader;
    class SuccessFileReader {
      result: string | ArrayBuffer | null = "data:text/plain;base64,Zm9v";
      onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
      onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

      readAsDataURL(): void {
        this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
      }
    }
    (globalThis as unknown as { FileReader: typeof FileReader }).FileReader =
      SuccessFileReader as unknown as typeof FileReader;
    await expect(
      (internals["blobToBase64"] as (blob: Blob) => Promise<string>)(
        new Blob(["audio"], { type: "audio/webm" }),
      ),
    ).resolves.toBe("Zm9v");
    await expect(
      (internals["fileToBase64"] as (file: File) => Promise<string>)(
        new File(["document"], "doc.txt", { type: "text/plain" }),
      ),
    ).resolves.toBe("Zm9v");

    class ErrorFileReader {
      result: string | ArrayBuffer | null = null;
      onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
      onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

      readAsDataURL(): void {
        this.onerror?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
      }
    }
    (globalThis as unknown as { FileReader: typeof FileReader }).FileReader =
      ErrorFileReader as unknown as typeof FileReader;
    await expect(
      (internals["blobToBase64"] as (blob: Blob) => Promise<string>)(
        new Blob(["audio"], { type: "audio/webm" }),
      ),
    ).rejects.toThrowError("Impossible de lire l'enregistrement vocal.");
    await expect(
      (internals["fileToBase64"] as (file: File) => Promise<string>)(
        new File(["document"], "doc.txt", { type: "text/plain" }),
      ),
    ).rejects.toThrowError("Impossible de lire le fichier.");
    (globalThis as unknown as { FileReader: typeof FileReader }).FileReader = originalFileReader;
  });
});
