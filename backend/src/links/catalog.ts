import type { ObjectFieldDefinition } from "../object-data/structure";

export type LinkObjectType = "bien" | "user" | "rdv" | "visite";

export type LinkType =
  | "bien_user"
  | "rdv_bien"
  | "rdv_user"
  | "visite_bien"
  | "visite_user";

export type LinkTypeDefinition = {
  typeLien: LinkType;
  name: string;
  objectType1: LinkObjectType;
  objectType2: LinkObjectType;
  paramsSchema: ObjectFieldDefinition[];
};

const relationRoleField: ObjectFieldDefinition = {
  key: "relationRole",
  name: "Rôle",
  group: "relation",
  type: "select",
  options: [
    { value: "OWNER", label: "Propriétaire" },
    { value: "PROSPECT", label: "Prospect" },
    { value: "ACHETEUR", label: "Acheteur" },
  ],
};

const LINK_TYPE_DEFINITIONS: Record<LinkType, LinkTypeDefinition> = {
  bien_user: {
    typeLien: "bien_user",
    name: "Lien bien-utilisateur",
    objectType1: "bien",
    objectType2: "user",
    paramsSchema: [relationRoleField],
  },
  rdv_bien: {
    typeLien: "rdv_bien",
    name: "Lien rendez-vous-bien",
    objectType1: "rdv",
    objectType2: "bien",
    paramsSchema: [],
  },
  rdv_user: {
    typeLien: "rdv_user",
    name: "Lien rendez-vous-utilisateur",
    objectType1: "rdv",
    objectType2: "user",
    paramsSchema: [relationRoleField],
  },
  visite_bien: {
    typeLien: "visite_bien",
    name: "Lien visite-bien",
    objectType1: "visite",
    objectType2: "bien",
    paramsSchema: [],
  },
  visite_user: {
    typeLien: "visite_user",
    name: "Lien visite-utilisateur",
    objectType1: "visite",
    objectType2: "user",
    paramsSchema: [relationRoleField],
  },
};

const cloneFieldDefinition = (field: ObjectFieldDefinition): ObjectFieldDefinition => ({
  ...field,
  options: field.options?.map((option) => ({ ...option })),
  hide: field.hide?.map((rule) => ({ ...rule })),
});

const cloneLinkTypeDefinition = (definition: LinkTypeDefinition): LinkTypeDefinition => ({
  ...definition,
  paramsSchema: definition.paramsSchema.map(cloneFieldDefinition),
});

export const isLinkObjectType = (value: unknown): value is LinkObjectType =>
  value === "bien" || value === "user" || value === "rdv" || value === "visite";

export const isLinkType = (value: unknown): value is LinkType =>
  value === "bien_user" ||
  value === "rdv_bien" ||
  value === "rdv_user" ||
  value === "visite_bien" ||
  value === "visite_user";

export const getLinkTypeDefinition = (typeLien: string): LinkTypeDefinition | null => {
  if (!isLinkType(typeLien)) {
    return null;
  }

  return cloneLinkTypeDefinition(LINK_TYPE_DEFINITIONS[typeLien]);
};

export const listLinkTypeDefinitions = (): LinkTypeDefinition[] =>
  (Object.keys(LINK_TYPE_DEFINITIONS) as LinkType[]).map((typeLien) =>
    cloneLinkTypeDefinition(LINK_TYPE_DEFINITIONS[typeLien]),
  );
