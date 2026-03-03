import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { platformSettings } from "../db/schema";

export type GlobalAIProvider = "openai" | "anthropic";
export type GlobalSearchEngine = "qmd" | "meilisearch";
export type GlobalStorageProvider = "local" | "s3";
export type GlobalEmailProvider = "smtp-server" | "google";
export type GlobalCalendarProvider = "google";

export type GlobalProviderSettings = {
  aiProvider: GlobalAIProvider;
  searchEngine: GlobalSearchEngine;
  storageProvider: GlobalStorageProvider;
  emailProvider: GlobalEmailProvider;
  calendarProvider: GlobalCalendarProvider;
};

const PLATFORM_SETTINGS_ID = "global";

export const normalizeGlobalAIProvider = (value: unknown): GlobalAIProvider => {
  if (typeof value === "string" && value.trim().toLowerCase() === "anthropic") {
    return "anthropic";
  }

  return "openai";
};

export const normalizeGlobalSearchEngine = (value: unknown): GlobalSearchEngine => {
  if (typeof value === "string" && value.trim().toLowerCase() === "meilisearch") {
    return "meilisearch";
  }

  return "qmd";
};

export const normalizeGlobalStorageProvider = (value: unknown): GlobalStorageProvider => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "s3" || normalized === "aws-s3" || normalized === "aws_s3") {
      return "s3";
    }
    if (normalized === "local" || normalized === "filesystem") {
      return "local";
    }
  }

  return "local";
};

export const normalizeGlobalEmailProvider = (value: unknown): GlobalEmailProvider => {
  if (typeof value === "string" && value.trim().toLowerCase() === "google") {
    return "google";
  }

  return "smtp-server";
};

export const normalizeGlobalCalendarProvider = (
  value: unknown,
): GlobalCalendarProvider => {
  if (typeof value === "string" && value.trim().toLowerCase() === "google") {
    return "google";
  }

  return "google";
};

const toNormalizedSettings = (row: typeof platformSettings.$inferSelect): GlobalProviderSettings => ({
  aiProvider: normalizeGlobalAIProvider(row.aiProvider),
  searchEngine: normalizeGlobalSearchEngine(row.searchEngine),
  storageProvider: normalizeGlobalStorageProvider(row.storageProvider),
  emailProvider: normalizeGlobalEmailProvider(row.emailProvider),
  calendarProvider: normalizeGlobalCalendarProvider(row.calendarProvider),
});

const ensurePlatformSettingsRow = async (): Promise<typeof platformSettings.$inferSelect> => {
  const now = new Date();
  await db
    .insert(platformSettings)
    .values({
      id: PLATFORM_SETTINGS_ID,
      aiProvider: "openai",
      searchEngine: "qmd",
      storageProvider: "local",
      emailProvider: "smtp-server",
      calendarProvider: "google",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: platformSettings.id });

  const row = await db.query.platformSettings.findFirst({
    where: eq(platformSettings.id, PLATFORM_SETTINGS_ID),
  });

  if (!row) {
    throw new Error("Paramètres globaux introuvables");
  }

  return row;
};

export const getGlobalProviderSettings = async (): Promise<GlobalProviderSettings> => {
  const row = await ensurePlatformSettingsRow();
  return toNormalizedSettings(row);
};

export const updateGlobalProviderSettings = async (
  input: Partial<GlobalProviderSettings>,
): Promise<GlobalProviderSettings> => {
  const current = await ensurePlatformSettingsRow();

  const next: GlobalProviderSettings = {
    aiProvider:
      typeof input.aiProvider === "string"
        ? normalizeGlobalAIProvider(input.aiProvider)
        : normalizeGlobalAIProvider(current.aiProvider),
    searchEngine:
      typeof input.searchEngine === "string"
        ? normalizeGlobalSearchEngine(input.searchEngine)
        : normalizeGlobalSearchEngine(current.searchEngine),
    storageProvider:
      typeof input.storageProvider === "string"
        ? normalizeGlobalStorageProvider(input.storageProvider)
        : normalizeGlobalStorageProvider(current.storageProvider),
    emailProvider:
      typeof input.emailProvider === "string"
        ? normalizeGlobalEmailProvider(input.emailProvider)
        : normalizeGlobalEmailProvider(current.emailProvider),
    calendarProvider:
      typeof input.calendarProvider === "string"
        ? normalizeGlobalCalendarProvider(input.calendarProvider)
        : normalizeGlobalCalendarProvider(current.calendarProvider),
  };

  await db
    .update(platformSettings)
    .set({
      aiProvider: next.aiProvider,
      searchEngine: next.searchEngine,
      storageProvider: next.storageProvider,
      emailProvider: next.emailProvider,
      calendarProvider: next.calendarProvider,
      updatedAt: new Date(),
    })
    .where(eq(platformSettings.id, PLATFORM_SETTINGS_ID));

  return next;
};
