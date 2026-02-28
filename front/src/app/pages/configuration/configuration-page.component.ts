import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from "@angular/forms";

import type { IntegrationPath } from "../../core/api.models";
import { AppSettingsService } from "../../services/app-settings.service";
import { IntegrationService } from "../../services/integration.service";

type FeedbackTone = "info" | "success" | "error";

type ConnectFormGroup = FormGroup<{
  code: FormControl<string>;
  redirectUri: FormControl<string>;
}>;

type SyncFormGroup = FormGroup<{
  cursor: FormControl<string>;
}>;

type ValuationSettingsFormGroup = FormGroup<{
  notaryFeePct: FormControl<string>;
}>;

interface IntegrationCard {
  key: IntegrationPath;
  title: string;
  description: string;
}

const PROVIDERS: readonly IntegrationCard[] = [
  {
    key: "gmail",
    title: "Gmail",
    description: "Connecter et synchroniser vos emails entrants.",
  },
  {
    key: "google-calendar",
    title: "Google Calendar",
    description: "Rapatrier les événements liés aux visites et rendez-vous.",
  },
  {
    key: "whatsapp",
    title: "WhatsApp",
    description: "Centraliser conversations et médias clients.",
  },
];

@Component({
  selector: "app-configuration-page",
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: "./configuration-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurationPageComponent {
  readonly providers = PROVIDERS;

  private readonly integrationService = inject(IntegrationService);
  private readonly appSettingsService = inject(AppSettingsService);
  private readonly formBuilder = inject(FormBuilder);

  readonly connectForms: Record<IntegrationPath, ConnectFormGroup> = {
    gmail: this.createConnectForm(),
    "google-calendar": this.createConnectForm(),
    whatsapp: this.createConnectForm(),
  };

  readonly syncForms: Record<IntegrationPath, SyncFormGroup> = {
    gmail: this.createSyncForm(),
    "google-calendar": this.createSyncForm(),
    whatsapp: this.createSyncForm(),
  };

  readonly valuationSettingsForm: ValuationSettingsFormGroup = this.formBuilder.nonNullable.group({
    notaryFeePct: [this.formatNotaryFeePct(this.appSettingsService.notaryFeePct())],
  });

  readonly feedback = signal<Record<IntegrationPath, string | null>>({
    gmail: null,
    "google-calendar": null,
    whatsapp: null,
  });
  readonly valuationFeedback = signal<string | null>(null);

  readonly feedbackTone = signal<Record<IntegrationPath, FeedbackTone>>({
    gmail: "info",
    "google-calendar": "info",
    whatsapp: "info",
  });

  readonly connectPending = signal<Record<IntegrationPath, boolean>>({
    gmail: false,
    "google-calendar": false,
    whatsapp: false,
  });

  readonly syncPending = signal<Record<IntegrationPath, boolean>>({
    gmail: false,
    "google-calendar": false,
    whatsapp: false,
  });

  readonly feedbackClasses = computed<Record<IntegrationPath, string>>(() => {
    const tones = this.feedbackTone();

    return {
      gmail: this.feedbackClassFromTone(tones.gmail),
      "google-calendar": this.feedbackClassFromTone(tones["google-calendar"]),
      whatsapp: this.feedbackClassFromTone(tones.whatsapp),
    };
  });

  async connect(path: IntegrationPath): Promise<void> {
    const pendingState = this.connectPending();
    if (pendingState[path]) {
      return;
    }

    this.patchConnectPending(path, true);
    this.setFeedback(path, "Connexion en cours...", "info");

    const payload = this.connectForms[path].getRawValue();

    try {
      const result = await this.integrationService.connect(path, {
        code: payload.code.trim() || undefined,
        redirectUri: payload.redirectUri.trim() || undefined,
      });

      this.setFeedback(path, `Connecté (${result.status}).`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connexion impossible.";
      this.setFeedback(path, message, "error");
    } finally {
      this.patchConnectPending(path, false);
    }
  }

  async sync(path: IntegrationPath): Promise<void> {
    const pendingState = this.syncPending();
    if (pendingState[path]) {
      return;
    }

    this.patchSyncPending(path, true);
    this.setFeedback(path, "Synchronisation en cours...", "info");

    const payload = this.syncForms[path].getRawValue();

    try {
      const result = await this.integrationService.sync(path, {
        cursor: payload.cursor.trim() || undefined,
      });

      this.setFeedback(path, `Synchronisation lancée (${result.status}).`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Synchronisation impossible.";
      this.setFeedback(path, message, "error");
    } finally {
      this.patchSyncPending(path, false);
    }
  }

  feedbackId(path: IntegrationPath): string {
    return `${path}-feedback`;
  }

  saveValuationSettings(): void {
    const raw = this.valuationSettingsForm.controls.notaryFeePct.value.trim();
    const normalizedInput = raw.replace(",", ".");
    const parsed = Number(normalizedInput);
    if (!raw || !Number.isFinite(parsed) || parsed < 0) {
      this.valuationFeedback.set("Le taux de frais de notaire doit être un nombre positif.");
      return;
    }

    const persisted = this.appSettingsService.updateNotaryFeePct(parsed);
    this.valuationSettingsForm.controls.notaryFeePct.setValue(this.formatNotaryFeePct(persisted));
    this.valuationFeedback.set("Paramètre enregistré.");
  }

  private createConnectForm(): ConnectFormGroup {
    return this.formBuilder.nonNullable.group({
      code: [""],
      redirectUri: [""],
    });
  }

  private createSyncForm(): SyncFormGroup {
    return this.formBuilder.nonNullable.group({
      cursor: [""],
    });
  }

  private setFeedback(path: IntegrationPath, message: string, tone: FeedbackTone): void {
    this.feedback.update((current) => ({
      ...current,
      [path]: message,
    }));

    this.feedbackTone.update((current) => ({
      ...current,
      [path]: tone,
    }));
  }

  private patchConnectPending(path: IntegrationPath, value: boolean): void {
    this.connectPending.update((current) => ({
      ...current,
      [path]: value,
    }));
  }

  private patchSyncPending(path: IntegrationPath, value: boolean): void {
    this.syncPending.update((current) => ({
      ...current,
      [path]: value,
    }));
  }

  private feedbackClassFromTone(tone: FeedbackTone): string {
    const baseClasses = "rounded-xl px-3 py-2 text-sm";

    switch (tone) {
      case "error":
        return `${baseClasses} bg-red-100 text-red-700`;
      case "success":
        return `${baseClasses} bg-emerald-100 text-emerald-700`;
      default:
        return `${baseClasses} bg-slate-100 text-slate-700`;
    }
  }

  private formatNotaryFeePct(value: number): string {
    if (!Number.isFinite(value)) {
      return "";
    }

    return value.toFixed(2).replace(/\.00$/, "");
  }
}
