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

import { AuthService } from "../../core/auth.service";
import { MIN_PASSWORD_LENGTH } from "../../core/constants";

@Component({
  selector: "app-login-page",
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: "./login-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPageComponent {
  readonly pending = signal(false);
  readonly feedback = signal<string | null>(null);
  readonly feedbackTone = signal<"error" | "success" | "info">("info");

  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly form = this.formBuilder.nonNullable.group({
    email: ["", [Validators.required, Validators.email]],
    password: ["", [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
  });

  readonly submitLabel = computed(() => (this.pending() ? "Connexion..." : "Se connecter"));

  readonly feedbackClasses = computed(() => {
    const baseClasses = "rounded-xl px-3 py-2 text-sm";

    switch (this.feedbackTone()) {
      case "error":
        return `${baseClasses} bg-red-100 text-red-700`;
      case "success":
        return `${baseClasses} bg-emerald-100 text-emerald-700`;
      default:
        return `${baseClasses} bg-slate-100 text-slate-700`;
    }
  });

  async submit(): Promise<void> {
    if (this.pending()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.feedbackTone.set("error");
      this.feedback.set("Veuillez renseigner un email valide et un mot de passe correct.");
      return;
    }

    this.pending.set(true);
    this.feedbackTone.set("info");
    this.feedback.set("Connexion en cours...");

    const email = this.form.controls.email.value.trim();
    const password = this.form.controls.password.value;

    try {
      await this.authService.login(email, password);

      this.feedbackTone.set("success");
      this.feedback.set("Connexion réussie.");

      const redirect = this.route.snapshot.queryParamMap.get("redirect");
      if (redirect?.startsWith("/app/")) {
        await this.router.navigateByUrl(redirect);
        return;
      }

      await this.router.navigate(["/app/kanban"]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connexion impossible.";
      this.feedbackTone.set("error");
      this.feedback.set(message);
    } finally {
      this.pending.set(false);
    }
  }
}
