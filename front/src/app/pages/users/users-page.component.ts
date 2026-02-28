import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { RouterLink } from "@angular/router";

import type { AccountUserCreateRequest, AccountUserResponse } from "../../core/api.models";
import { isEmailValid } from "../../core/auth-helpers";
import { UserService } from "../../services/user.service";

type CreatableAccountType = "CLIENT" | "NOTAIRE";

@Component({
  selector: "app-users-page",
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: "./users-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersPageComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly formBuilder = inject(FormBuilder);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly users = signal<AccountUserResponse[]>([]);
  readonly createModalOpen = signal(false);
  readonly createPending = signal(false);
  readonly createFeedback = signal<string | null>(null);

  readonly usersCount = computed(() => this.users().length);
  readonly createLabel = computed(() =>
    this.createPending() ? "Création..." : "Créer l'utilisateur",
  );

  readonly createUserForm = this.formBuilder.nonNullable.group({
    accountType: ["CLIENT" as CreatableAccountType, [Validators.required]],
    firstName: [""],
    lastName: [""],
    email: [""],
    phone: [""],
    address: [""],
    postalCode: [""],
    city: [""],
    personalNotes: [""],
  });

  ngOnInit(): void {
    void this.loadUsers();
  }

  async loadUsers(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.userService.list(100);
      this.users.set(response.items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chargement impossible.";
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  openCreateModal(): void {
    this.createUserForm.reset({
      accountType: "CLIENT",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      address: "",
      postalCode: "",
      city: "",
      personalNotes: "",
    });
    this.createFeedback.set(null);
    this.createModalOpen.set(true);
  }

  closeCreateModal(): void {
    if (this.createPending()) {
      return;
    }

    this.createModalOpen.set(false);
  }

  onCreateBackdropClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    this.closeCreateModal();
  }

  setCreateAccountType(accountType: CreatableAccountType): void {
    this.createUserForm.controls.accountType.setValue(accountType);
  }

  async submitCreateUser(): Promise<void> {
    if (this.createPending()) {
      return;
    }

    if (this.createUserForm.invalid) {
      this.createUserForm.markAllAsTouched();
      this.createFeedback.set("Veuillez compléter les champs obligatoires.");
      return;
    }

    this.createPending.set(true);
    this.createFeedback.set("Création en cours...");

    try {
      const firstName = this.normalizeOptionalField(this.createUserForm.controls.firstName.value) ?? "";
      const lastName = this.normalizeOptionalField(this.createUserForm.controls.lastName.value) ?? "";
      const email = this.normalizeOptionalField(this.createUserForm.controls.email.value)?.toLowerCase() ?? null;
      const phone = this.normalizeOptionalField(this.createUserForm.controls.phone.value);

      if (!email && !phone) {
        this.createFeedback.set("Renseignez au moins un email ou un téléphone.");
        return;
      }

      if (email && !isEmailValid(email)) {
        this.createFeedback.set("L'email est invalide.");
        return;
      }

      const payload: AccountUserCreateRequest = {
        accountType: this.createUserForm.controls.accountType.value,
        firstName,
        lastName,
        email,
        phone,
        address: this.normalizeOptionalField(this.createUserForm.controls.address.value),
        postalCode: this.normalizeOptionalField(this.createUserForm.controls.postalCode.value),
        city: this.normalizeOptionalField(this.createUserForm.controls.city.value),
        personalNotes: this.normalizeOptionalField(this.createUserForm.controls.personalNotes.value),
      };

      const created = await this.userService.create(payload);
      this.users.update((items) =>
        [created, ...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
      this.createModalOpen.set(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Création impossible.";
      this.createFeedback.set(message);
    } finally {
      this.createPending.set(false);
    }
  }

  displayName(user: AccountUserResponse): string {
    const fullName = `${user.firstName} ${user.lastName}`.trim();
    if (fullName) {
      return fullName;
    }

    const email = user.email?.trim();
    if (email) {
      return email;
    }

    const phone = user.phone?.trim();
    if (phone) {
      return phone;
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

  relationLabel(relationRole: string): string {
    switch (relationRole) {
      case "OWNER":
        return "Propriétaire";
      case "PROSPECT":
      case "ACHETEUR":
        return "Prospect";
      case "NOTAIRE":
        return "Notaire";
      default:
        return relationRole;
    }
  }

  displayValue(value: string | null): string {
    return value && value.trim() ? value : "Non renseigné";
  }

  private normalizeOptionalField(value: string): string | null {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
}
