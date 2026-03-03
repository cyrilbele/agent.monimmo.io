import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { MockAIProvider } from "./mock-provider";
import { clampPriceUsd, estimatePriceUsdFromUsage } from "./pricing";
import { externalFetch } from "../http/external-fetch";
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

const extractResponseText = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  const directOutput = record.output_text;
  if (typeof directOutput === "string" && directOutput.trim()) {
    return directOutput;
  }

  const output = Array.isArray(record.output) ? record.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const chunk of content) {
      if (!chunk || typeof chunk !== "object") {
        continue;
      }
      const text = (chunk as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) {
        parts.push(text);
      }
    }
  }

  return parts.join("\n").trim();
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

type OpenAIProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  whisperModel?: string;
  chatModel?: string;
};

export class OpenAIProvider implements AIProvider {
  private readonly fallbackProvider = new MockAIProvider();
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly whisperModel: string;
  private readonly chatModel: string;
  private readonly openai: ReturnType<typeof createOpenAI>;

  constructor(options: OpenAIProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    this.whisperModel = options.whisperModel ?? "whisper-1";
    this.chatModel = options.chatModel ?? "gpt-5.2";
    this.openai = createOpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
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
    const formData = new FormData();
    const fileBytes = Buffer.from(input.audioData);
    formData.append("model", this.whisperModel);
    formData.append(
      "file",
      new File([fileBytes], input.fileName || `vocal-${Date.now()}.wav`, {
        type: input.mimeType || "audio/wav",
      }),
    );

    const response = await externalFetch({
      service: "openai",
      url: `${this.baseUrl}/audio/transcriptions`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`OpenAI transcription failed (${response.status}): ${details}`);
    }

    const payload = (await response.json()) as { text?: string };
    const transcript = (payload.text ?? "").trim();

    return {
      transcript,
      summary: transcript ? transcript.slice(0, 280) : "",
      confidence: transcript ? 0.9 : 0.2,
      telemetry: {
        provider: "openai",
        model: this.whisperModel,
        prompt: [
          "Transcription audio OpenAI",
          `fileName: ${input.fileName}`,
          `mimeType: ${input.mimeType}`,
          `audioBytes: ${input.audioData.byteLength}`,
        ].join("\n"),
        responseText: transcript,
        price: 0,
      },
    };
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
        model: this.openai(this.chatModel),
        prompt,
        maxRetries: 0,
      });
      const responseText = result.text.trim();
      const usage = result.usage;
      const price = estimatePriceUsdFromUsage({
        provider: "openai",
        model: this.chatModel,
        usage,
        prompt,
        responseText,
      });

      return {
        text: responseText,
        telemetry: {
          provider: "openai",
          model: this.chatModel,
          prompt,
          responseText,
          price: clampPriceUsd(price),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        },
      };
    } catch {
      try {
        const legacyText = await this.requestJsonTextLegacy(prompt);
        const price = estimatePriceUsdFromUsage({
          provider: "openai",
          model: this.chatModel,
          prompt,
          responseText: legacyText,
        });

        return {
          text: legacyText,
          telemetry: {
            provider: "openai",
            model: this.chatModel,
            prompt,
            responseText: legacyText,
            price: clampPriceUsd(price),
          },
        };
      } catch (legacyError) {
        const details = legacyError instanceof Error ? legacyError.message : String(legacyError);
        throw new Error(`OpenAI responses failed: ${details}`);
      }
    }
  }

  private async requestJsonTextLegacy(prompt: string): Promise<string> {
    const response = await externalFetch({
      service: "openai",
      url: `${this.baseUrl}/responses`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.chatModel,
        input: prompt,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`OpenAI responses failed (${response.status}): ${details}`);
    }

    const payload = await response.json();
    return extractResponseText(payload);
  }
}
