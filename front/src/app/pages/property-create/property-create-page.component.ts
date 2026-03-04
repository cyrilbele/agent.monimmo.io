import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router } from "@angular/router";

import { PropertyService } from "../../services/property.service";

@Component({
  selector: "app-property-create-page",
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: "./property-create-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertyCreatePageComponent {
  readonly pending = signal(false);
  readonly feedback = signal<string | null>(null);

  private readonly formBuilder = inject(FormBuilder);
  private readonly propertyService = inject(PropertyService);
  private readonly router = inject(Router);

  readonly form = this.formBuilder.nonNullable.group({
    title: ["", [Validators.required]],
    city: ["", [Validators.required]],
    postalCode: ["", [Validators.required]],
    address: ["", [Validators.required]],
  });

  async submit(): Promise<void> {
    if (this.pending()) {
      return;
    }

    this.pending.set(true);
    this.feedback.set("Création du bien en cours...");

    try {
      const title = this.form.controls.title.value.trim();
      const city = this.form.controls.city.value.trim();
      const postalCode = this.form.controls.postalCode.value.trim();
      const address = this.form.controls.address.value.trim();

      if (!title || !city || !postalCode || !address) {
        this.feedback.set("Veuillez compléter les champs obligatoires.");
        return;
      }

      const created = await this.propertyService.create({
        title,
        city,
        postalCode,
        address,
      });

      await this.router.navigate(["/app/bien", created.id]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Création impossible.";
      this.feedback.set(message);
    } finally {
      this.pending.set(false);
    }
  }
}
