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
} from "../../core/api.models";
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
}>;

@Component({
  selector: "app-user-detail-page",
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: "./user-detail-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly userService = inject(UserService);
  private readonly formBuilder = inject(FormBuilder);

  readonly userId = this.route.snapshot.paramMap.get("id") ?? "";
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly user = signal<AccountUserDetailResponse | null>(null);
  readonly editing = signal(false);
  readonly savePending = signal(false);
  readonly feedback = signal<string | null>(null);

  readonly form: UserFormGroup = this.formBuilder.nonNullable.group({
    firstName: [""],
    lastName: [""],
    email: [""],
    phone: [""],
    address: [""],
    postalCode: [""],
    city: [""],
  });

  readonly linkedProperties = computed<AccountUserLinkedPropertyResponse[]>(() => {
    return this.user()?.linkedProperties ?? [];
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

    try {
      const user = await this.userService.getById(this.userId);
      this.user.set(user);
      this.patchForm(user);
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
    this.feedback.set("Mise a jour en cours...");

    const firstName = this.form.controls.firstName.value.trim();
    const lastName = this.form.controls.lastName.value.trim();
    const email = this.normalizeEmptyAsNull(this.form.controls.email.value)?.toLowerCase() ?? null;
    const phone = this.normalizeEmptyAsNull(this.form.controls.phone.value);

    if (!email && !phone) {
      this.feedback.set("Renseignez au moins un email ou un telephone.");
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
      });

      this.user.set(updated);
      this.patchForm(updated);
      this.editing.set(false);
      this.feedback.set("Informations utilisateur mises a jour.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mise a jour impossible.";
      this.feedback.set(message);
    } finally {
      this.savePending.set(false);
    }
  }

  displayValue(value: string | null): string {
    return value && value.trim() ? value : "Non renseigne";
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
        return "Proprietaire";
      case "PROSPECT":
      case "ACHETEUR":
        return "Prospect";
      case "VENDEUR":
        return "Vendeur";
      default:
        return role;
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
    });
  }

  private normalizeEmptyAsNull(value: string): string | null {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
}
