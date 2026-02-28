import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import type {
  AccountUserListResponse,
  PropertyCreateRequest,
  PropertyResponse,
} from "../../core/api.models";
import { PropertyService } from "../../services/property.service";
import { UserService } from "../../services/user.service";
import { PropertyCreatePageComponent } from "./property-create-page.component";

describe("PropertyCreatePageComponent", () => {
  it("bascule en mode nouveau proprietaire puis cree le bien", async () => {
    const createCalls: PropertyCreateRequest[] = [];
    const navigateCalls: unknown[][] = [];

    const createdProperty: PropertyResponse = {
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
    };

    const propertyServiceMock: Partial<PropertyService> = {
      create: async (payload) => {
        createCalls.push(payload);
        return createdProperty;
      },
    };

    const userServiceMock: Partial<UserService> = {
      list: () => Promise.resolve({ items: [] } as AccountUserListResponse),
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
        { provide: UserService, useValue: userServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });

    const fixture = TestBed.createComponent(PropertyCreatePageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const newOwnerButton = Array.from(
      fixture.nativeElement.querySelectorAll("button"),
    ).find((button) =>
      String((button as HTMLButtonElement).textContent ?? "")
        .trim()
        .includes("Creer un nouveau proprietaire"),
    ) as HTMLButtonElement | undefined;

    expect(newOwnerButton).toBeDefined();
    newOwnerButton?.click();
    fixture.detectChanges();

    expect(component.ownerMode()).toBe("new");

    component.form.controls.title.setValue("Maison Antibes");
    component.form.controls.city.setValue("Antibes");
    component.form.controls.postalCode.setValue("06600");
    component.form.controls.address.setValue("12 avenue des Pins");
    component.form.controls.ownerFirstName.setValue("Alice");
    component.form.controls.ownerLastName.setValue("Martin");
    component.form.controls.ownerPhone.setValue("0600000000");
    component.form.controls.ownerEmail.setValue("alice@example.com");

    await component.submit();

    expect(createCalls.length).toBe(1);
    expect(createCalls[0]).toEqual({
      title: "Maison Antibes",
      city: "Antibes",
      postalCode: "06600",
      address: "12 avenue des Pins",
      owner: {
        firstName: "Alice",
        lastName: "Martin",
        phone: "0600000000",
        email: "alice@example.com",
      },
    });
    expect(navigateCalls).toEqual([[["/app/bien", "property_new_1"]]]);
  });
});
