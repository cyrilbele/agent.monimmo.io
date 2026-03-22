import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { RouterTestingModule } from "@angular/router/testing";
import type { EventClickArg } from "@fullcalendar/core";
import { vi } from "vitest";
import type {
  AccountUserListResponse,
  PropertyListResponse,
  RdvListResponse,
} from "../../core/api.models";
import { PropertyService } from "../../services/property.service";
import { UserService } from "../../services/user.service";
import { CalendarPageComponent } from "./calendar-page.component";

describe("CalendarPageComponent", () => {
  const setup = () => {
    const propertyServiceMock: Partial<PropertyService> = {
      listRdv: () =>
        Promise.resolve({
          items: [],
        } as RdvListResponse),
      list: () =>
        Promise.resolve({
          items: [],
        } as PropertyListResponse),
    };

    const userServiceMock: Partial<UserService> = {
      list: () =>
        Promise.resolve({
          items: [],
        } as AccountUserListResponse),
    };

    TestBed.configureTestingModule({
      imports: [CalendarPageComponent, RouterTestingModule],
      providers: [
        { provide: PropertyService, useValue: propertyServiceMock },
        { provide: UserService, useValue: userServiceMock },
      ],
    });

    const fixture = TestBed.createComponent(CalendarPageComponent);
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    return { fixture, component, router };
  };

  it("ouvre la fiche visite quand on clique une visite dans le calendrier", async () => {
    const { fixture, component, router } = setup();
    const navigateSpy = vi.spyOn(router, "navigate").mockResolvedValue(true);

    fixture.detectChanges();
    await fixture.whenStable();

    component.calendarOptions().eventClick?.({
      event: {
        id: "visit_1",
        extendedProps: { kind: "VISIT" },
      },
    } as unknown as EventClickArg);

    expect(navigateSpy).toHaveBeenCalledWith(["/app/rdv", "visit_1"]);
  });

  it("ouvre la fiche rendez-vous quand on clique un rendez-vous dans le calendrier", async () => {
    const { fixture, component, router } = setup();
    const navigateSpy = vi.spyOn(router, "navigate").mockResolvedValue(true);

    fixture.detectChanges();
    await fixture.whenStable();

    component.calendarOptions().eventClick?.({
      event: {
        id: "rdv_1",
        extendedProps: { kind: "APPOINTMENT" },
      },
    } as unknown as EventClickArg);

    expect(navigateSpy).toHaveBeenCalledWith(["/app/rdv", "rdv_1"]);
  });
});
