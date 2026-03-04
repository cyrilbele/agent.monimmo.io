import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import type { PropertyCreateRequest, PropertyResponse } from "../../core/api.models";
import { PropertyService } from "../../services/property.service";
import { PropertyCreatePageComponent } from "./property-create-page.component";

const buildCreatedProperty = (): PropertyResponse => ({
  id: "property_new_1",
  title: "Maison Antibes",
  city: "Antibes",
  postalCode: "06600",
  address: "12 avenue des Pins",
  price: null,
  details: {},
  status: "PROSPECTION",
  orgId: "org_demo",
  createdAt: "2026-02-01T10:00:00.000Z",
  updatedAt: "2026-02-01T10:00:00.000Z",
});

describe("PropertyCreatePageComponent", () => {
  const setup = (options?: {
    createImpl?: (payload: PropertyCreateRequest) => Promise<PropertyResponse>;
  }) => {
    const createCalls: PropertyCreateRequest[] = [];
    const navigateCalls: unknown[][] = [];

    const propertyServiceMock: Partial<PropertyService> = {
      create: async (payload) => {
        createCalls.push(payload);
        if (options?.createImpl) {
          return options.createImpl(payload);
        }
        return buildCreatedProperty();
      },
    };

    const routerMock: Partial<Router> = {
      navigate: async (...args: unknown[]) => {
        navigateCalls.push(args);
        return true;
      },
    };

    TestBed.configureTestingModule({
      imports: [PropertyCreatePageComponent],
      providers: [
        { provide: PropertyService, useValue: propertyServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });

    const fixture = TestBed.createComponent(PropertyCreatePageComponent);
    const component = fixture.componentInstance;

    return { fixture, component, createCalls, navigateCalls };
  };

  const fillMandatoryPropertyFields = (component: PropertyCreatePageComponent): void => {
    component.form.controls.title.setValue("Maison Antibes");
    component.form.controls.city.setValue("Antibes");
    component.form.controls.postalCode.setValue("06600");
    component.form.controls.address.setValue("12 avenue des Pins");
  };

  it("crée le bien sans propriétaire", async () => {
    const { fixture, component, createCalls, navigateCalls } = setup();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    fillMandatoryPropertyFields(component);
    await component.submit();

    expect(createCalls).toEqual([
      {
        title: "Maison Antibes",
        city: "Antibes",
        postalCode: "06600",
        address: "12 avenue des Pins",
      },
    ]);
    expect(navigateCalls).toEqual([[['/app/bien', 'property_new_1']]]);
  });

  it("bloque la soumission si les champs requis sont incomplets", async () => {
    const { fixture, component, createCalls } = setup();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    await component.submit();

    expect(createCalls).toHaveLength(0);
    expect(component.feedback()).toBe("Veuillez compléter les champs obligatoires.");
    expect(component.pending()).toBe(false);
  });

  it("couvre la garde pending et l'erreur côté création", async () => {
    const { fixture, component, createCalls } = setup({
      createImpl: async () => {
        throw new Error("create error");
      },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    fillMandatoryPropertyFields(component);

    component.pending.set(true);
    await component.submit();
    expect(createCalls).toHaveLength(0);

    component.pending.set(false);
    await component.submit();
    expect(component.feedback()).toBe("create error");
  });
});
