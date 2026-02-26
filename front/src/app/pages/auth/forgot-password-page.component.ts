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

import { AuthService } from "../../core/auth.service";

@Component({
  selector: "app-forgot-password-page",
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: "./forgot-password-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordPageComponent {
  readonly pending = signal(false);
  readonly feedback = signal<string | null>(null);
  readonly sent = signal(false);

  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.formBuilder.nonNullable.group({
    email: ["", [Validators.required, Validators.email]],
  });

  readonly submitLabel = computed(() => (this.pending() ? "Envoi..." : "Envoyer le lien"));

  async submit(): Promise<void> {
    if (this.pending()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.feedback.set("Veuillez saisir un email valide.");
      return;
    }

    this.pending.set(true);
    this.feedback.set("Envoi de la demande en cours...");

    try {
      await this.authService.forgotPassword(this.form.controls.email.value.trim());
      this.sent.set(true);
      this.feedback.set("Email envoyé. Passez à l'étape de réinitialisation avec votre token.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Envoi impossible.";
      this.feedback.set(message);
    } finally {
      this.pending.set(false);
    }
  }

  goToReset(): Promise<boolean> {
    return this.router.navigate(["/mot-de-passe/reset"]);
  }
}
