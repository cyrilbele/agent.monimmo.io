import { describe, expect, it } from "bun:test";
import {
  buildUserQmdDocument,
  extractUserIdsFromQmdSearchResult,
  userQmdCollectionNameForOrg,
} from "../src/users/qmd-search";

type UserRowInput = Parameters<typeof buildUserQmdDocument>[0];
type LinkedPropertiesInput = Parameters<typeof buildUserQmdDocument>[1];

const buildUserRow = (): UserRowInput => ({
  id: "5f57cbaf-8d74-4c53-b523-5933f9f8cc6b",
  orgId: "org_demo",
  email: "lea.dupont@monimmo.fr",
  firstName: "Lea",
  lastName: "Dupont",
  phone: "0611223344",
  address: "15 rue de la Paix",
  postalCode: "75002",
  city: "Paris",
  personalNotes: "A rappeler en soiree.",
  accountType: "CLIENT",
  role: "OWNER",
  passwordHash: "hash",
  createdAt: new Date("2026-03-02T10:00:00.000Z"),
  updatedAt: new Date("2026-03-02T11:00:00.000Z"),
});

const buildLinkedProperties = (): LinkedPropertiesInput => [
  {
    propertyId: "property_demo_1",
    title: "Maison centre-ville",
    city: "Paris",
    postalCode: "75011",
    status: "MANDAT_SIGNE",
    relationRole: "OWNER",
    source: "USER_LINK",
  },
];

const toUserDocumentFileName = (userId: string): string =>
  `user-${Buffer.from(userId, "utf8").toString("hex")}.md`;

describe("users qmd document", () => {
  it("rend toutes les informations utilisateur en format cle/valeur lisible", () => {
    const document = buildUserQmdDocument(buildUserRow(), buildLinkedProperties());

    expect(document).toContain("# Utilisateur - Lea Dupont");
    expect(document).toContain("## Parametres de l'utilisateur (cle / valeur)");
    expect(document).toContain("- `id`: 5f57cbaf-8d74-4c53-b523-5933f9f8cc6b");
    expect(document).toContain("- `email`: lea.dupont@monimmo.fr");
    expect(document).toContain("- `phone`: 0611223344");
    expect(document).toContain("- `personalNotes`: A rappeler en soiree.");
    expect(document).toContain("- `accountType`: CLIENT");
    expect(document).toContain("- `linkedProperties[0].title`: Maison centre-ville");
    expect(document).toContain("- `linkedProperties[0].relationRole`: OWNER");
  });

  it("isole les resultats QMD par organisation", () => {
    const orgA = "org_demo";
    const orgB = "org_other";
    const collectionA = userQmdCollectionNameForOrg(orgA);
    const collectionB = userQmdCollectionNameForOrg(orgB);

    expect(collectionA).not.toBe(collectionB);

    const userIdA = "user-org-a";
    const userIdB = "user-org-b";

    const searchOutput = JSON.stringify([
      {
        file: `qmd://${collectionA}/${toUserDocumentFileName(userIdA)}`,
      },
      {
        file: `qmd://${collectionB}/${toUserDocumentFileName(userIdB)}`,
      },
      {
        file: `qmd://${collectionA}/invalid-file.md`,
      },
    ]);

    expect(extractUserIdsFromQmdSearchResult(searchOutput, orgA)).toEqual([userIdA]);
    expect(extractUserIdsFromQmdSearchResult(searchOutput, orgB)).toEqual([userIdB]);
  });
});
