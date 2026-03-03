import {
  getGlobalProviderSettings,
  normalizeGlobalAIProvider,
} from "../config/provider-settings";
import { AnthropicProvider } from "./anthropic-provider";
import { MockAIProvider } from "./mock-provider";
import { OpenAIProvider } from "./openai-provider";
import type { AIProvider } from "./provider";

type EnvLike = Record<string, string | undefined>;

export type AIProviderKind = "mock" | "openai" | "anthropic";
export type AppAIProvider = "openai" | "anthropic";

const DEFAULT_ANTHROPIC_MODEL = "claude-3-7-sonnet-20250219";
const DEFAULT_OPENAI_MODEL = "gpt-5.2";

const normalizeExplicitProvider = (env: EnvLike): AIProviderKind | null => {
  const explicitRaw = env.AI_ENGINE ?? env.AI_PROVIDER;
  const explicit = explicitRaw?.trim().toLowerCase();

  if (explicit === "mock") {
    return "mock";
  }
  if (explicit === "openai") {
    return "openai";
  }
  if (explicit === "anthropic") {
    return "anthropic";
  }

  return null;
};

export const resolveAIProviderKind = (env: EnvLike): AIProviderKind => {
  const explicit = normalizeExplicitProvider(env);
  if (explicit) {
    return explicit;
  }

  return "openai";
};

export const resolveAppAIProvider = (value: unknown): AppAIProvider => {
  return normalizeGlobalAIProvider(value);
};

const createOpenAIProvider = (env: EnvLike): AIProvider => {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY manquant pour AI provider openai");
  }

  return new OpenAIProvider({
    apiKey,
    baseUrl: env.OPENAI_BASE_URL,
    whisperModel: env.OPENAI_WHISPER_MODEL,
    chatModel: env.OPENAI_CHAT_MODEL ?? DEFAULT_OPENAI_MODEL,
  });
};

const createAnthropicProvider = (env: EnvLike): AIProvider => {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY manquant pour AI provider anthropic");
  }

  return new AnthropicProvider({
    apiKey,
    baseUrl: env.ANTHROPIC_BASE_URL,
    model: env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
  });
};

export const createAIProviderForKind = (
  kind: AIProviderKind,
  env: EnvLike = process.env,
): AIProvider => {
  if (kind === "openai") {
    return createOpenAIProvider(env);
  }

  if (kind === "anthropic") {
    return createAnthropicProvider(env);
  }

  return new MockAIProvider();
};

const singletonByKind = new Map<AIProviderKind, AIProvider>();

export const getAIProviderForKind = (
  kind: AIProviderKind,
  env: EnvLike = process.env,
): AIProvider => {
  const existing = singletonByKind.get(kind);
  if (existing) {
    return existing;
  }

  const provider = createAIProviderForKind(kind, env);
  singletonByKind.set(kind, provider);
  return provider;
};

export const getAIProvider = (): AIProvider => {
  const kind = resolveAIProviderKind(process.env);
  return getAIProviderForKind(kind, process.env);
};

export const resolveAIProviderKindForOrg = async (
  _orgId: string,
  env: EnvLike = process.env,
): Promise<AIProviderKind> => {
  const explicit = normalizeExplicitProvider(env);
  if (explicit) {
    return explicit;
  }

  const settings = await getGlobalProviderSettings();
  return settings.aiProvider === "anthropic" ? "anthropic" : "openai";
};

export const getAIProviderForOrg = async (orgId: string): Promise<AIProvider> => {
  const kind = await resolveAIProviderKindForOrg(orgId, process.env);
  return getAIProviderForKind(kind, process.env);
};
