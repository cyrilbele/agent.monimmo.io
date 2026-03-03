type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

type ProviderKind = "openai" | "anthropic";

type Rate = {
  inputUsdPer1MTokens: number;
  outputUsdPer1MTokens: number;
};

const roundUsd = (value: number): number => Number(value.toFixed(6));

const parsePositiveNumber = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const resolveOpenAIRate = (model: string): Rate => {
  const normalized = model.trim().toLowerCase();

  if (normalized.includes("nano")) {
    return { inputUsdPer1MTokens: 0.1, outputUsdPer1MTokens: 0.4 };
  }

  if (normalized.includes("mini")) {
    return { inputUsdPer1MTokens: 0.3, outputUsdPer1MTokens: 1.2 };
  }

  return { inputUsdPer1MTokens: 1.5, outputUsdPer1MTokens: 6 };
};

const resolveAnthropicRate = (model: string): Rate => {
  const normalized = model.trim().toLowerCase();

  if (normalized.includes("haiku")) {
    return { inputUsdPer1MTokens: 0.8, outputUsdPer1MTokens: 4 };
  }

  if (normalized.includes("opus")) {
    return { inputUsdPer1MTokens: 15, outputUsdPer1MTokens: 75 };
  }

  return { inputUsdPer1MTokens: 3, outputUsdPer1MTokens: 15 };
};

const resolveRateFromEnv = (
  provider: ProviderKind,
  env: Record<string, string | undefined>,
): Rate | null => {
  const providerPrefix = provider.toUpperCase();
  const providerInput = parsePositiveNumber(env[`${providerPrefix}_PRICE_INPUT_USD_PER_1M`]);
  const providerOutput = parsePositiveNumber(env[`${providerPrefix}_PRICE_OUTPUT_USD_PER_1M`]);

  if (providerInput !== null && providerOutput !== null) {
    return {
      inputUsdPer1MTokens: providerInput,
      outputUsdPer1MTokens: providerOutput,
    };
  }

  const genericInput = parsePositiveNumber(env.AI_PRICE_INPUT_USD_PER_1M);
  const genericOutput = parsePositiveNumber(env.AI_PRICE_OUTPUT_USD_PER_1M);

  if (genericInput !== null && genericOutput !== null) {
    return {
      inputUsdPer1MTokens: genericInput,
      outputUsdPer1MTokens: genericOutput,
    };
  }

  return null;
};

const resolveRate = (
  provider: ProviderKind,
  model: string,
  env: Record<string, string | undefined>,
): Rate => {
  const envRate = resolveRateFromEnv(provider, env);
  if (envRate) {
    return envRate;
  }

  return provider === "anthropic" ? resolveAnthropicRate(model) : resolveOpenAIRate(model);
};

const resolveTokenCount = (
  primary: number | undefined,
  fallback: number,
): number => {
  if (typeof primary === "number" && Number.isFinite(primary) && primary >= 0) {
    return primary;
  }

  return fallback;
};

const estimateTokenCountFromText = (text: string): number => {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }

  return Math.max(1, Math.ceil(normalized.length / 4));
};

export const estimatePriceUsdFromUsage = (input: {
  provider: ProviderKind;
  model: string;
  usage?: UsageLike;
  prompt: string;
  responseText: string;
  env?: Record<string, string | undefined>;
}): number => {
  const env = input.env ?? process.env;
  const rate = resolveRate(input.provider, input.model, env);
  const fallbackInputTokens = estimateTokenCountFromText(input.prompt);
  const fallbackOutputTokens = estimateTokenCountFromText(input.responseText);
  const inputTokens = resolveTokenCount(input.usage?.inputTokens, fallbackInputTokens);
  const outputTokens = resolveTokenCount(input.usage?.outputTokens, fallbackOutputTokens);

  const inputCost = (inputTokens / 1_000_000) * rate.inputUsdPer1MTokens;
  const outputCost = (outputTokens / 1_000_000) * rate.outputUsdPer1MTokens;
  return roundUsd(Math.max(0, inputCost + outputCost));
};

export const estimateOpenAITranscriptionPriceUsd = (input: {
  durationInSeconds?: number;
  env?: Record<string, string | undefined>;
}): number => {
  const env = input.env ?? process.env;
  const pricePerMinute =
    parsePositiveNumber(env.OPENAI_WHISPER_PRICE_USD_PER_MINUTE) ?? 0.006;
  const durationInSeconds =
    typeof input.durationInSeconds === "number" &&
    Number.isFinite(input.durationInSeconds) &&
    input.durationInSeconds > 0
      ? input.durationInSeconds
      : 0;

  return roundUsd((durationInSeconds / 60) * pricePerMinute);
};

export const clampPriceUsd = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return roundUsd(value);
};

