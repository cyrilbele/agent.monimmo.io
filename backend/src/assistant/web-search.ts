import { resolveAIProviderKindForOrg } from "../ai/factory";
import { clampPriceUsd, estimatePriceUsdFromUsage } from "../ai/pricing";
import { externalFetch } from "../http/external-fetch";

export type AssistantCitation = {
  title: string;
  url: string;
  snippet: string;
};

export type AssistantWebSearchTrace = {
  provider: "openai" | "anthropic";
  model: string;
  prompt: string;
  responseText: string;
  price: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type AssistantWebSearchResult = {
  citations: AssistantCitation[];
  trace: AssistantWebSearchTrace | null;
};

const DEFAULT_OPENAI_MODEL = "gpt-5.2";
const DEFAULT_ANTHROPIC_MODEL = "claude-3-7-sonnet-20250219";
const MAX_CITATIONS = 5;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const asTokenCount = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
};

const serializeUnknown = (value: unknown): string => {
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

const normalizeCitation = (value: unknown): AssistantCitation | null => {
  if (!isRecord(value)) {
    return null;
  }

  const title = asString(value.title) ?? asString(value.source) ?? "Source web";
  const url = asString(value.url);
  const snippet = asString(value.snippet) ?? asString(value.text) ?? "";

  if (!url) {
    return null;
  }

  return {
    title,
    url,
    snippet,
  };
};

const dedupeCitations = (items: AssistantCitation[]): AssistantCitation[] => {
  const seen = new Set<string>();
  const output: AssistantCitation[] = [];

  for (const item of items) {
    const key = item.url.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(item);

    if (output.length >= MAX_CITATIONS) {
      break;
    }
  }

  return output;
};

const extractOpenAICitations = (payload: unknown): AssistantCitation[] => {
  if (!isRecord(payload)) {
    return [];
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const extracted: AssistantCitation[] = [];

  for (const item of output) {
    if (!isRecord(item)) {
      continue;
    }

    const content = Array.isArray(item.content) ? item.content : [];
    for (const chunk of content) {
      if (!isRecord(chunk)) {
        continue;
      }

      const annotations = Array.isArray(chunk.annotations) ? chunk.annotations : [];
      for (const annotation of annotations) {
        const normalized = normalizeCitation(annotation);
        if (normalized) {
          extracted.push(normalized);
        }
      }

      const direct = normalizeCitation(chunk);
      if (direct) {
        extracted.push(direct);
      }
    }

    const citations = Array.isArray(item.citations) ? item.citations : [];
    for (const citation of citations) {
      const normalized = normalizeCitation(citation);
      if (normalized) {
        extracted.push(normalized);
      }
    }
  }

  return dedupeCitations(extracted);
};

const extractAnthropicCitations = (payload: unknown): AssistantCitation[] => {
  if (!isRecord(payload)) {
    return [];
  }

  const content = Array.isArray(payload.content) ? payload.content : [];
  const extracted: AssistantCitation[] = [];

  for (const block of content) {
    if (!isRecord(block)) {
      continue;
    }

    const direct = normalizeCitation(block);
    if (direct) {
      extracted.push(direct);
    }

    const citations = Array.isArray(block.citations) ? block.citations : [];
    for (const citation of citations) {
      const normalized = normalizeCitation(citation);
      if (normalized) {
        extracted.push(normalized);
      }
    }

    const searchResults = Array.isArray(block.search_results) ? block.search_results : [];
    for (const result of searchResults) {
      const normalized = normalizeCitation(result);
      if (normalized) {
        extracted.push(normalized);
      }
    }
  }

  return dedupeCitations(extracted);
};

const buildTrace = (input: {
  provider: "openai" | "anthropic";
  model: string;
  prompt: string;
  responsePayload: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}): AssistantWebSearchTrace => {
  const responseText = serializeUnknown(input.responsePayload);
  const usage =
    input.inputTokens === null && input.outputTokens === null && input.totalTokens === null
      ? undefined
      : {
          inputTokens: input.inputTokens ?? undefined,
          outputTokens: input.outputTokens ?? undefined,
          totalTokens: input.totalTokens ?? undefined,
        };

  return {
    provider: input.provider,
    model: input.model,
    prompt: input.prompt,
    responseText,
    price: clampPriceUsd(
      estimatePriceUsdFromUsage({
        provider: input.provider,
        model: input.model,
        usage,
        prompt: input.prompt,
        responseText,
      }),
    ),
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalTokens: input.totalTokens,
  };
};

const searchOpenAI = async (query: string): Promise<AssistantWebSearchResult> => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { citations: [], trace: null };
  }

  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.OPENAI_CHAT_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  const prompt = query;
  const requestBody = {
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: "Effectue une recherche web et retourne des sources utiles.",
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: query,
          },
        ],
      },
    ],
    tools: [{ type: "web_search_preview" }],
    max_output_tokens: 600,
  };

  const response = await externalFetch({
    service: "assistant-openai-web-search",
    url: `${baseUrl}/responses`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    return { citations: [], trace: null };
  }

  const payload = (await response.json()) as unknown;
  const usage = isRecord(payload) && isRecord(payload.usage) ? payload.usage : {};
  const inputTokens = asTokenCount(usage.input_tokens ?? usage.inputTokens);
  const outputTokens = asTokenCount(usage.output_tokens ?? usage.outputTokens);
  const totalTokens =
    asTokenCount(usage.total_tokens ?? usage.totalTokens) ??
    (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);

  return {
    citations: extractOpenAICitations(payload),
    trace: buildTrace({
      provider: "openai",
      model,
      prompt,
      responsePayload: payload,
      inputTokens,
      outputTokens,
      totalTokens,
    }),
  };
};

const searchAnthropic = async (query: string): Promise<AssistantWebSearchResult> => {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { citations: [], trace: null };
  }

  const baseUrl = (process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1").replace(/\/+$/, "");
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
  const prompt = query;
  const requestBody = {
    model,
    max_tokens: 600,
    messages: [{ role: "user", content: query }],
    tools: [
      {
        name: "web_search",
        type: "web_search_20250305",
      },
    ],
  };

  const response = await externalFetch({
    service: "assistant-anthropic-web-search",
    url: `${baseUrl}/messages`,
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    return { citations: [], trace: null };
  }

  const payload = (await response.json()) as unknown;
  const usage = isRecord(payload) && isRecord(payload.usage) ? payload.usage : {};
  const inputTokens = asTokenCount(usage.input_tokens ?? usage.inputTokens);
  const outputTokens = asTokenCount(usage.output_tokens ?? usage.outputTokens);
  const totalTokens =
    asTokenCount(usage.total_tokens ?? usage.totalTokens) ??
    (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);

  return {
    citations: extractAnthropicCitations(payload),
    trace: buildTrace({
      provider: "anthropic",
      model,
      prompt,
      responsePayload: payload,
      inputTokens,
      outputTokens,
      totalTokens,
    }),
  };
};

export const assistantWebSearchProvider = {
  async search(input: { orgId: string; query: string }): Promise<AssistantWebSearchResult> {
    const normalizedQuery = input.query.trim();
    if (!normalizedQuery) {
      return { citations: [], trace: null };
    }

    try {
      const kind = await resolveAIProviderKindForOrg(input.orgId, process.env);
      if (kind === "anthropic") {
        return searchAnthropic(normalizedQuery);
      }

      return searchOpenAI(normalizedQuery);
    } catch {
      return { citations: [], trace: null };
    }
  },
};
