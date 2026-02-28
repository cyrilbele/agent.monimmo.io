import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { Router } from "@angular/router";
import type { CalendarOptions, EventInput } from "@fullcalendar/core";
import interactionPlugin from "@fullcalendar/interaction";
import { FullCalendarModule } from "@fullcalendar/angular";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import frLocale from "@fullcalendar/core/locales/fr";

import { PropertyService } from "../../services/property.service";

@Component({
  selector: "app-calendar-page",
  imports: [CommonModule, FullCalendarModule],
  templateUrl: "./calendar-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarPageComponent {
  private readonly propertyService = inject(PropertyService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly calendarEvents = signal<EventInput[]>([]);

  readonly calendarOptions = computed<CalendarOptions>(() => ({
    plugins: [interactionPlugin, dayGridPlugin, timeGridPlugin],
    locale: frLocale,
    initialView: "timeGridWeek",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay",
    },
    firstDay: 1,
    allDaySlot: false,
    height: "auto",
    events: this.calendarEvents(),
    eventClick: (clickInfo) => {
      const propertyId = clickInfo.event.extendedProps["propertyId"];
      if (typeof propertyId === "string" && propertyId) {
        void this.router.navigate(["/app/bien", propertyId]);
      }
    },
  }));

  constructor() {
    void this.loadVisits();
  }

  private async loadVisits(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.propertyService.listCalendarVisits();
      this.calendarEvents.set(
        response.items.map((visit) => ({
          id: visit.id,
          title: `${visit.propertyTitle} · ${visit.prospectFirstName} ${visit.prospectLastName}`.trim(),
          start: visit.startsAt,
          end: visit.endsAt,
          extendedProps: {
            propertyId: visit.propertyId,
            prospectUserId: visit.prospectUserId,
          },
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chargement du calendrier impossible.";
      this.error.set(message);
      this.calendarEvents.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
