import { describe, expect, it } from "bun:test";
import { TypeDocumentSchema } from "../src/dto/zod";

const expectedTypes = [
  "PIECE_IDENTITE",
  "LIVRET_FAMILLE",
  "CONTRAT_MARIAGE_PACS",
  "JUGEMENT_DIVORCE",
  "TITRE_PROPRIETE",
  "ATTESTATION_NOTARIALE",
  "TAXE_FONCIERE",
  "REFERENCE_CADASTRALE",
  "MANDAT_VENTE_SIGNE",
  "OFFRE_ACHAT_SIGNEE",
  "DPE",
  "AMIANTE",
  "PLOMB",
  "ELECTRICITE",
  "GAZ",
  "TERMITES",
  "ERP_ETAT_RISQUES",
  "ASSAINISSEMENT",
  "LOI_CARREZ",
  "REGLEMENT_COPROPRIETE",
  "ETAT_DESCRIPTIF_DIVISION",
  "PV_AG_3_DERNIERES_ANNEES",
  "MONTANT_CHARGES",
  "CARNET_ENTRETIEN",
  "FICHE_SYNTHETIQUE",
  "PRE_ETAT_DATE",
  "ETAT_DATE",
  "PHOTOS_HD",
  "VIDEO_VISITE",
  "PLAN_BIEN",
  "ANNONCE_IMMOBILIERE",
  "AFFICHE_VITRINE",
  "REPORTING_VENDEUR",
  "SIMULATION_FINANCEMENT",
  "ATTESTATION_CAPACITE_EMPRUNT",
  "ACCORD_PRINCIPE_BANCAIRE",
  "COMPROMIS_OU_PROMESSE",
  "ANNEXES_COMPROMIS",
  "PREUVE_SEQUESTRE",
  "COURRIER_RETRACTATION",
  "LEVEE_CONDITIONS_SUSPENSIVES",
  "ACTE_AUTHENTIQUE",
  "DECOMPTE_NOTAIRE",
] as const;

describe("TypeDocumentSchema", () => {
  it("couvre tous les types de documents français attendus", () => {
    expect([...TypeDocumentSchema.options]).toEqual([...expectedTypes]);
  });

  it("rejette une valeur inconnue", () => {
    const parsed = TypeDocumentSchema.safeParse("BULLETIN_SALAIRE");
    expect(parsed.success).toBe(false);
  });
});
