import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";

import type { RdvResponse } from "../../core/api.models";
import { PropertyService } from "../../services/property.service";

@Component({
  selector: "app-appointment-detail-page",
  imports: [CommonModule, RouterLink],
  templateUrl: "./appointment-detail-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppointmentDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly propertyService = inject(PropertyService);

  readonly rdvId = this.route.snapshot.paramMap.get("id") ?? "";

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly rdv = signal<RdvResponse | null>(null);

  ngOnInit(): void {
    if (!this.rdvId) {
      this.loading.set(false);
      this.error.set("Identifiant de rendez-vous manquant.");
      return;
    }

    void this.loadRdv();
  }

  private async loadRdv(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const rdv = await this.propertyService.getRdvById(this.rdvId);
      this.rdv.set(rdv);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chargement du rendez-vous impossible.";
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }
}
