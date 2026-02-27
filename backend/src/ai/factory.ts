import { MockAIProvider } from "./mock-provider";
import { OpenAIProvider } from "./openai-provider";
import type { AIProvider } from "./provider";

type EnvLike = Record<string, string | undefined>;

export type AIProviderKind = "mock" | "openai";

export const resolveAIProviderKind = (env: EnvLike): AIProviderKind => {
  const explicit = env.AI_PROVIDER?.toLowerCase();

  if (explicit === "openai") {
    return "openai";
  }

  if (explicit === "mock") {
    return "mock";
  }

  return "mock";
};

export const createAIProvider = (env: EnvLike = process.env): AIProvider => {
  const kind = resolveAIProviderKind(env);

  if (kind === "openai") {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY manquant pour AI_PROVIDER=openai");
    }

    return new OpenAIProvider({
      apiKey,
      baseUrl: env.OPENAI_BASE_URL,
      whisperModel: env.OPENAI_WHISPER_MODEL,
      chatModel: env.OPENAI_CHAT_MODEL ?? "chatgpt-5.2",
    });
  }

  if (kind === "mock") {
    return new MockAIProvider();
  }

  return new MockAIProvider();
};

let aiProviderSingleton: AIProvider | null = null;

export const getAIProvider = (): AIProvider => {
  aiProviderSingleton ??= createAIProvider(process.env);
  return aiProviderSingleton;
};
