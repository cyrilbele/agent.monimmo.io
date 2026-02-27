import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";

import type { VocalResponse, VocalType } from "../../core/api.models";
import { FileService } from "../../services/file.service";
import { VocalService } from "../../services/vocal.service";

@Component({
  selector: "app-vocal-detail-page",
  imports: [CommonModule, RouterLink],
  templateUrl: "./vocal-detail-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VocalDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly vocalService = inject(VocalService);
  private readonly fileService = inject(FileService);

  readonly loading = signal(true);
  readonly retrying = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly vocal = signal<VocalResponse | null>(null);
  readonly audioUrl = signal<string | null>(null);

  readonly canRetry = computed(() => {
    const vocal = this.vocal();
    if (!vocal) {
      return false;
    }

    return vocal.vocalType === "ERREUR_TRAITEMENT" || Boolean(vocal.processingError);
  });

  ngOnInit(): void {
    void this.loadVocal();
  }

  typeLabel(vocalType: VocalType | null | undefined): string {
    switch (vocalType) {
      case "VISITE_INITIALE":
        return "Visite initiale";
      case "VISITE_SUIVI":
        return "Visite de suivi";
      case "COMPTE_RENDU_VISITE_CLIENT":
        return "Compte rendu visite client";
      case "ERREUR_TRAITEMENT":
        return "Erreur traitement";
      default:
        return "Type en attente";
    }
  }

  statusLabel(status: VocalResponse["status"] | undefined): string {
    switch (status) {
      case "UPLOADED":
        return "Uploadé";
      case "TRANSCRIBED":
        return "Transcrit";
      case "INSIGHTS_READY":
        return "Insights prêts";
      case "REVIEW_REQUIRED":
        return "Review requise";
      default:
        return "Inconnu";
    }
  }

  async retryTranscription(): Promise<void> {
    const vocal = this.vocal();
    if (!vocal || this.retrying()) {
      return;
    }

    this.retrying.set(true);
    this.error.set(null);
    this.info.set(null);

    try {
      await this.vocalService.enqueueTranscription(vocal.id);
      this.info.set("Relance envoyée. La transcription va être retraitée.");
      await this.loadVocal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Relance impossible.";
      this.error.set(message);
    } finally {
      this.retrying.set(false);
    }
  }

  private async loadVocal(): Promise<void> {
    const vocalId = this.route.snapshot.paramMap.get("id");
    if (!vocalId) {
      this.error.set("Identifiant vocal manquant.");
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const vocal = await this.vocalService.getById(vocalId);
      this.vocal.set(vocal);

      try {
        const download = await this.fileService.getDownloadUrl(vocal.fileId);
        this.audioUrl.set(download.url);
      } catch {
        this.audioUrl.set(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chargement impossible.";
      this.error.set(message);
      this.vocal.set(null);
      this.audioUrl.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}
