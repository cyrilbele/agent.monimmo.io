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

    const propertyServiceMock: Partial<PropertyService> = {
      getById: () => Promise.resolve(propertyResponse),
      listProspects: () => Promise.resolve({ items: [] } as PropertyProspectListResponse),
      listVisits: () => Promise.resolve({ items: [] } as PropertyVisitListResponse),
      getRisks: () => Promise.resolve(risksResponse),
      getComparables: (propertyId: string, options?: unknown) => {
        getComparablesCalls.push({ propertyId, options });
        return Promise.resolve(comparablesResponse);
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
    ).toBeUndefined();
    expect(component.comparables()?.summary.count).toBe(2);
    expect(component.comparablesFrontRegression().pointsUsed).toBe(2);
    expect(component.paginatedComparableSales().length).toBe(2);
    expect(component.paginatedComparableSales()[0]?.saleDate).toBe("2024-09-10T00:00:00.000Z");

    expect(component.comparables()?.propertyType).toBe("MAISON");

    component.onRentalMonthlyRentChange("1500");
    component.onRentalHoldingYearsChange("10");
    component.onRentalResalePriceChange("380000");
    fixture.detectChanges();

    const rental = component.rentalProfitability();
    expect(rental.notaryFeePct).toBe(8);
    expect(rental.initialInvestment).toBe(345600);
    expect(rental.annualNetCashflow).toBe(14400);
    expect(rental.irrPct).not.toBeNull();
    expect((rental.irrPct ?? 0) > 0).toBe(true);
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
});
