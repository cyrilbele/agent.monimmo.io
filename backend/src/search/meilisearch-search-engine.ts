import type {
  PropertySearchInput,
  SearchEngine,
  UserSearchInput,
} from "./search-engine";

type EnvLike = Record<string, string | undefined>;

const buildWarningMessage = (env: EnvLike): string => {
  const host = env.MEILISEARCH_HOST?.trim();
  if (!host) {
    return "[Search][meilisearch] moteur sélectionné mais non configuré (MEILISEARCH_HOST manquant). Fallback SQL lexical uniquement.";
  }

  return "[Search][meilisearch] moteur sélectionné mais non implémenté. Fallback SQL lexical uniquement.";
};

export const createMeilisearchSearchEngine = (env: EnvLike = process.env): SearchEngine => {
  const warningMessage = buildWarningMessage(env);
  let warned = false;

  const warnOnce = (): void => {
    if (warned) {
      return;
    }

    warned = true;
    console.warn(warningMessage);
  };

  const searchFallback = async (_input: PropertySearchInput | UserSearchInput): Promise<string[] | null> => {
    warnOnce();
    return null;
  };

  return {
    kind: "meilisearch",
    upsertPropertyDocument: async () => {
      warnOnce();
    },
    searchPropertyIds: async (input: PropertySearchInput) => searchFallback(input),
    upsertUserDocument: async () => {
      warnOnce();
    },
    searchUserIds: async (input: UserSearchInput) => searchFallback(input),
  };
};
