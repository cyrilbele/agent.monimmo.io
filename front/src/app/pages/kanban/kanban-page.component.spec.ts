import { TestBed } from "@angular/core/testing";
import { RouterTestingModule } from "@angular/router/testing";
import type {
  FileDownloadUrlResponse,
  FileListResponse,
  PropertyListResponse,
  PropertyResponse,
} from "../../core/api.models";
import { FileService } from "../../services/file.service";
import { PropertyService } from "../../services/property.service";
import { KanbanPageComponent } from "./kanban-page.component";

describe("KanbanPageComponent", () => {
  it("affiche la photo HD si presente et fallback prix sur salePriceTtc", async () => {
    const properties: PropertyResponse[] = [
      {
        id: "property_with_photo",
        title: "Maison Valbonne",
        city: "Valbonne",
        postalCode: "06560",
        address: "1 place du Village",
        price: null,
        details: {
          finance: {
            salePriceTtc: "980 000",
          },
        },
        status: "PROSPECTION",
        orgId: "org_demo",
        createdAt: "2026-02-01T10:00:00.000Z",
        updatedAt: "2026-02-01T10:00:00.000Z",
      },
      {
        id: "property_without_photo",
        title: "Appartement Cannes",
        city: "Cannes",
        postalCode: "06400",
        address: "2 rue du Port",
        price: 450000,
        details: {},
        status: "PROSPECTION",
        orgId: "org_demo",
        createdAt: "2026-02-01T10:00:00.000Z",
        updatedAt: "2026-02-01T10:00:00.000Z",
      },
    ];

    const propertyServiceMock: Partial<PropertyService> = {
      list: () =>
        Promise.resolve({
          items: properties,
        } as PropertyListResponse),
    };

    const fileServiceMock: Partial<FileService> = {
      listByProperty: (propertyId: string) => {
        if (propertyId === "property_with_photo") {
          return Promise.resolve({
            items: [
              {
                id: "file_photo_1",
                propertyId,
                typeDocument: "PHOTOS_HD",
                fileName: "photo.jpg",
                mimeType: "image/jpeg",
                size: 1234,
                status: "UPLOADED",
                storageKey: "photo.jpg",
                createdAt: "2026-02-01T10:00:00.000Z",
              },
            ],
          } as FileListResponse);
        }

        return Promise.resolve({
          items: [],
        } as FileListResponse);
      },
      getDownloadUrl: () =>
        Promise.resolve({
          url: "https://cdn.demo/photo.jpg",
          expiresAt: "2026-02-01T12:00:00.000Z",
        } as FileDownloadUrlResponse),
    };

    TestBed.configureTestingModule({
      imports: [KanbanPageComponent, RouterTestingModule],
      providers: [
        { provide: PropertyService, useValue: propertyServiceMock },
        { provide: FileService, useValue: fileServiceMock },
      ],
    });

    const fixture = TestBed.createComponent(KanbanPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.loadProperties();
    await fixture.whenStable();
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement as HTMLElement;
    const propertyCards = root.querySelectorAll("article[aria-label^='Ouvrir le bien']");
    expect(propertyCards.length).toBeGreaterThanOrEqual(2);

    const withPhotoCard = Array.from(propertyCards).find((card) =>
      (card.textContent ?? "").includes("Maison Valbonne"),
    ) as HTMLElement | undefined;
    const withoutPhotoCard = Array.from(propertyCards).find((card) =>
      (card.textContent ?? "").includes("Appartement Cannes"),
    ) as HTMLElement | undefined;

    expect(withPhotoCard).toBeDefined();
    expect(withoutPhotoCard).toBeDefined();
    expect(withPhotoCard?.querySelector("img")).not.toBeNull();
    expect(withoutPhotoCard?.querySelector("img")).toBeNull();
    expect(withPhotoCard?.textContent ?? "").toContain("980k€");
  });
});
