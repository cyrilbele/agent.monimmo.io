import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { RouterTestingModule } from "@angular/router/testing";
import { vi } from "vitest";
import type {
  FileDownloadUrlResponse,
  FileListResponse,
  PropertyListResponse,
  PropertyResponse,
} from "../../core/api.models";
import { FileService } from "../../services/file.service";
import { PropertyService } from "../../services/property.service";
import { KanbanPageComponent } from "./kanban-page.component";

const baseProperties = (): PropertyResponse[] => [
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

describe("KanbanPageComponent", () => {
  const setup = (options?: {
    listImpl?: () => Promise<PropertyListResponse>;
    updateStatusImpl?: (propertyId: string) => Promise<PropertyResponse>;
    listByPropertyImpl?: (propertyId: string) => Promise<FileListResponse>;
    getDownloadUrlImpl?: () => Promise<FileDownloadUrlResponse>;
  }) => {
    const properties = baseProperties();
    const updateStatusCalls: Array<{ propertyId: string; status: string }> = [];

    const propertyServiceMock: Partial<PropertyService> = {
      list:
        options?.listImpl ??
        (() =>
          Promise.resolve({
            items: properties,
          } as PropertyListResponse)),
      updateStatus: async (propertyId, status) => {
        updateStatusCalls.push({ propertyId, status });
        if (options?.updateStatusImpl) {
          return options.updateStatusImpl(propertyId);
        }
        return {
          ...properties[0],
          id: propertyId,
          status,
        };
      },
    };

    const fileServiceMock: Partial<FileService> = {
      listByProperty:
        options?.listByPropertyImpl ??
        ((propertyId: string) => {
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
        }),
      getDownloadUrl:
        options?.getDownloadUrlImpl ??
        (() =>
          Promise.resolve({
            url: "https://cdn.demo/photo.jpg",
            expiresAt: "2026-02-01T12:00:00.000Z",
          } as FileDownloadUrlResponse)),
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
    return { fixture, component, updateStatusCalls };
  };

  it("affiche la photo HD si présente et fallback prix sur salePriceTtc", async () => {
    const { fixture, component } = setup();
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

  it("gère le drag & drop et met à jour le statut d'un bien", async () => {
    const { fixture, component, updateStatusCalls } = setup();
    fixture.detectChanges();
    await component.loadProperties();
    await fixture.whenStable();
    fixture.detectChanges();

    component.draggingPropertyId.set("property_with_photo");
    component.draggingFromStatus.set("PROSPECTION");

    await component.onColumnDrop(
      "VISITES",
      {
        preventDefault: vi.fn(),
      } as unknown as DragEvent,
    );

    expect(updateStatusCalls).toEqual([{ propertyId: "property_with_photo", status: "VISITES" }]);
    expect(component.draggingPropertyId()).toBeNull();
    expect(component.draggingFromStatus()).toBeNull();
    expect(component.dropTargetStatus()).toBeNull();
  });

  it("gère les erreurs de chargement et de mise à jour", async () => {
    const { fixture, component } = setup({
      listImpl: () => Promise.reject(new Error("load error")),
      updateStatusImpl: () => Promise.reject(new Error("update error")),
      listByPropertyImpl: () => Promise.reject(new Error("image error")),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.error()).toBe("load error");

    component.properties.set(baseProperties());
    component.draggingPropertyId.set("property_with_photo");
    component.draggingFromStatus.set("PROSPECTION");
    await component.onColumnDrop(
      "VISITES",
      {
        preventDefault: vi.fn(),
      } as unknown as DragEvent,
    );

    expect(component.error()).toBe("update error");
  });

  it("couvre les helpers d'affichage et de filtres de colonnes", async () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    await component.loadProperties();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.columnItems("PROSPECTION").length).toBeGreaterThan(0);
    expect(component.columnDropClass("PROSPECTION")).toContain("border-slate-200");
    component.dropTargetStatus.set("PROSPECTION");
    expect(component.columnDropClass("PROSPECTION")).toContain("ring-2");

    expect(component.formatPrice(null)).toBe("Prix à définir");
    expect(component.formatPrice(980000)).toBe("980k€");
    expect(component.formatPrice(1200000)).toBe("1200.0k€");

    expect(
      component.propertyLocationLabel({
        ...baseProperties()[0],
        address: null,
      }),
    ).toBe("Valbonne");
    expect(
      component.propertyLocationLabel({
        ...baseProperties()[0],
        city: "",
      }),
    ).toBe("1 place du Village");
    expect(
      component.propertyLocationLabel({
        ...baseProperties()[0],
        address: null,
        city: "",
      }),
    ).toBe("Adresse non renseignée");

    expect(component.resolveDisplayPrice(baseProperties()[0])).toBe(980000);
    expect(
      component.resolveDisplayPrice({
        ...baseProperties()[0],
        details: { finance: { salePriceTtc: "1 250 000,50 €" } },
      }),
    ).toBe(1250000.5);
    expect(
      component.resolveDisplayPrice({
        ...baseProperties()[0],
        details: {},
      }),
    ).toBeNull();
  });

  it("couvre les handlers drag and drop et la navigation", async () => {
    const { fixture, component, updateStatusCalls } = setup();
    fixture.detectChanges();
    await component.loadProperties();
    await fixture.whenStable();
    fixture.detectChanges();

    const preventDefault = vi.fn();
    const setData = vi.fn();
    const dragEvent = {
      dataTransfer: {
        effectAllowed: "",
        dropEffect: "",
        setData,
      },
      preventDefault,
    } as unknown as DragEvent;

    component.onCardDragStart(baseProperties()[0], dragEvent);
    expect(component.draggingPropertyId()).toBe("property_with_photo");
    expect(component.draggingFromStatus()).toBe("PROSPECTION");
    expect(setData).toHaveBeenCalledWith("text/plain", "property_with_photo");

    component.onColumnDragOver("VISITES", dragEvent);
    expect(preventDefault).toHaveBeenCalled();
    expect(component.dropTargetStatus()).toBe("VISITES");

    await component.onColumnDrop("VISITES", dragEvent);
    expect(updateStatusCalls).toEqual([{ propertyId: "property_with_photo", status: "VISITES" }]);

    component.draggingPropertyId.set("property_with_photo");
    component.draggingFromStatus.set("VISITES");
    await component.onColumnDrop("VISITES", dragEvent);
    expect(component.draggingPropertyId()).toBeNull();
    expect(component.draggingFromStatus()).toBeNull();

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, "navigate").mockResolvedValue(true);
    const keyboardPreventDefault = vi.fn();
    component.draggingPropertyId.set("property_with_photo");
    component.openProperty("property_with_photo");
    expect(navigateSpy).not.toHaveBeenCalled();

    component.draggingPropertyId.set(null);
    component.openPropertyFromKeyboard(
      "property_with_photo",
      { preventDefault: keyboardPreventDefault } as unknown as Event,
    );
    expect(keyboardPreventDefault).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(["/app/bien", "property_with_photo"]);
    navigateSpy.mockRestore();
  });

  it("couvre les branches de drag leave et de parsing prix", async () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    await component.loadProperties();
    await fixture.whenStable();
    fixture.detectChanges();

    component.dropTargetStatus.set("PROSPECTION");
    component.onColumnDragLeave("PROSPECTION", { currentTarget: null } as unknown as DragEvent);
    expect(component.dropTargetStatus()).toBe("PROSPECTION");

    const container = document.createElement("div");
    const child = document.createElement("span");
    container.appendChild(child);
    component.onColumnDragLeave(
      "PROSPECTION",
      {
        currentTarget: container,
        relatedTarget: child,
      } as unknown as DragEvent,
    );
    expect(component.dropTargetStatus()).toBe("PROSPECTION");

    component.onColumnDragLeave(
      "PROSPECTION",
      {
        currentTarget: container,
        relatedTarget: null,
      } as unknown as DragEvent,
    );
    expect(component.dropTargetStatus()).toBeNull();

    expect(
      component.resolveDisplayPrice({
        ...baseProperties()[0],
        details: null as unknown as Record<string, unknown>,
      }),
    ).toBeNull();
    expect(
      component.resolveDisplayPrice({
        ...baseProperties()[0],
        details: { finance: { salePriceTtc: 999999 } },
      }),
    ).toBe(999999);
    expect(
      component.resolveDisplayPrice({
        ...baseProperties()[0],
        details: { finance: { salePriceTtc: " " } },
      }),
    ).toBeNull();
    expect(
      component.resolveDisplayPrice({
        ...baseProperties()[0],
        details: { finance: { salePriceTtc: "abc" } },
      }),
    ).toBeNull();
  });

  it("retourne null pour l'image en cas d'erreur de fichier", async () => {
    const { fixture, component } = setup({
      listByPropertyImpl: () => Promise.reject(new Error("images failed")),
    });
    fixture.detectChanges();
    await component.loadProperties();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.propertyImageUrl("property_with_photo")).toBeNull();
    expect(component.propertyImageUrl("property_without_photo")).toBeNull();
  });
});
