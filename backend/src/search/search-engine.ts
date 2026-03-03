import { properties, users } from "../db/schema";

export type SearchEngineKind = "qmd" | "meilisearch";

export type PropertyRow = typeof properties.$inferSelect;
export type UserRow = typeof users.$inferSelect;

export type PropertySearchInput = {
  query: string;
  limit: number;
  orgId: string;
};

export type UserSearchInput = {
  query: string;
  limit: number;
  orgId: string;
};

export interface SearchEngine {
  readonly kind: SearchEngineKind;
  upsertPropertyDocument(property: PropertyRow): Promise<void>;
  searchPropertyIds(input: PropertySearchInput): Promise<string[] | null>;
  upsertUserDocument(user: UserRow): Promise<void>;
  searchUserIds(input: UserSearchInput): Promise<string[] | null>;
}
