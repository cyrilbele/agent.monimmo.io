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
    expect(rental.irrPct === null || rental.irrPct > 0).toBe(true);
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
