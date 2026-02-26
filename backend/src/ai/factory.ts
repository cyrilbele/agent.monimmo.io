import { MockAIProvider } from "./mock-provider";
import type { AIProvider } from "./provider";

type EnvLike = Record<string, string | undefined>;

export type AIProviderKind = "mock";

export const resolveAIProviderKind = (env: EnvLike): AIProviderKind => {
  const explicit = env.AI_PROVIDER?.toLowerCase();

  if (explicit === "mock") {
    return "mock";
  }

  return "mock";
};

export const createAIProvider = (env: EnvLike = process.env): AIProvider => {
  const kind = resolveAIProviderKind(env);

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
