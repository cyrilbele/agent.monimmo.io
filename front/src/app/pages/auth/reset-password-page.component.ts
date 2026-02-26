import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";

import { validateResetForm } from "../../core/auth-helpers";
import { AuthService } from "../../core/auth.service";

@Component({
  selector: "app-reset-password-page",
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: "./reset-password-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordPageComponent {
  readonly pending = signal(false);
  readonly feedback = signal<string | null>(null);
  readonly done = signal(false);

  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly form = this.formBuilder.nonNullable.group({
    token: [this.route.snapshot.queryParamMap.get("token") ?? "", [Validators.required]],
    newPassword: ["", [Validators.required]],
    confirmPassword: ["", [Validators.required]],
  });

  readonly submitLabel = computed(() =>
    this.pending() ? "Réinitialisation..." : "Mettre à jour le mot de passe",
  );

  async submit(): Promise<void> {
    if (this.pending()) {
      return;
    }

    const payload = {
      token: this.form.controls.token.value.trim(),
      newPassword: this.form.controls.newPassword.value,
      confirmPassword: this.form.controls.confirmPassword.value,
    };

    const validationError = validateResetForm(payload);
    if (validationError) {
      this.feedback.set(validationError);
      this.form.markAllAsTouched();
      return;
    }

    this.pending.set(true);
    this.feedback.set("Réinitialisation en cours...");

    try {
      await this.authService.resetPassword(payload.token, payload.newPassword);
      this.done.set(true);
      this.feedback.set("Mot de passe mis à jour. Vous pouvez vous reconnecter.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Réinitialisation impossible.";
      this.feedback.set(message);
    } finally {
      this.pending.set(false);
    }
  }

  goToLogin(): Promise<boolean> {
    return this.router.navigate(["/login"]);
  }
}
