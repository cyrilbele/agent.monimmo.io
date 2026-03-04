import { CommonModule, DatePipe } from "@angular/common";
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

import type { AICallLogResponse, AiProvider, IntegrationPath } from "../../core/api.models";
import { AICallsService } from "../../services/ai-calls.service";
import { AppSettingsService } from "../../services/app-settings.service";
import { IntegrationService } from "../../services/integration.service";

type FeedbackTone = "info" | "success" | "error";
type ConfigurationTab = "settings" | "aiCalls";

type ConnectFormGroup = FormGroup<{
  code: FormControl<string>;
  redirectUri: FormControl<string>;
}>;

type SyncFormGroup = FormGroup<{
  cursor: FormControl<string>;
}>;

type ValuationSettingsFormGroup = FormGroup<{
  notaryFeePct: FormControl<string>;
  aiProvider: FormControl<AiProvider>;
  valuationAiOutputFormat: FormControl<string>;
  assistantSoul: FormControl<string>;
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
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: "./configuration-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurationPageComponent {
  readonly providers = PROVIDERS;

  private readonly integrationService = inject(IntegrationService);
  private readonly appSettingsService = inject(AppSettingsService);
  private readonly aiCallsService = inject(AICallsService);
  private readonly formBuilder = inject(FormBuilder);

  readonly activeTab = signal<ConfigurationTab>("settings");
  readonly aiCalls = signal<AICallLogResponse[]>([]);
  readonly aiCallsPending = signal(false);
  readonly aiCallsFeedback = signal<string | null>(null);
  readonly selectedAICall = signal<AICallLogResponse | null>(null);

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
    aiProvider: [this.appSettingsService.aiProvider()],
    valuationAiOutputFormat: [this.appSettingsService.valuationAiOutputFormat()],
    assistantSoul: [this.appSettingsService.assistantSoul()],
  });

  readonly feedback = signal<Record<IntegrationPath, string | null>>({
    gmail: null,
    "google-calendar": null,
    whatsapp: null,
  });
  readonly valuationFeedback = signal<string | null>(null);
  readonly valuationPending = signal(false);

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

  constructor() {
    void this.loadValuationSettings();
  }

  selectTab(tab: ConfigurationTab): void {
    this.activeTab.set(tab);

    if (tab === "aiCalls" && this.aiCalls().length === 0) {
      void this.refreshAICalls();
    }
  }

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

  async refreshAICalls(): Promise<void> {
    if (this.aiCallsPending()) {
      return;
    }

    this.aiCallsPending.set(true);
    this.aiCallsFeedback.set(null);

    try {
      const response = await this.aiCallsService.list(100);
      this.aiCalls.set(response.items);

      if (response.items.length === 0) {
        this.aiCallsFeedback.set("Aucun appel IA enregistré pour le moment.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chargement impossible.";
      this.aiCallsFeedback.set(message);
    } finally {
      this.aiCallsPending.set(false);
    }
  }

  openAICallDetails(call: AICallLogResponse): void {
    this.selectedAICall.set(call);
  }

  closeAICallDetails(): void {
    this.selectedAICall.set(null);
  }

  feedbackId(path: IntegrationPath): string {
    return `${path}-feedback`;
  }

  formatPrice(value: number): string {
    if (!Number.isFinite(value)) {
      return "0,00 €";
    }

    return value.toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  }

  getUseCaseLabel(useCase: string): string {
    switch (useCase) {
      case "MESSAGE_PROPERTY_MATCH":
        return "Rattachement message";
      case "FILE_CLASSIFICATION":
        return "Classification document";
      case "VOCAL_TRANSCRIPTION":
        return "Transcription vocal";
      case "VOCAL_PROPERTY_MATCH":
        return "Rattachement vocal";
      case "VOCAL_TYPE_DETECTION":
        return "Détection type vocal";
      case "VOCAL_INITIAL_VISIT_EXTRACTION":
        return "Extraction visite initiale";
      case "VOCAL_INSIGHTS_EXTRACTION":
        return "Insights vocal";
      case "PROPERTY_VALUATION":
        return "Valorisation";
      default:
        return useCase;
    }
  }

  tablePromptSummary(call: AICallLogResponse): string {
    const parsed = this.tryParseJson(call.prompt);
    if (this.isRecord(parsed)) {
      const userMessage = this.readStringField(parsed, "userMessage");
      if (userMessage) {
        return this.compactTableText(userMessage);
      }

      const modelInput = Array.isArray(parsed["input"]) ? parsed["input"] : [];
      const functionOutput = modelInput.find(
        (entry) =>
          this.isRecord(entry) && entry["type"] === "function_call_output",
      );
      if (this.isRecord(functionOutput)) {
        const callId = this.readStringField(functionOutput, "call_id");
        const functionName = this.extractFunctionNameFromCallId(callId);
        if (functionName) {
          return `Fonction appelée: ${functionName}`;
        }

        return "Réponse de fonction";
      }

      const userText = this.extractOpenAIUserText(modelInput);
      if (userText) {
        return this.compactTableText(userText);
      }
    }

    return this.compactTableText(call.prompt);
  }

  tableResponseSummary(call: AICallLogResponse): string {
    const parsed = this.tryParseJson(call.textResponse);
    if (this.isRecord(parsed)) {
      const assistantResponse = this.readStringField(parsed, "assistantResponse");
      if (assistantResponse) {
        return this.compactTableText(assistantResponse);
      }

      const outputText = this.readStringField(parsed, "output_text");
      if (outputText) {
        return this.compactTableText(outputText);
      }

      const message = this.readStringField(parsed, "message");
      if (message) {
        return this.compactTableText(message);
      }

      const output = Array.isArray(parsed["output"]) ? parsed["output"] : [];
      const functionCall = output.find(
        (entry) =>
          this.isRecord(entry) && entry["type"] === "function_call",
      );
      if (this.isRecord(functionCall)) {
        const functionName = this.readStringField(functionCall, "name");
        if (functionName) {
          return `Appel fonction: ${functionName}`;
        }

        return "Appel fonction";
      }

      const outputChunkText = this.extractOpenAIOutputText(output);
      if (outputChunkText) {
        return this.compactTableText(outputChunkText);
      }
    }

    return this.compactTableText(call.textResponse);
  }

  async saveValuationSettings(): Promise<void> {
    if (this.valuationPending()) {
      return;
    }

    const raw = this.valuationSettingsForm.controls.notaryFeePct.value.trim();
    const normalizedInput = raw.replace(",", ".");
    const parsed = Number(normalizedInput);
    if (!raw || !Number.isFinite(parsed) || parsed < 0) {
      this.valuationFeedback.set("Le taux de frais de notaire doit être un nombre positif.");
      return;
    }
    const outputFormatRaw = this.valuationSettingsForm.controls.valuationAiOutputFormat.value;
    const normalizedOutputFormat = outputFormatRaw.trim();
    const assistantSoulRaw = this.valuationSettingsForm.controls.assistantSoul.value;
    const normalizedAssistantSoul = assistantSoulRaw.trim();

    this.valuationPending.set(true);

    try {
      const persisted = await this.appSettingsService.updateSettings({
        notaryFeePct: parsed,
        aiProvider: this.valuationSettingsForm.controls.aiProvider.value,
        valuationAiOutputFormat: normalizedOutputFormat || null,
        assistantSoul: normalizedAssistantSoul || null,
      });
      this.valuationSettingsForm.controls.notaryFeePct.setValue(
        this.formatNotaryFeePct(persisted.notaryFeePct),
      );
      this.valuationSettingsForm.controls.aiProvider.setValue(persisted.aiProvider);
      this.valuationSettingsForm.controls.valuationAiOutputFormat.setValue(
        persisted.valuationAiOutputFormat,
      );
      this.valuationSettingsForm.controls.assistantSoul.setValue(persisted.assistantSoul);
      this.valuationFeedback.set("Paramètre enregistré.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Enregistrement impossible.";
      this.valuationFeedback.set(message);
    } finally {
      this.valuationPending.set(false);
    }
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

  private async loadValuationSettings(): Promise<void> {
    const loaded = await this.appSettingsService.refresh();
    this.valuationSettingsForm.controls.notaryFeePct.setValue(
      this.formatNotaryFeePct(loaded.notaryFeePct),
    );
    this.valuationSettingsForm.controls.aiProvider.setValue(loaded.aiProvider);
    this.valuationSettingsForm.controls.valuationAiOutputFormat.setValue(
      loaded.valuationAiOutputFormat,
    );
    this.valuationSettingsForm.controls.assistantSoul.setValue(loaded.assistantSoul);
  }

  private formatNotaryFeePct(value: number): string {
    if (!Number.isFinite(value)) {
      return "";
    }

    return value.toFixed(2).replace(/\.00$/, "");
  }

  private compactTableText(value: string, maxLength = 240): string {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "";
    }

    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, maxLength - 1)}…`;
  }

  private tryParseJson(value: string): unknown | null {
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
      return null;
    }

    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private readStringField(record: Record<string, unknown>, key: string): string | null {
    const value = record[key];
    return typeof value === "string" && value.trim() ? value : null;
  }

  private extractFunctionNameFromCallId(callId: string | null): string | null {
    if (!callId) {
      return null;
    }

    const normalized = callId.trim();
    if (!normalized) {
      return null;
    }

    const match = normalized.match(/^call_([a-z0-9_]+?)(?:_\d+)?$/i);
    if (!match?.[1]) {
      return normalized;
    }

    const snake = match[1].toLowerCase();
    return snake.replace(/_([a-z0-9])/g, (_whole, letter: string) => letter.toUpperCase());
  }

  private extractOpenAIUserText(input: unknown[]): string | null {
    for (let index = input.length - 1; index >= 0; index -= 1) {
      const item = input[index];
      if (!this.isRecord(item) || item["role"] !== "user") {
        continue;
      }

      const content = Array.isArray(item["content"]) ? item["content"] : [];
      for (const chunk of content) {
        if (!this.isRecord(chunk)) {
          continue;
        }

        if (chunk["type"] !== "input_text" && chunk["type"] !== "output_text") {
          continue;
        }

        const text = this.readStringField(chunk, "text");
        if (text) {
          return text;
        }
      }
    }

    return null;
  }

  private extractOpenAIOutputText(output: unknown[]): string | null {
    const chunks: string[] = [];

    for (const item of output) {
      if (!this.isRecord(item)) {
        continue;
      }

      const content = Array.isArray(item["content"]) ? item["content"] : [];
      for (const chunk of content) {
        if (!this.isRecord(chunk)) {
          continue;
        }

        const text = this.readStringField(chunk, "text");
        if (text) {
          chunks.push(text);
        }
      }
    }

    if (chunks.length === 0) {
      return null;
    }

    return chunks.join(" ").trim();
  }
}
