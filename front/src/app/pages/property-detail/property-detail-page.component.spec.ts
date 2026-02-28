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
import { MessageService } from "../../services/message.service";
import { PropertyService } from "../../services/property.service";
import { UserService } from "../../services/user.service";
import { VocalService } from "../../services/vocal.service";
import { PropertyDetailPageComponent } from "./property-detail-page.component";

describe("PropertyDetailPageComponent comparables", () => {
  it("charge les comparables au changement d'onglet puis force le refresh", async () => {
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
        affinePriceAtSubjectSurface: 315000,
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
          salePrice: 295000,
          pricePerM2: 4338,
          distanceM: 420,
          city: "Paris",
          postalCode: "75011",
        },
        {
          saleDate: "2024-09-10T00:00:00.000Z",
          surfaceM2: 72,
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
        { provide: VocalService, useValue: {} },
      ],
    });

    const fixture = TestBed.createComponent(PropertyDetailPageComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getComparablesCalls.length).toBe(0);

    component.setMainTab("comparables");
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getComparablesCalls.length).toBe(1);
    expect(getComparablesCalls[0]?.propertyId).toBe("property_1");
    expect(component.comparables()?.summary.count).toBe(2);
    expect(component.localRegression()?.pointsUsed).toBe(2);

    await component.refreshComparables();
    await fixture.whenStable();

    expect(getComparablesCalls.length).toBe(2);
    expect(getComparablesCalls[1]?.propertyId).toBe("property_1");
    expect(component.comparables()?.propertyType).toBe("MAISON");
  });
});
