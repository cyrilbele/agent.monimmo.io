import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { MockAIProvider } from "./mock-provider";
import { clampPriceUsd, estimatePriceUsdFromUsage } from "./pricing";
import type {
  AICallTelemetry,
  AIProvider,
  ClassifyFileInput,
  ClassifyFileResult,
  DetectVocalTypeInput,
  DetectVocalTypeResult,
  ExtractInitialVisitPropertyParamsInput,
  ExtractInitialVisitPropertyParamsResult,
  ExtractVocalInsightsInput,
  ExtractVocalInsightsResult,
  MatchMessageToPropertyInput,
  MatchMessageToPropertyResult,
  PropertyValuationInput,
  PropertyValuationResult,
  TranscribeVocalInput,
  TranscribeVocalResult,
  VocalType,
} from "./provider";

const clampConfidence = (value: unknown, fallback = 0.5): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, numeric));
};

const extractJsonObject = (raw: string): Record<string, unknown> | null => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const direct = (() => {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }

  try {
    const sliced = trimmed.slice(start, end + 1);
    const parsed = JSON.parse(sliced) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
};

const sanitizeVocalType = (value: unknown): VocalType | null => {
  if (typeof value !== "string") {
    return null;
  }

  if (value === "VISITE_INITIALE") {
    return value;
  }
  if (value === "VISITE_SUIVI") {
    return value;
  }
  if (value === "COMPTE_RENDU_VISITE_CLIENT") {
    return value;
  }

  return null;
};

const sanitizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

type AnthropicProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
};

export class AnthropicProvider implements AIProvider {
  private readonly fallbackProvider = new MockAIProvider();
  private readonly model: string;
  private readonly anthropic: ReturnType<typeof createAnthropic>;

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model ?? "claude-3-7-sonnet-20250219";
    this.anthropic = createAnthropic({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
    });
  }

  async matchMessageToProperty(
    input: MatchMessageToPropertyInput,
  ): Promise<MatchMessageToPropertyResult> {
    return this.fallbackProvider.matchMessageToProperty(input);
  }

  async classifyFile(input: ClassifyFileInput): Promise<ClassifyFileResult> {
    return this.fallbackProvider.classifyFile(input);
  }

  async transcribeVocal(input: TranscribeVocalInput): Promise<TranscribeVocalResult> {
    return this.fallbackProvider.transcribeVocal(input);
  }

  async extractVocalInsights(
    input: ExtractVocalInsightsInput,
  ): Promise<ExtractVocalInsightsResult> {
    const generated = await this.requestJsonText([
      "Tu extrais des insights métier immobilier à partir d'une transcription d'appel vocal.",
      "Réponds uniquement en JSON: {\"insights\":object,\"confidence\":number}.",
      "confidence est entre 0 et 1.",
      "",
      `Transcript: ${input.transcript}`,
      `Summary: ${input.summary ?? ""}`,
    ]);

    const parsed = extractJsonObject(generated.text);
    if (!parsed) {
      return {
        insights: {},
        confidence: 0.2,
        telemetry: generated.telemetry,
      };
    }

    const rawInsights = parsed.insights;
    return {
      insights:
        rawInsights && typeof rawInsights === "object" && !Array.isArray(rawInsights)
          ? (rawInsights as Record<string, unknown>)
          : {},
      confidence: clampConfidence(parsed.confidence, 0.45),
      telemetry: generated.telemetry,
    };
  }

  async detectVocalType(input: DetectVocalTypeInput): Promise<DetectVocalTypeResult> {
    const generated = await this.requestJsonText([
      "Tu classes le type d'un vocal immobilier.",
      "Types autorisés: VISITE_INITIALE, VISITE_SUIVI, COMPTE_RENDU_VISITE_CLIENT.",
      "Réponds uniquement en JSON: {\"vocalType\":\"...|null\",\"confidence\":number,\"reasoning\":string}.",
      "",
      `Transcript: ${input.transcript}`,
      `Summary: ${input.summary ?? ""}`,
    ]);

    const parsed = extractJsonObject(generated.text);
    if (!parsed) {
      return {
        vocalType: null,
        confidence: 0.2,
        reasoning: "Réponse IA invalide",
        telemetry: generated.telemetry,
      };
    }

    return {
      vocalType: sanitizeVocalType(parsed.vocalType),
      confidence: clampConfidence(parsed.confidence, 0.45),
      reasoning:
        typeof parsed.reasoning === "string" && parsed.reasoning.trim()
          ? parsed.reasoning
          : "Classification IA",
      telemetry: generated.telemetry,
    };
  }

  async extractInitialVisitPropertyParams(
    input: ExtractInitialVisitPropertyParamsInput,
  ): Promise<ExtractInitialVisitPropertyParamsResult> {
    const generated = await this.requestJsonText([
      "Tu extrais des paramètres de bien depuis une transcription de visite initiale immobilière.",
      "Réponds uniquement en JSON:",
      "{\"title\":string|null,\"address\":string|null,\"city\":string|null,\"postalCode\":string|null,\"price\":number|null,\"details\":object,\"confidence\":number}.",
      "Ne pas inventer, utiliser null si absent.",
      "",
      `Transcript: ${input.transcript}`,
      `Summary: ${input.summary ?? ""}`,
    ]);

    const parsed = extractJsonObject(generated.text);
    if (!parsed) {
      return {
        title: null,
        address: null,
        city: null,
        postalCode: null,
        price: null,
        details: {},
        confidence: 0.2,
        telemetry: generated.telemetry,
      };
    }

    const rawPrice = parsed.price;
    const numericPrice = typeof rawPrice === "number" ? rawPrice : Number(rawPrice);
    const price = Number.isFinite(numericPrice) ? Math.round(numericPrice) : null;
    const rawDetails = parsed.details;

    return {
      title: sanitizeOptionalString(parsed.title),
      address: sanitizeOptionalString(parsed.address),
      city: sanitizeOptionalString(parsed.city),
      postalCode: sanitizeOptionalString(parsed.postalCode),
      price,
      details:
        rawDetails && typeof rawDetails === "object" && !Array.isArray(rawDetails)
          ? (rawDetails as Record<string, unknown>)
          : {},
      confidence: clampConfidence(parsed.confidence, 0.45),
      telemetry: generated.telemetry,
    };
  }

  async computePropertyValuation(input: PropertyValuationInput): Promise<PropertyValuationResult> {
    try {
      const generated = await this.requestJsonText([
        "Tu es un expert en valorisation immobilière en France.",
        "À partir des données fournies, propose une valorisation cohérente et justifiée.",
        "Réponds uniquement en JSON:",
        "{\"calculatedValuation\":number|null,\"justification\":string}.",
        "Ne renvoie aucun texte hors JSON (pas de préambule, pas de balises de code).",
        "La valeur justification doit être du Markdown (titres + listes à puces), pas du texte plat.",
        "Si les données sont insuffisantes, renvoie calculatedValuation à null et explique pourquoi.",
        "",
        input.prompt,
      ]);

      const parsed = extractJsonObject(generated.text);
      if (!parsed) {
        const fallback = await this.fallbackProvider.computePropertyValuation(input);
        return {
          ...fallback,
          telemetry: generated.telemetry,
        };
      }

      const rawValuation = parsed.calculatedValuation;
      const numericValuation =
        typeof rawValuation === "number" ? rawValuation : Number(rawValuation);
      const calculatedValuation =
        Number.isFinite(numericValuation) && numericValuation > 0 ? Math.round(numericValuation) : null;
      const justification =
        typeof parsed.justification === "string" && parsed.justification.trim()
          ? parsed.justification.trim()
          : "Justificatif IA indisponible.";

      return {
        calculatedValuation,
        justification,
        telemetry: generated.telemetry,
      };
    } catch {
      return this.fallbackProvider.computePropertyValuation(input);
    }
  }

  private async requestJsonText(promptLines: string[]): Promise<{
    text: string;
    telemetry: AICallTelemetry;
  }> {
    const prompt = promptLines.join("\n");

    try {
      const result = await generateText({
        model: this.anthropic(this.model),
        prompt,
      });
      const responseText = result.text.trim();
      const usage = result.usage;
      const price = estimatePriceUsdFromUsage({
        provider: "anthropic",
        model: this.model,
        usage,
        prompt,
        responseText,
      });

      return {
        text: responseText,
        telemetry: {
          provider: "anthropic",
          model: this.model,
          prompt,
          responseText,
          price: clampPriceUsd(price),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        },
      };
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      throw new Error(`Anthropic responses failed: ${details}`);
    }
  }
}

