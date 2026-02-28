import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";

import type {
  AccountUserDetailResponse,
  AccountUserLinkedPropertyResponse,
  PropertyVisitResponse,
} from "../../core/api.models";
import { PropertyService } from "../../services/property.service";
import { isEmailValid } from "../../core/auth-helpers";
import { UserService } from "../../services/user.service";

type UserFormGroup = FormGroup<{
  firstName: FormControl<string>;
  lastName: FormControl<string>;
  email: FormControl<string>;
  phone: FormControl<string>;
  address: FormControl<string>;
  postalCode: FormControl<string>;
  city: FormControl<string>;
  personalNotes: FormControl<string>;
}>;

type VisitedObjectSummary = {
  propertyId: string;
  propertyTitle: string;
  latestVisitId: string;
  latestStartsAt: string;
  latestEndsAt: string;
  visitsCount: number;
};

@Component({
  selector: "app-user-detail-page",
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: "./user-detail-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly userService = inject(UserService);
  private readonly propertyService = inject(PropertyService);
  private readonly formBuilder = inject(FormBuilder);

  readonly userId = this.route.snapshot.paramMap.get("id") ?? "";
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly user = signal<AccountUserDetailResponse | null>(null);
  readonly editing = signal(false);
  readonly savePending = signal(false);
  readonly feedback = signal<string | null>(null);
  readonly userVisits = signal<PropertyVisitResponse[]>([]);
  readonly visitsLoading = signal(false);
  readonly visitsError = signal<string | null>(null);

  readonly form: UserFormGroup = this.formBuilder.nonNullable.group({
    firstName: [""],
    lastName: [""],
    email: [""],
    phone: [""],
    address: [""],
    postalCode: [""],
    city: [""],
    personalNotes: [""],
  });

  readonly linkedProperties = computed<AccountUserLinkedPropertyResponse[]>(() => {
    return this.user()?.linkedProperties ?? [];
  });

  readonly visitedObjects = computed<VisitedObjectSummary[]>(() => {
    const grouped = new Map<string, VisitedObjectSummary>();

    for (const visit of this.userVisits()) {
      const current = grouped.get(visit.propertyId);
      if (!current) {
        grouped.set(visit.propertyId, {
          propertyId: visit.propertyId,
          propertyTitle: visit.propertyTitle,
          latestVisitId: visit.id,
          latestStartsAt: visit.startsAt,
          latestEndsAt: visit.endsAt,
          visitsCount: 1,
        });
        continue;
      }

      const nextCount = current.visitsCount + 1;
      if (visit.startsAt > current.latestStartsAt) {
        grouped.set(visit.propertyId, {
          propertyId: visit.propertyId,
          propertyTitle: visit.propertyTitle,
          latestVisitId: visit.id,
          latestStartsAt: visit.startsAt,
          latestEndsAt: visit.endsAt,
          visitsCount: nextCount,
        });
      } else {
        grouped.set(visit.propertyId, {
          ...current,
          visitsCount: nextCount,
        });
      }
    }

    return [...grouped.values()].sort((a, b) => b.latestStartsAt.localeCompare(a.latestStartsAt));
  });

  ngOnInit(): void {
    if (!this.userId) {
      this.loading.set(false);
      this.error.set("Identifiant utilisateur manquant.");
      return;
    }

    void this.loadUser();
  }

  async loadUser(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.userVisits.set([]);
    this.visitsError.set(null);

    try {
      const user = await this.userService.getById(this.userId);
      this.user.set(user);
      this.patchForm(user);
      void this.loadUserVisits();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chargement impossible.";
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  startEditing(): void {
    this.feedback.set(null);
    this.editing.set(true);
  }

  cancelEditing(): void {
    const user = this.user();
    if (!user) {
      return;
    }

    this.patchForm(user);
    this.feedback.set(null);
    this.editing.set(false);
  }

  async saveUser(): Promise<void> {
    const user = this.user();
    if (!user || this.savePending()) {
      return;
    }

    this.savePending.set(true);
    this.feedback.set("Mise à jour en cours...");

    const firstName = this.form.controls.firstName.value.trim();
    const lastName = this.form.controls.lastName.value.trim();
    const email = this.normalizeEmptyAsNull(this.form.controls.email.value)?.toLowerCase() ?? null;
    const phone = this.normalizeEmptyAsNull(this.form.controls.phone.value);

    if (!email && !phone) {
      this.feedback.set("Renseignez au moins un email ou un téléphone.");
      this.savePending.set(false);
      return;
    }

    if (email && !isEmailValid(email)) {
      this.feedback.set("L'email est invalide.");
      this.savePending.set(false);
      return;
    }

    try {
      const updated = await this.userService.patch(this.userId, {
        firstName,
        lastName,
        email,
        phone,
        address: this.normalizeEmptyAsNull(this.form.controls.address.value),
        postalCode: this.normalizeEmptyAsNull(this.form.controls.postalCode.value),
        city: this.normalizeEmptyAsNull(this.form.controls.city.value),
        personalNotes: this.normalizeEmptyAsNull(this.form.controls.personalNotes.value),
      });

      this.user.set(updated);
      this.patchForm(updated);
      this.editing.set(false);
      this.feedback.set("Informations utilisateur mises à jour.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mise à jour impossible.";
      this.feedback.set(message);
    } finally {
      this.savePending.set(false);
    }
  }

  displayValue(value: string | null): string {
    return value && value.trim() ? value : "Non renseigné";
  }

  displayUserName(user: AccountUserDetailResponse): string {
    const fullName = `${user.firstName} ${user.lastName}`.trim();
    if (fullName) {
      return fullName;
    }

    if (user.email) {
      return user.email;
    }

    if (user.phone) {
      return user.phone;
    }

    return "Sans nom";
  }

  accountTypeLabel(accountType: string): string {
    switch (accountType) {
      case "AGENT":
        return "Agent";
      case "CLIENT":
        return "Client";
      case "NOTAIRE":
        return "Notaire";
      default:
        return accountType;
    }
  }

  relationLabel(role: string): string {
    switch (role) {
      case "OWNER":
        return "Propriétaire";
      case "PROSPECT":
      case "ACHETEUR":
        return "Prospect";
      case "VENDEUR":
        return "Vendeur";
      default:
        return role;
    }
  }

  statusLabel(status: string): string {
    switch (status) {
      case "PROSPECTION":
        return "Prospection";
      case "MANDAT_SIGNE":
        return "Mandat signé";
      case "EN_DIFFUSION":
        return "En diffusion";
      case "VISITES":
        return "Visites";
      case "OFFRES":
        return "Offres";
      case "COMPROMIS":
        return "Compromis";
      case "VENDU":
        return "Vendu";
      case "ARCHIVE":
        return "Archivé";
      default:
        return status;
    }
  }

  private patchForm(user: AccountUserDetailResponse): void {
    this.form.setValue({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email ?? "",
      phone: user.phone ?? "",
      address: user.address ?? "",
      postalCode: user.postalCode ?? "",
      city: user.city ?? "",
      personalNotes: user.personalNotes ?? "",
    });
  }

  private normalizeEmptyAsNull(value: string): string | null {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private async loadUserVisits(): Promise<void> {
    this.visitsLoading.set(true);
    this.visitsError.set(null);

    try {
      const response = await this.propertyService.listCalendarVisits();
      const filtered = response.items
        .filter((visit) => visit.prospectUserId === this.userId)
        .slice()
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
      this.userVisits.set(filtered);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chargement des visites impossible.";
      this.visitsError.set(message);
      this.userVisits.set([]);
    } finally {
      this.visitsLoading.set(false);
    }
  }
}
