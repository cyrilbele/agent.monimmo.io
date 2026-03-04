import { and, desc, eq, lte } from "drizzle-orm";
import { redactSensitiveText } from "../privacy/redaction";
import { db } from "../db/client";
import { aiCallLogs } from "../db/schema";
import type { AICallTelemetry } from "./provider";
import { clampPriceUsd } from "./pricing";

export const AI_CALL_USE_CASES = [
  "MESSAGE_PROPERTY_MATCH",
  "FILE_CLASSIFICATION",
  "VOCAL_TRANSCRIPTION",
  "VOCAL_PROPERTY_MATCH",
  "VOCAL_TYPE_DETECTION",
  "VOCAL_INITIAL_VISIT_EXTRACTION",
  "VOCAL_INSIGHTS_EXTRACTION",
  "PROPERTY_VALUATION",
  "ASSISTANT_CHAT",
  "ASSISTANT_WEB_SEARCH",
] as const;

export type AICallUseCase = (typeof AI_CALL_USE_CASES)[number];

export type AICallLogRow = {
  id: string;
  datetime: string;
  orgId: string;
  useCase: AICallUseCase;
  prompt: string;
  textResponse: string;
  price: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  redactionVersion: string;
  expiresAt: string;
};

const MAX_FIELD_LENGTH = 100_000;
const REDACTION_VERSION = "v1";
const DEFAULT_RETENTION_DAYS = 90;

const resolveRetentionDays = (env: Record<string, string | undefined> = process.env): number => {
  const raw = Number(env.AI_CALL_LOG_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_RETENTION_DAYS;
  }

  return Math.min(Math.floor(raw), 365);
};

const truncate = (value: string): string => {
  if (value.length <= MAX_FIELD_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_FIELD_LENGTH)}\n...[truncated]`;
};

const toText = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || typeof value === "undefined") {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const toRedactedText = (value: unknown): string => redactSensitiveText(toText(value));

const toExpiresAt = (createdAt: Date): Date =>
  new Date(createdAt.getTime() + resolveRetentionDays() * 24 * 60 * 60 * 1000);

const sanitizeTokenCount = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
};

const toAICallLogRow = (row: typeof aiCallLogs.$inferSelect): AICallLogRow => ({
  id: row.id,
  datetime: row.createdAt.toISOString(),
  orgId: row.orgId,
  useCase: row.useCase as AICallUseCase,
  prompt: row.promptRedacted || row.prompt,
  textResponse: row.responseTextRedacted || row.responseText,
  price: clampPriceUsd(row.price),
  inputTokens: row.inputTokens ?? null,
  outputTokens: row.outputTokens ?? null,
  totalTokens: row.totalTokens ?? null,
  redactionVersion: row.redactionVersion || REDACTION_VERSION,
  expiresAt: row.expiresAt.toISOString(),
});

export const aiCallLogsService = {
  async list(input: { orgId: string; limit: number }): Promise<{ items: AICallLogRow[] }> {
    const rows = await db
      .select()
      .from(aiCallLogs)
      .where(eq(aiCallLogs.orgId, input.orgId))
      .orderBy(desc(aiCallLogs.createdAt), desc(aiCallLogs.id))
      .limit(input.limit);

    return {
      items: rows.map(toAICallLogRow),
    };
  },

  async create(input: {
    orgId: string;
    useCase: AICallUseCase;
    prompt: string;
    textResponse: string;
    price: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    createdAt?: Date;
  }): Promise<AICallLogRow> {
    const now = input.createdAt ?? new Date();
    const id = crypto.randomUUID();
    const promptRaw = truncate(toText(input.prompt));
    const textResponseRaw = truncate(toText(input.textResponse));
    const promptRedacted = truncate(toRedactedText(input.prompt));
    const textResponseRedacted = truncate(toRedactedText(input.textResponse));
    const price = clampPriceUsd(input.price);
    const expiresAt = toExpiresAt(now);

    await db.insert(aiCallLogs).values({
      id,
      orgId: input.orgId,
      useCase: input.useCase,
      prompt: promptRaw,
      responseText: textResponseRaw,
      promptRedacted,
      responseTextRedacted: textResponseRedacted,
      redactionVersion: REDACTION_VERSION,
      price,
      inputTokens: sanitizeTokenCount(input.inputTokens),
      outputTokens: sanitizeTokenCount(input.outputTokens),
      totalTokens: sanitizeTokenCount(input.totalTokens),
      expiresAt,
      createdAt: now,
    });

    const created = await db.query.aiCallLogs.findFirst({
      where: and(eq(aiCallLogs.id, id), eq(aiCallLogs.orgId, input.orgId)),
    });

    if (!created) {
      throw new Error("AI_CALL_LOG_CREATE_FAILED");
    }

    return toAICallLogRow(created);
  },

  async purgeExpired(input?: { now?: Date }): Promise<{ deleted: number }> {
    const now = input?.now ?? new Date();
    const expiredRows = await db
      .select({ id: aiCallLogs.id })
      .from(aiCallLogs)
      .where(lte(aiCallLogs.expiresAt, now));

    if (expiredRows.length === 0) {
      return { deleted: 0 };
    }

    await db.delete(aiCallLogs).where(lte(aiCallLogs.expiresAt, now));
    return { deleted: expiredRows.length };
  },
};

export const trackAICallSafe = async (input: {
  orgId: string;
  useCase: AICallUseCase;
  prompt: string;
  textResponse: string;
  price?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): Promise<void> => {
  try {
    await aiCallLogsService.create({
      orgId: input.orgId,
      useCase: input.useCase,
      prompt: input.prompt,
      textResponse: input.textResponse,
      price: clampPriceUsd(input.price ?? 0),
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      totalTokens: input.totalTokens,
    });
  } catch (error) {
    console.warn("[AI][CALL_LOG] track failed", error);
  }
};

export const trackAICallFromTelemetrySafe = async (input: {
  orgId: string;
  useCase: AICallUseCase;
  fallbackPrompt: string;
  fallbackResponse: unknown;
  telemetry?: AICallTelemetry;
}): Promise<void> => {
  const prompt = input.telemetry?.prompt ?? input.fallbackPrompt;
  const responseText =
    input.telemetry?.responseText && input.telemetry.responseText.trim()
      ? input.telemetry.responseText
      : toText(input.fallbackResponse);
  const price = input.telemetry?.price ?? 0;

  await trackAICallSafe({
    orgId: input.orgId,
    useCase: input.useCase,
    prompt: toText(prompt),
    textResponse: responseText,
    price,
    inputTokens: input.telemetry?.inputTokens,
    outputTokens: input.telemetry?.outputTokens,
    totalTokens: input.telemetry?.totalTokens,
  });
};

export const serializeAICallValue = toText;
