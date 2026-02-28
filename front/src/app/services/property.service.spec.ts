import { TestBed } from "@angular/core/testing";
import type { PropertyComparablesResponse } from "../core/api.models";
import { ApiClientService } from "../core/api-client.service";
import { PropertyService } from "./property.service";

describe("PropertyService", () => {
  it("appelle chaque endpoint propriété avec la bonne route", async () => {
    const calls: unknown[][] = [];

    TestBed.configureTestingModule({
      providers: [
        PropertyService,
        {
          provide: ApiClientService,
          useValue: {
            request: (...args: unknown[]) => {
              calls.push(args);
              return Promise.resolve({});
            },
          },
        },
      ],
    });

    const service = TestBed.inject(PropertyService);

    await service.list();
    await service.getById("property:1");
    await service.create({
      title: "Bien",
      city: "Paris",
      postalCode: "75011",
      address: "12 rue Oberkampf",
      owner: {
        firstName: "A",
        lastName: "B",
        phone: "0600000000",
        email: "a@b.c",
      },
    });
    await service.patch("property:1", { title: "Titre" });
    await service.updateStatus("property:1", "PROSPECTION");
    await service.addParticipant("property:1", { contactId: "contact_1", role: "VENDEUR" });
    await service.listProspects("property:1");
    await service.addProspect("property:1", { userId: "user_1" });
    await service.listVisits("property:1");
    await service.addVisit("property:1", {
      prospectUserId: "user_2",
      startsAt: "2026-02-01T10:00:00.000Z",
      endsAt: "2026-02-01T10:30:00.000Z",
    });
    await service.getRisks("property:1");
    await service.listCalendarVisits("2026-01-01T00:00:00.000Z", "2026-12-31T00:00:00.000Z");

    expect(calls).toEqual([
      ["GET", "/properties", { params: { limit: 100 } }],
      ["GET", "/properties/property%3A1"],
      [
        "POST",
        "/properties",
        {
          body: {
            title: "Bien",
            city: "Paris",
            postalCode: "75011",
            address: "12 rue Oberkampf",
            owner: {
              firstName: "A",
              lastName: "B",
              phone: "0600000000",
              email: "a@b.c",
            },
          },
        },
      ],
      ["PATCH", "/properties/property%3A1", { body: { title: "Titre" } }],
      ["PATCH", "/properties/property%3A1/status", { body: { status: "PROSPECTION" } }],
      [
        "POST",
        "/properties/property%3A1/participants",
        { body: { contactId: "contact_1", role: "VENDEUR" } },
      ],
      ["GET", "/properties/property%3A1/prospects"],
      ["POST", "/properties/property%3A1/prospects", { body: { userId: "user_1" } }],
      ["GET", "/properties/property%3A1/visits"],
      [
        "POST",
        "/properties/property%3A1/visits",
        {
          body: {
            prospectUserId: "user_2",
            startsAt: "2026-02-01T10:00:00.000Z",
            endsAt: "2026-02-01T10:30:00.000Z",
          },
        },
      ],
      ["GET", "/properties/property%3A1/risks"],
      [
        "GET",
        "/visits",
        { params: { from: "2026-01-01T00:00:00.000Z", to: "2026-12-31T00:00:00.000Z" } },
      ],
    ]);
  });

  it("appelle l endpoint comparables avec options", async () => {
    const comparablesResponse: PropertyComparablesResponse = {
      propertyId: "property_1",
      propertyType: "APPARTEMENT",
      source: "LIVE",
      windowYears: 10,
      search: {
        center: { latitude: 48.85, longitude: 2.35 },
        finalRadiusM: 2000,
        radiiTried: [1000, 2000],
        targetCount: 100,
        targetReached: true,
      },
      summary: {
        count: 120,
        medianPrice: 280000,
        medianPricePerM2: 5500,
        minPrice: 150000,
        maxPrice: 680000,
      },
      subject: {
        surfaceM2: 58,
        askingPrice: 320000,
        affinePriceAtSubjectSurface: null,
        predictedPrice: 305000,
        deviationPct: 4.92,
        pricingPosition: "NORMAL",
      },
      regression: {
        slope: 4200,
        intercept: 8000,
        r2: 0.81,
        pointsUsed: 120,
      },
      points: [
        {
          saleDate: "2024-01-10T00:00:00.000Z",
          surfaceM2: 60,
          landSurfaceM2: null,
          salePrice: 300000,
          pricePerM2: 5000,
          distanceM: 320,
          city: "Paris",
          postalCode: "75011",
        },
      ],
    };

    const calls: unknown[][] = [];

    TestBed.configureTestingModule({
      providers: [
        PropertyService,
        {
          provide: ApiClientService,
          useValue: {
            request: (...args: unknown[]) => {
              calls.push(args);
              return Promise.resolve(comparablesResponse);
            },
          },
        },
      ],
    });

    const service = TestBed.inject(PropertyService);
    const response = await service.getComparables("property_1", {
      propertyType: "APPARTEMENT",
      forceRefresh: true,
    });

    expect(response.summary.count).toBe(120);
    expect(calls).toEqual([
      [
        "GET",
        "/properties/property_1/comparables",
        {
          params: {
            propertyType: "APPARTEMENT",
            forceRefresh: true,
          },
        },
      ],
    ]);
  });
});
