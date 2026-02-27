import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";

import type { VocalResponse, VocalType } from "../../core/api.models";
import { FileService } from "../../services/file.service";
import { VocalService } from "../../services/vocal.service";

@Component({
  selector: "app-vocals-page",
  imports: [CommonModule, RouterLink],
  templateUrl: "./vocals-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VocalsPageComponent implements OnInit {
  private readonly vocalService = inject(VocalService);
  private readonly fileService = inject(FileService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly vocals = signal<VocalResponse[]>([]);
  readonly audioUrls = signal<Record<string, string>>({});

  readonly vocalsCount = computed(() => this.vocals().length);

  ngOnInit(): void {
    void this.loadVocals();
  }

  async loadVocals(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const response = await this.vocalService.list(100);
      this.vocals.set(response.items);
      await this.loadAudioUrls(response.items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chargement impossible.";
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
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

  audioUrl(vocalId: string): string | null {
    return this.audioUrls()[vocalId] ?? null;
  }

  private async loadAudioUrls(vocals: VocalResponse[]): Promise<void> {
    const entries = await Promise.all(
      vocals.map(async (vocal) => {
        try {
          const download = await this.fileService.getDownloadUrl(vocal.fileId);
          return [vocal.id, download.url] as const;
        } catch {
          return [vocal.id, ""] as const;
        }
      }),
    );

    this.audioUrls.set(Object.fromEntries(entries));
  }
}
