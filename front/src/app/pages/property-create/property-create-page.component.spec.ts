import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { vi } from "vitest";
import type {
  AccountUserListResponse,
  AccountUserResponse,
  PropertyCreateRequest,
  PropertyResponse,
} from "../../core/api.models";
import { PropertyService } from "../../services/property.service";
import { UserService } from "../../services/user.service";
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

const buildClient = (): AccountUserResponse => ({
  id: "client_1",
  email: "alice@example.com",
  firstName: "Alice",
  lastName: "Martin",
  orgId: "org_demo",
  accountType: "CLIENT",
  role: "CLIENT",
  phone: "0600000000",
  address: null,
  postalCode: null,
  city: null,
  personalNotes: null,
  linkedProperties: [],
  createdAt: "2026-02-01T10:00:00.000Z",
  updatedAt: "2026-02-01T10:00:00.000Z",
});

describe("PropertyCreatePageComponent", () => {
  const setup = (options?: {
    listImpl?: () => Promise<AccountUserListResponse>;
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

    const userServiceMock: Partial<UserService> = {
      list:
        options?.listImpl ??
        (() =>
          Promise.resolve({
            items: [],
          } as AccountUserListResponse)),
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

    return { fixture, component, createCalls, navigateCalls };
  };

  const fillMandatoryPropertyFields = (component: PropertyCreatePageComponent): void => {
    component.form.controls.title.setValue("Maison Antibes");
    component.form.controls.city.setValue("Antibes");
    component.form.controls.postalCode.setValue("06600");
    component.form.controls.address.setValue("12 avenue des Pins");
  };

  it("bascule en mode nouveau propriétaire puis crée le bien", async () => {
    const { fixture, component, createCalls, navigateCalls } = setup();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component.setOwnerMode("new");
    fillMandatoryPropertyFields(component);
    component.form.controls.ownerFirstName.setValue("Alice");
    component.form.controls.ownerLastName.setValue("Martin");
    component.form.controls.ownerPhone.setValue("0600000000");
    component.form.controls.ownerEmail.setValue("alice@example.com");

    await component.submit();

    expect(createCalls).toEqual([
      {
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
      },
    ]);
    expect(navigateCalls).toEqual([[["/app/bien", "property_new_1"]]]);
  });

  it("crée le bien avec un client existant sélectionné", async () => {
    const client = buildClient();
    const { fixture, component, createCalls } = setup({
      listImpl: () =>
        Promise.resolve({
          items: [client],
        }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    fillMandatoryPropertyFields(component);
    component.selectOwnerClient(client);

    await component.submit();

    expect(createCalls).toEqual([
      {
        title: "Maison Antibes",
        city: "Antibes",
        postalCode: "06600",
        address: "12 avenue des Pins",
        ownerUserId: "client_1",
      },
    ]);
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

  it("bloque le mode nouveau propriétaire sur email invalide", async () => {
    const { fixture, component, createCalls } = setup();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component.setOwnerMode("new");
    fillMandatoryPropertyFields(component);
    component.form.controls.ownerFirstName.setValue("Alice");
    component.form.controls.ownerLastName.setValue("Martin");
    component.form.controls.ownerPhone.setValue("0600000000");
    component.form.controls.ownerEmail.setValue("email-invalide");

    await component.submit();

    expect(createCalls).toHaveLength(0);
    expect(component.feedback()).toBe("L'email propriétaire est invalide.");
  });

  it("affiche un message quand le chargement des clients échoue", async () => {
    const { fixture, component } = setup({
      listImpl: () => Promise.reject(new Error("network")),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.clientsLoading()).toBe(false);
    expect(component.feedback()).toBe(
      "Impossible de charger les clients existants. Vous pouvez créer un nouveau propriétaire.",
    );
  });

  it("couvre les interactions d'autocomplétion propriétaire", async () => {
    const alice = buildClient();
    const bob: AccountUserResponse = {
      ...buildClient(),
      id: "client_2",
      firstName: "Bob",
      lastName: "Durand",
      email: "bob@example.com",
      phone: "0611111111",
    };
    const { fixture, component } = setup({
      listImpl: () =>
        Promise.resolve({
          items: [alice, bob],
        }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component.onOwnerLookupInput({ target: null } as unknown as Event);
    expect(component.form.controls.ownerLookup.value).toBe("");

    const input = document.createElement("input");
    input.value = "alice@example.com";
    component.onOwnerLookupInput({ target: input } as unknown as Event);
    expect(component.ownerSuggestionsOpen()).toBe(true);
    expect(component.form.controls.ownerUserId.value).toBe("client_1");

    component.onOwnerLookupFocus();
    expect(component.ownerSuggestionsOpen()).toBe(true);

    const container = document.createElement("div");
    const child = document.createElement("button");
    container.appendChild(child);
    component.onOwnerLookupContainerFocusOut(
      { relatedTarget: child } as unknown as FocusEvent,
      container,
    );
    expect(component.ownerSuggestionsOpen()).toBe(true);
    component.onOwnerLookupContainerFocusOut(
      { relatedTarget: null } as unknown as FocusEvent,
      container,
    );
    expect(component.ownerSuggestionsOpen()).toBe(false);

    const preventDefault = vi.fn();
    component.onOwnerSuggestionMouseDown({ preventDefault } as unknown as MouseEvent);
    expect(preventDefault).toHaveBeenCalledOnce();

    component.toggleOwnerSuggestions();
    expect(component.ownerSuggestionsOpen()).toBe(true);
    component.selectOwnerClient(bob);
    expect(component.form.controls.ownerLookup.value).toContain("Bob Durand");
    expect(component.form.controls.ownerUserId.value).toBe("client_2");
    expect(component.ownerSuggestionsOpen()).toBe(false);

    expect(component.ownerOptionLabel({ ...alice, firstName: "", lastName: "", email: null, phone: null })).toBe(
      "Sans nom - Sans contact",
    );
  });

  it("couvre les gardes de submit et les erreurs côté création", async () => {
    const client = buildClient();
    const { fixture, component, createCalls } = setup({
      listImpl: () =>
        Promise.resolve({
          items: [client],
        }),
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

    component.form.controls.ownerLookup.setValue("");
    await component.submit();
    expect(component.feedback()).toBe("Veuillez compléter les champs obligatoires.");

    component.form.controls.ownerLookup.setValue("introuvable");
    await component.submit();
    expect(component.feedback()).toBe("Sélectionnez un client existant dans la liste d'autocomplétion.");

    component.selectOwnerClient(client);
    await component.submit();
    expect(component.feedback()).toBe("create error");

    component.setOwnerMode("new");
    fillMandatoryPropertyFields(component);
    component.form.controls.ownerFirstName.setValue("");
    component.form.controls.ownerLastName.setValue("");
    component.form.controls.ownerPhone.setValue("");
    component.form.controls.ownerEmail.setValue("");
    await component.submit();
    expect(component.feedback()).toBe("Veuillez compléter les champs obligatoires.");
  });

  it("résout un client existant depuis une recherche partielle unique", async () => {
    const client = buildClient();
    const { fixture, component, createCalls } = setup({
      listImpl: () =>
        Promise.resolve({
          items: [client],
        }),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    fillMandatoryPropertyFields(component);
    component.form.controls.ownerLookup.setValue("0600000");
    await component.submit();

    expect(createCalls).toEqual([
      {
        title: "Maison Antibes",
        city: "Antibes",
        postalCode: "06600",
        address: "12 avenue des Pins",
        ownerUserId: "client_1",
      },
    ]);
  });
});
