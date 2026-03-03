import { createMeilisearchSearchEngine } from "./meilisearch-search-engine";
import { createQmdSearchEngine } from "./qmd-search-engine";
import type { SearchEngine, SearchEngineKind } from "./search-engine";

type EnvLike = Record<string, string | undefined>;

export const resolveSearchEngineKind = (env: EnvLike): SearchEngineKind => {
  const explicit = env.SEARCH_ENGINE?.trim().toLowerCase();

  if (explicit === "qmd") {
    return "qmd";
  }

  if (explicit === "meilisearch") {
    return "meilisearch";
  }

  return "qmd";
};

export const createSearchEngine = (env: EnvLike = process.env): SearchEngine => {
  const kind = resolveSearchEngineKind(env);

  if (kind === "meilisearch") {
    return createMeilisearchSearchEngine(env);
  }

  return createQmdSearchEngine();
};

let searchEngineSingleton: SearchEngine | null = null;

export const getSearchEngine = (): SearchEngine => {
  searchEngineSingleton ??= createSearchEngine(process.env);
  return searchEngineSingleton;
};
