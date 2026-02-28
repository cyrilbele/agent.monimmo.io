import { MockAIProvider } from "./mock-provider";
import { externalFetch } from "../http/external-fetch";
import type {
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

  constructor(options: OpenAIProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    this.whisperModel = options.whisperModel ?? "whisper-1";
    this.chatModel = options.chatModel ?? "chatgpt-5.2";
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
    };
  }

  async extractVocalInsights(
    input: ExtractVocalInsightsInput,
  ): Promise<ExtractVocalInsightsResult> {
    const raw = await this.requestJsonText([
      "Tu extrais des insights métier immobilier à partir d'une transcription d'appel vocal.",
      "Réponds uniquement en JSON: {\"insights\":object,\"confidence\":number}.",
      "confidence est entre 0 et 1.",
      "",
      `Transcript: ${input.transcript}`,
      `Summary: ${input.summary ?? ""}`,
    ]);

    const parsed = extractJsonObject(raw);
    if (!parsed) {
      return {
        insights: {},
        confidence: 0.2,
      };
    }

    const rawInsights = parsed.insights;
    return {
      insights:
        rawInsights && typeof rawInsights === "object" && !Array.isArray(rawInsights)
          ? (rawInsights as Record<string, unknown>)
          : {},
      confidence: clampConfidence(parsed.confidence, 0.45),
    };
  }

  async detectVocalType(input: DetectVocalTypeInput): Promise<DetectVocalTypeResult> {
    const raw = await this.requestJsonText([
      "Tu classes le type d'un vocal immobilier.",
      "Types autorisés: VISITE_INITIALE, VISITE_SUIVI, COMPTE_RENDU_VISITE_CLIENT.",
      "Réponds uniquement en JSON: {\"vocalType\":\"...|null\",\"confidence\":number,\"reasoning\":string}.",
      "",
      `Transcript: ${input.transcript}`,
      `Summary: ${input.summary ?? ""}`,
    ]);

    const parsed = extractJsonObject(raw);
    if (!parsed) {
      return {
        vocalType: null,
        confidence: 0.2,
        reasoning: "Réponse IA invalide",
      };
    }

    return {
      vocalType: sanitizeVocalType(parsed.vocalType),
      confidence: clampConfidence(parsed.confidence, 0.45),
      reasoning:
        typeof parsed.reasoning === "string" && parsed.reasoning.trim()
          ? parsed.reasoning
          : "Classification IA",
    };
  }

  async extractInitialVisitPropertyParams(
    input: ExtractInitialVisitPropertyParamsInput,
  ): Promise<ExtractInitialVisitPropertyParamsResult> {
    const raw = await this.requestJsonText([
      "Tu extrais des paramètres de bien depuis une transcription de visite initiale immobilière.",
      "Réponds uniquement en JSON:",
      "{\"title\":string|null,\"address\":string|null,\"city\":string|null,\"postalCode\":string|null,\"price\":number|null,\"details\":object,\"confidence\":number}.",
      "Ne pas inventer, utiliser null si absent.",
      "",
      `Transcript: ${input.transcript}`,
      `Summary: ${input.summary ?? ""}`,
    ]);

    const parsed = extractJsonObject(raw);
    if (!parsed) {
      return {
        title: null,
        address: null,
        city: null,
        postalCode: null,
        price: null,
        details: {},
        confidence: 0.2,
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
    };
  }

  private async requestJsonText(promptLines: string[]): Promise<string> {
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
        input: promptLines.join("\n"),
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
