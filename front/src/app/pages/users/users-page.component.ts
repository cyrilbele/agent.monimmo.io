import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
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
export class UsersPageComponent implements OnInit, OnDestroy {
  private readonly userService = inject(UserService);
  private readonly formBuilder = inject(FormBuilder);
  private searchDebounceHandle: ReturnType<typeof setTimeout> | null = null;
  private latestRequestId = 0;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly users = signal<AccountUserResponse[]>([]);
  readonly searchQuery = signal("");
  readonly createModalOpen = signal(false);
  readonly createPending = signal(false);
  readonly createFeedback = signal<string | null>(null);

  readonly usersCount = computed(() => this.users().length);
  readonly hasActiveSearch = computed(() => this.searchQuery().trim().length > 0);
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

  ngOnDestroy(): void {
    if (this.searchDebounceHandle) {
      clearTimeout(this.searchDebounceHandle);
      this.searchDebounceHandle = null;
    }
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);

    if (this.searchDebounceHandle) {
      clearTimeout(this.searchDebounceHandle);
    }

    this.searchDebounceHandle = setTimeout(() => {
      void this.loadUsers();
    }, 250);
  }

  async loadUsers(query = this.searchQuery()): Promise<void> {
    const requestId = ++this.latestRequestId;
    this.loading.set(true);
    this.error.set(null);

    try {
      const normalizedQuery = query.trim();
      const response = await this.userService.list(100, normalizedQuery || undefined);
      if (requestId !== this.latestRequestId) {
        return;
      }
      this.users.set(response.items);
    } catch (error) {
      if (requestId !== this.latestRequestId) {
        return;
      }
      const message = error instanceof Error ? error.message : "Chargement impossible.";
      this.error.set(message);
      this.users.set([]);
    } finally {
      if (requestId === this.latestRequestId) {
        this.loading.set(false);
      }
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

      await this.userService.create(payload);
      this.createModalOpen.set(false);
      await this.loadUsers();
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
