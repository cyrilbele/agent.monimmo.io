import {
  searchPropertyIdsWithQmd,
  upsertPropertyQmdDocument,
} from "../properties/qmd-search";
import { searchUserIdsWithQmd, upsertUserQmdDocument } from "../users/qmd-search";
import type {
  PropertySearchInput,
  SearchEngine,
  UserSearchInput,
} from "./search-engine";

export const createQmdSearchEngine = (): SearchEngine => ({
  kind: "qmd",
  upsertPropertyDocument: async (property) => upsertPropertyQmdDocument(property),
  searchPropertyIds: async (input: PropertySearchInput) =>
    searchPropertyIdsWithQmd(input.query, input.limit, input.orgId),
  upsertUserDocument: async (user) => upsertUserQmdDocument(user),
  searchUserIds: async (input: UserSearchInput) =>
    searchUserIdsWithQmd(input.query, input.limit, input.orgId),
});
