import { describe, expect, it } from "bun:test";
import {
  buildPropertyQmdDocument,
  extractPropertyIdsFromQmdSearchResult,
  propertyQmdCollectionNameForOrg,
} from "../src/properties/qmd-search";

type PropertyRowInput = Parameters<typeof buildPropertyQmdDocument>[0];

const buildPropertyRow = (): PropertyRowInput => ({
  id: "2f5fdaf2-4d0f-45e4-9d12-8c9b7f2f7ea9",
  orgId: "org_demo",
  title: "Maison de famille",
  city: "Nice",
  postalCode: "06000",
  address: "12 avenue de Verdun",
  price: 520000,
  details: JSON.stringify({
    general: {
      propertyType: "MAISON",
      isInCopropriete: false,
    },
    characteristics: {
      rooms: 5,
      livingArea: 120,
    },
    amenities: {
      pool: "OUI",
    },
  }),
  hiddenExpectedDocumentKeys: JSON.stringify([
    "mandat::MANDAT_VENTE_SIGNE",
    "technique::DPE",
  ]),
  status: "MANDAT_SIGNE",
  createdAt: new Date("2026-03-02T10:00:00.000Z"),
  updatedAt: new Date("2026-03-02T11:00:00.000Z"),
});

const toPropertyDocumentFileName = (propertyId: string): string =>
  `property-${Buffer.from(propertyId, "utf8").toString("hex")}.md`;

describe("properties qmd document", () => {
  it("rend tous les parametres en format cle/valeur lisible", () => {
    const property = buildPropertyRow();
    const document = buildPropertyQmdDocument(property);

    expect(document).toContain("# Bien - Maison de famille");
    expect(document).toContain("## Parametres du bien (cle / valeur)");
    expect(document).toContain("- `id`: 2f5fdaf2-4d0f-45e4-9d12-8c9b7f2f7ea9");
    expect(document).toContain("- `orgId`: org_demo");
    expect(document).toContain("- `city`: Nice");
    expect(document).toContain("- `price`: 520000");
    expect(document).toContain("- `hiddenExpectedDocumentKeys`: mandat::MANDAT_VENTE_SIGNE | technique::DPE");
    expect(document).toContain("- `details.general.propertyType`: MAISON");
    expect(document).toContain("- `details.general.isInCopropriete`: non");
    expect(document).toContain("- `details.characteristics.rooms`: 5");
    expect(document).toContain("- `details.amenities.pool`: OUI");
  });

  it("isole les resultats QMD par organisation", () => {
    const orgA = "org_demo";
    const orgB = "org_other";
    const collectionA = propertyQmdCollectionNameForOrg(orgA);
    const collectionB = propertyQmdCollectionNameForOrg(orgB);

    expect(collectionA).not.toBe(collectionB);

    const propertyIdA = "property-org-a";
    const propertyIdB = "property-org-b";

    const searchOutput = JSON.stringify([
      {
        file: `qmd://${collectionA}/${toPropertyDocumentFileName(propertyIdA)}`,
      },
      {
        file: `qmd://${collectionB}/${toPropertyDocumentFileName(propertyIdB)}`,
      },
      {
        file: `qmd://${collectionA}/invalid-file.md`,
      },
    ]);

    expect(extractPropertyIdsFromQmdSearchResult(searchOutput, orgA)).toEqual([propertyIdA]);
    expect(extractPropertyIdsFromQmdSearchResult(searchOutput, orgB)).toEqual([propertyIdB]);
  });
});
