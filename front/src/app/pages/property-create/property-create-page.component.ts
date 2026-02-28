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
import { Router } from "@angular/router";

import type { AccountUserResponse } from "../../core/api.models";
import { isEmailValid } from "../../core/auth-helpers";
import { PropertyService } from "../../services/property.service";
import { UserService } from "../../services/user.service";

type OwnerMode = "existing" | "new";

@Component({
  selector: "app-property-create-page",
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: "./property-create-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertyCreatePageComponent implements OnInit {
  readonly pending = signal(false);
  readonly feedback = signal<string | null>(null);
  readonly clientsLoading = signal(false);
  readonly clients = signal<AccountUserResponse[]>([]);
  readonly ownerSuggestionsOpen = signal(false);

  private readonly formBuilder = inject(FormBuilder);
  private readonly propertyService = inject(PropertyService);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);

  readonly form = this.formBuilder.nonNullable.group({
    title: ["", [Validators.required]],
    city: ["", [Validators.required]],
    postalCode: ["", [Validators.required]],
    address: ["", [Validators.required]],
    ownerMode: ["existing" as OwnerMode, [Validators.required]],
    ownerLookup: [""],
    ownerUserId: [""],
    ownerFirstName: [""],
    ownerLastName: [""],
    ownerPhone: [""],
    ownerEmail: [""],
  });

  readonly submitLabel = computed(() => (this.pending() ? "Creation..." : "Creer le bien"));
  readonly ownerMode = signal<OwnerMode>(this.form.controls.ownerMode.value);
  readonly ownerAutocompleteId = "owner-client-autocomplete-input";
  readonly ownerAutocompleteListId = "owner-client-autocomplete-listbox";
  readonly filteredOwnerClients = computed(() => {
    const clients = this.clients();
    const lookup = this.form.controls.ownerLookup.value.trim().toLowerCase();

    if (!lookup) {
      return clients.slice(0, 8);
    }

    return clients
      .filter((client) => {
        const fullName = `${client.firstName} ${client.lastName}`.trim().toLowerCase();
        const email = (client.email ?? "").toLowerCase();
        const phone = (client.phone ?? "").toLowerCase();
        return (
          fullName.includes(lookup) ||
          email.includes(lookup) ||
          phone.includes(lookup)
        );
      })
      .slice(0, 8);
  });

  ngOnInit(): void {
    this.applyOwnerModeConstraints(this.ownerMode());
    void this.loadClients();
  }

  async loadClients(): Promise<void> {
    this.clientsLoading.set(true);

    try {
      const response = await this.userService.list(100, undefined, "CLIENT");
      this.clients.set(response.items);
    } catch {
      this.feedback.set(
        "Impossible de charger les clients existants. Vous pouvez creer un nouveau proprietaire.",
      );
    } finally {
      this.clientsLoading.set(false);
    }
  }

  setOwnerMode(mode: OwnerMode): void {
    this.ownerMode.set(mode);
    this.form.controls.ownerMode.setValue(mode);
    this.form.controls.ownerUserId.setValue("");
    this.ownerSuggestionsOpen.set(false);
    this.feedback.set(null);
    this.applyOwnerModeConstraints(mode);
  }

  ownerOptionLabel(user: AccountUserResponse): string {
    const fullName = `${user.firstName} ${user.lastName}`.trim() || "Sans nom";
    const contact = user.email ?? user.phone ?? "Sans contact";
    return `${fullName} - ${contact}`;
  }

  onOwnerLookupInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    this.applyOwnerLookupValue(target.value);
    this.ownerSuggestionsOpen.set(true);
  }

  onOwnerLookupFocus(): void {
    this.ownerSuggestionsOpen.set(true);
  }

  onOwnerLookupContainerFocusOut(event: FocusEvent, container: HTMLElement): void {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && container.contains(relatedTarget)) {
      return;
    }

    this.ownerSuggestionsOpen.set(false);
  }

  onOwnerSuggestionMouseDown(event: MouseEvent): void {
    event.preventDefault();
  }

  toggleOwnerSuggestions(): void {
    this.ownerSuggestionsOpen.update((isOpen) => !isOpen);
  }

  selectOwnerClient(client: AccountUserResponse): void {
    this.form.controls.ownerLookup.setValue(this.ownerOptionLabel(client));
    this.form.controls.ownerUserId.setValue(client.id);
    this.ownerSuggestionsOpen.set(false);
  }

  async submit(): Promise<void> {
    if (this.pending()) {
      return;
    }

    this.pending.set(true);
    this.feedback.set("Creation du bien en cours...");

    try {
      const ownerMode = this.ownerMode();
      const title = this.form.controls.title.value.trim();
      const city = this.form.controls.city.value.trim();
      const postalCode = this.form.controls.postalCode.value.trim();
      const address = this.form.controls.address.value.trim();

       if (!title || !city || !postalCode || !address) {
        this.feedback.set("Veuillez completer les champs obligatoires.");
        return;
      }

      if (ownerMode === "existing") {
        const ownerLookup = this.form.controls.ownerLookup.value.trim();
        if (!ownerLookup) {
          this.feedback.set("Veuillez completer les champs obligatoires.");
          return;
        }

        const match = this.resolveSelectedOwnerClient();

        if (!match) {
          this.feedback.set("Selectionnez un client existant dans la liste d'autocompletion.");
          return;
        }

        const created = await this.propertyService.create({
          title,
          city,
          postalCode,
          address,
          ownerUserId: match.id,
        });

        await this.router.navigate(["/app/bien", created.id]);
        return;
      }

      const ownerFirstName = this.form.controls.ownerFirstName.value.trim();
      const ownerLastName = this.form.controls.ownerLastName.value.trim();
      const ownerPhone = this.form.controls.ownerPhone.value.trim();
      const ownerEmail = this.form.controls.ownerEmail.value.trim().toLowerCase();

      if (!ownerFirstName || !ownerLastName || !ownerPhone || !ownerEmail) {
        this.feedback.set("Veuillez completer les champs obligatoires.");
        return;
      }

      if (!isEmailValid(ownerEmail)) {
        this.feedback.set("L'email proprietaire est invalide.");
        return;
      }

      const created = await this.propertyService.create({
        title,
        city,
        postalCode,
        address,
        owner: {
          firstName: ownerFirstName,
          lastName: ownerLastName,
          phone: ownerPhone,
          email: ownerEmail,
        },
      });

      await this.router.navigate(["/app/bien", created.id]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Creation impossible.";
      this.feedback.set(message);
    } finally {
      this.pending.set(false);
    }
  }

  private applyOwnerModeConstraints(mode: OwnerMode): void {
    if (mode === "existing") {
      this.form.controls.ownerLookup.setValidators([Validators.required]);
      this.form.controls.ownerFirstName.clearValidators();
      this.form.controls.ownerLastName.clearValidators();
      this.form.controls.ownerPhone.clearValidators();
      this.form.controls.ownerEmail.clearValidators();
    } else {
      this.form.controls.ownerLookup.clearValidators();
      this.form.controls.ownerFirstName.setValidators([Validators.required]);
      this.form.controls.ownerLastName.setValidators([Validators.required]);
      this.form.controls.ownerPhone.setValidators([Validators.required]);
      this.form.controls.ownerEmail.setValidators([Validators.required, Validators.email]);
    }

    this.form.controls.ownerLookup.updateValueAndValidity({ emitEvent: false });
    this.form.controls.ownerFirstName.updateValueAndValidity({ emitEvent: false });
    this.form.controls.ownerLastName.updateValueAndValidity({ emitEvent: false });
    this.form.controls.ownerPhone.updateValueAndValidity({ emitEvent: false });
    this.form.controls.ownerEmail.updateValueAndValidity({ emitEvent: false });
  }

  private applyOwnerLookupValue(lookup: string): void {
    this.form.controls.ownerLookup.setValue(lookup);
    const match = this.findClientFromLookup(lookup);
    this.form.controls.ownerUserId.setValue(match?.id ?? "");
  }

  private resolveSelectedOwnerClient(): AccountUserResponse | null {
    const selectedId = this.form.controls.ownerUserId.value.trim();
    if (selectedId) {
      const selected = this.clients().find((client) => client.id === selectedId) ?? null;
      if (selected) {
        return selected;
      }
    }

    const lookup = this.form.controls.ownerLookup.value.trim();
    return this.findClientFromLookup(lookup);
  }

  private findClientFromLookup(lookup: string): AccountUserResponse | null {
    const normalizedLookup = lookup.trim().toLowerCase();
    if (!normalizedLookup) {
      return null;
    }

    const clients = this.clients();
    const exact = clients.find((client) => {
      const fullName = `${client.firstName} ${client.lastName}`.trim().toLowerCase();
      const email = (client.email ?? "").toLowerCase();
      return (
        this.ownerOptionLabel(client).toLowerCase() === normalizedLookup ||
        email === normalizedLookup ||
        fullName === normalizedLookup
      );
    });

    if (exact) {
      return exact;
    }

    const partialMatches = clients.filter((client) => {
      const fullName = `${client.firstName} ${client.lastName}`.trim().toLowerCase();
      const email = (client.email ?? "").toLowerCase();
      const phone = (client.phone ?? "").toLowerCase();
      return (
        fullName.includes(normalizedLookup) ||
        email.includes(normalizedLookup) ||
        phone.includes(normalizedLookup)
      );
    });

    return partialMatches.length === 1 ? partialMatches[0] : null;
  }
}
