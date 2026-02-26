import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";

import { validateRegisterForm } from "../../core/auth-helpers";
import { AuthService } from "../../core/auth.service";

@Component({
  selector: "app-register-page",
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: "./register-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPageComponent {
  readonly pending = signal(false);
  readonly feedback = signal<string | null>(null);

  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.formBuilder.nonNullable.group({
    firstName: ["", [Validators.required]],
    lastName: ["", [Validators.required]],
    email: ["", [Validators.required, Validators.email]],
    password: ["", [Validators.required]],
    confirmPassword: ["", [Validators.required]],
  });

  readonly submitLabel = computed(() => (this.pending() ? "Création..." : "Créer le compte"));

  async submit(): Promise<void> {
    if (this.pending()) {
      return;
    }

    const payload = {
      firstName: this.form.controls.firstName.value.trim(),
      lastName: this.form.controls.lastName.value.trim(),
      email: this.form.controls.email.value.trim(),
      password: this.form.controls.password.value,
      confirmPassword: this.form.controls.confirmPassword.value,
    };

    const validationError = validateRegisterForm(payload);
    if (validationError) {
      this.feedback.set(validationError);
      this.form.markAllAsTouched();
      return;
    }

    this.pending.set(true);
    this.feedback.set("Création du compte en cours...");

    try {
      await this.authService.register({
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        password: payload.password,
      });

      await this.router.navigate(["/app/kanban"]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Inscription impossible.";
      this.feedback.set(message);
    } finally {
      this.pending.set(false);
    }
  }
}
