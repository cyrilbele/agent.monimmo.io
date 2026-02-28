import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";

import type { PropertyVisitResponse } from "../../core/api.models";
import { FileService } from "../../services/file.service";
import { PropertyService } from "../../services/property.service";

@Component({
  selector: "app-visit-detail-page",
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: "./visit-detail-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisitDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);
  private readonly propertyService = inject(PropertyService);
  private readonly fileService = inject(FileService);

  readonly visitId = this.route.snapshot.paramMap.get("id") ?? "";

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly visit = signal<PropertyVisitResponse | null>(null);
  readonly savePending = signal(false);
  readonly uploadPending = signal(false);
  readonly saveFeedback = signal<string | null>(null);
  readonly uploadFeedback = signal<string | null>(null);
  readonly selectedFile = signal<File | null>(null);

  readonly compteRenduForm = this.formBuilder.nonNullable.group({
    compteRendu: [""],
  });

  readonly selectedFileName = computed(() => this.selectedFile()?.name ?? null);

  ngOnInit(): void {
    if (!this.visitId) {
      this.loading.set(false);
      this.error.set("Identifiant de visite manquant.");
      return;
    }

    void this.loadVisit();
  }

  onFileInputChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const file = target.files?.[0] ?? null;
    this.selectedFile.set(file);
    this.uploadFeedback.set(null);
  }

  async uploadBonDeVisite(): Promise<void> {
    if (this.uploadPending()) {
      return;
    }

    const visit = this.visit();
    if (!visit) {
      return;
    }

    const file = this.selectedFile();
    if (!file) {
      this.uploadFeedback.set("Sélectionnez un fichier à envoyer.");
      return;
    }

    this.uploadPending.set(true);
    this.uploadFeedback.set("Upload du bon de visite...");

    try {
      const contentBase64 = await this.fileToBase64(file);
      const uploaded = await this.fileService.upload({
        propertyId: visit.propertyId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        contentBase64,
      });

      const updated = await this.propertyService.patchVisitById(visit.id, {
        bonDeVisiteFileId: uploaded.id,
      });
      this.visit.set(updated);
      this.compteRenduForm.controls.compteRendu.setValue(updated.compteRendu ?? "");
      this.selectedFile.set(null);
      this.uploadFeedback.set("Bon de visite chargé.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload impossible.";
      this.uploadFeedback.set(message);
    } finally {
      this.uploadPending.set(false);
    }
  }

  async saveCompteRendu(): Promise<void> {
    if (this.savePending()) {
      return;
    }

    const visit = this.visit();
    if (!visit) {
      return;
    }

    this.savePending.set(true);
    this.saveFeedback.set("Enregistrement du compte rendu...");

    try {
      const rawCompteRendu = this.compteRenduForm.controls.compteRendu.value;
      const normalized = rawCompteRendu.trim();
      const updated = await this.propertyService.patchVisitById(visit.id, {
        compteRendu: normalized ? normalized : null,
      });
      this.visit.set(updated);
      this.compteRenduForm.controls.compteRendu.setValue(updated.compteRendu ?? "");
      this.saveFeedback.set("Compte rendu enregistré.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Enregistrement impossible.";
      this.saveFeedback.set(message);
    } finally {
      this.savePending.set(false);
    }
  }

  private async loadVisit(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const visit = await this.propertyService.getVisitById(this.visitId);
      this.visit.set(visit);
      this.compteRenduForm.controls.compteRendu.setValue(visit.compteRendu ?? "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chargement de la visite impossible.";
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        const [, base64] = dataUrl.split(",");
        resolve(base64 ?? "");
      };

      reader.onerror = () => {
        reject(new Error("Impossible de lire le fichier."));
      };

      reader.readAsDataURL(file);
    });
  }
}
