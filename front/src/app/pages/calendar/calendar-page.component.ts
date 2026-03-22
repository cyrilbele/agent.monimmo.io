import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import type {
  CalendarOptions,
  DateSelectArg,
  EventClickArg,
  EventInput,
} from "@fullcalendar/core";
import interactionPlugin from "@fullcalendar/interaction";
import { FullCalendarModule } from "@fullcalendar/angular";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import frLocale from "@fullcalendar/core/locales/fr";

import type {
  AccountUserResponse,
  CalendarAppointmentCreateRequest,
  RdvResponse,
} from "../../core/api.models";
import { PropertyService } from "../../services/property.service";
import { UserService } from "../../services/user.service";

type PropertyOption = {
  id: string;
  label: string;
  address: string | null;
};

type ClientOption = {
  id: string;
  label: string;
};

const CALENDAR_COMPACT_MEDIA_QUERY = "(max-width: 1024px)";

@Component({
  selector: "app-calendar-page",
  imports: [CommonModule, FullCalendarModule, ReactiveFormsModule],
  templateUrl: "./calendar-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarPageComponent implements OnDestroy {
  private readonly propertyService = inject(PropertyService);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  private readonly compactMediaQuery =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(CALENDAR_COMPACT_MEDIA_QUERY)
      : null;
  private readonly onCompactMediaQueryChange = (event: MediaQueryListEvent): void => {
    this.isCompactLayout.set(event.matches);
  };

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly calendarEvents = signal<EventInput[]>([]);
  readonly properties = signal<PropertyOption[]>([]);
  readonly clients = signal<ClientOption[]>([]);
  readonly appointmentModalOpen = signal(false);
  readonly appointmentPending = signal(false);
  readonly appointmentFeedback = signal<string | null>(null);
  readonly isCompactLayout = signal(this.compactMediaQuery?.matches ?? false);

  readonly appointmentForm = this.formBuilder.nonNullable.group({
    title: ["Rendez-vous"],
    propertyId: [""],
    userId: [""],
    startsAt: [""],
    endsAt: [""],
    address: [""],
    comment: [""],
  });

  readonly selectedPropertyAddress = computed(() => {
    const propertyId = this.appointmentForm.controls.propertyId.value;
    if (!propertyId) {
      return null;
    }

    const property = this.properties().find((item) => item.id === propertyId);
    return property?.address ?? null;
  });

  readonly hasProperties = computed(() => this.properties().length > 0);

  readonly calendarOptions = computed<CalendarOptions>(() => ({
    plugins: [interactionPlugin, dayGridPlugin, timeGridPlugin],
    locale: frLocale,
    initialView: this.isCompactLayout() ? "timeGridDay" : "timeGridWeek",
    headerToolbar: {
      left: this.isCompactLayout() ? "prev,next" : "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay",
    },
    firstDay: 1,
    allDaySlot: false,
    selectable: true,
    selectMirror: true,
    height: "auto",
    events: this.calendarEvents(),
    select: (selectInfo) => {
      this.onCalendarSelect(selectInfo);
    },
    eventClick: (clickInfo) => {
      this.onCalendarEventClick(clickInfo);
    },
  }));

  constructor() {
    this.compactMediaQuery?.addEventListener("change", this.onCompactMediaQueryChange);
    void this.loadCalendarData();
  }

  ngOnDestroy(): void {
    this.compactMediaQuery?.removeEventListener("change", this.onCompactMediaQueryChange);
  }

  onAppointmentBackdropClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    this.closeAppointmentModal();
  }

  closeAppointmentModal(): void {
    this.appointmentModalOpen.set(false);
    this.appointmentFeedback.set(null);
  }

  async createAppointment(): Promise<void> {
    if (this.appointmentPending()) {
      return;
    }

    const raw = this.appointmentForm.getRawValue();
    const title = raw.title.trim();

    if (!title) {
      this.appointmentFeedback.set("Le titre du rendez-vous est requis.");
      return;
    }

    if (!raw.propertyId) {
      this.appointmentFeedback.set("Veuillez selectionner un bien.");
      return;
    }

    const startsAt = this.parseLocalDateTime(raw.startsAt);
    const endsAt = this.parseLocalDateTime(raw.endsAt);

    if (!startsAt || !endsAt) {
      this.appointmentFeedback.set("Les horaires du rendez-vous sont invalides.");
      return;
    }

    if (endsAt.getTime() <= startsAt.getTime()) {
      this.appointmentFeedback.set("L'heure de fin doit etre apres l'heure de debut.");
      return;
    }

    const payload: CalendarAppointmentCreateRequest = {
      title,
      propertyId: raw.propertyId,
      userId: raw.userId.trim() ? raw.userId : null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      address: raw.address.trim() ? raw.address.trim() : null,
      comment: raw.comment.trim() ? raw.comment.trim() : null,
    };

    this.appointmentPending.set(true);
    this.appointmentFeedback.set(null);

    try {
      await this.propertyService.createCalendarAppointment(payload);
      await this.loadCalendarData();
      this.closeAppointmentModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Creation du rendez-vous impossible.";
      this.appointmentFeedback.set(message);
    } finally {
      this.appointmentPending.set(false);
    }
  }

  private onCalendarSelect(selectInfo: DateSelectArg): void {
    const start = selectInfo.start;
    const endCandidate = selectInfo.end;
    const end =
      endCandidate.getTime() > start.getTime()
        ? endCandidate
        : new Date(start.getTime() + 60 * 60 * 1000);

    const fallbackPropertyId = this.appointmentForm.controls.propertyId.value || this.properties()[0]?.id || "";

    this.appointmentForm.setValue({
      title: "Rendez-vous",
      propertyId: fallbackPropertyId,
      userId: this.appointmentForm.controls.userId.value || "",
      startsAt: this.toLocalDateTimeInputValue(start),
      endsAt: this.toLocalDateTimeInputValue(end),
      address: "",
      comment: "",
    });

    this.appointmentFeedback.set(null);
    this.appointmentModalOpen.set(true);
    selectInfo.view.calendar.unselect();
  }

  private onCalendarEventClick(clickInfo: EventClickArg): void {
    const eventId = clickInfo.event.id;

    if (typeof eventId !== "string" || !eventId) {
      return;
    }

    void this.router.navigate(["/app/rdv", eventId]);
  }

  private async loadCalendarData(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [rdvResponse, propertiesResponse, clientsResponse] = await Promise.all([
        this.propertyService.listRdv(),
        this.propertyService.list(100),
        this.userService.list(100, undefined, "CLIENT"),
      ]);

      const propertyOptions = propertiesResponse.items.map((property) => ({
        id: property.id,
        label: `${property.title} · ${property.postalCode} ${property.city}`,
        address: this.buildPropertyAddress(property.address, property.postalCode, property.city),
      }));
      const clientOptions = clientsResponse.items.map((client) => ({
        id: client.id,
        label: this.buildClientLabel(client),
      }));

      this.properties.set(propertyOptions);
      this.clients.set(clientOptions);
      this.ensureSelectedPropertyExists(propertyOptions);
      this.ensureSelectedClientExists(clientOptions);

      this.calendarEvents.set(rdvResponse.items.map((rdv) => this.toRdvCalendarEvent(rdv)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chargement du calendrier impossible.";
      this.error.set(message);
      this.calendarEvents.set([]);
      this.properties.set([]);
      this.clients.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private toRdvCalendarEvent(rdv: RdvResponse): EventInput {
    const clientLabel = [rdv.userFirstName, rdv.userLastName]
      .filter((part): part is string => Boolean(part))
      .join(" ")
      .trim();
    const title = clientLabel ? `${rdv.title} · ${clientLabel}` : rdv.title;
    const isManualAppointment = rdv.rdvType === "RENDEZ_VOUS";

    return {
      id: rdv.id,
      title,
      start: rdv.startsAt,
      end: rdv.endsAt,
      backgroundColor: isManualAppointment ? "#0f766e" : undefined,
      borderColor: isManualAppointment ? "#0f766e" : undefined,
      extendedProps: {
        rdvType: rdv.rdvType,
        propertyId: rdv.propertyId,
        userId: rdv.userId,
        address: rdv.address,
        comment: rdv.comment,
      },
    };
  }

  private ensureSelectedPropertyExists(options: PropertyOption[]): void {
    const selected = this.appointmentForm.controls.propertyId.value;
    if (!selected && options.length > 0) {
      this.appointmentForm.controls.propertyId.setValue(options[0]!.id);
      return;
    }

    if (selected && !options.some((option) => option.id === selected)) {
      this.appointmentForm.controls.propertyId.setValue(options[0]?.id ?? "");
    }
  }

  private ensureSelectedClientExists(options: ClientOption[]): void {
    const selected = this.appointmentForm.controls.userId.value;
    if (!selected) {
      return;
    }

    if (!options.some((option) => option.id === selected)) {
      this.appointmentForm.controls.userId.setValue("");
    }
  }

  private parseLocalDateTime(rawValue: string): Date | null {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  }

  private toLocalDateTimeInputValue(value: Date): string {
    const pad = (input: number): string => String(input).padStart(2, "0");

    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(
      value.getHours(),
    )}:${pad(value.getMinutes())}`;
  }

  private buildPropertyAddress(
    address: string | null | undefined,
    postalCode: string,
    city: string,
  ): string | null {
    const parts = [address?.trim() ?? "", `${postalCode} ${city}`.trim()].filter((part) => part);
    return parts.length > 0 ? parts.join(", ") : null;
  }

  private buildClientLabel(client: AccountUserResponse): string {
    const fullName = `${client.firstName} ${client.lastName}`.trim();
    const contact = client.email?.trim() || client.phone?.trim() || "Sans contact";
    return `${fullName} · ${contact}`;
  }
}
