import type { ParticipantRole, PropertyStatus, TypeDocument } from "./api.models";

export const ACCESS_TOKEN_STORAGE_KEY = "monimmo.accessToken";
export const REFRESH_TOKEN_STORAGE_KEY = "monimmo.refreshToken";
export const SESSION_EMAIL_STORAGE_KEY = "monimmo.userEmail";

export const MIN_PASSWORD_LENGTH = 8;

export const PROPERTY_STATUSES: readonly PropertyStatus[] = [
  "PROSPECTION",
  "MANDAT_SIGNE",
  "EN_DIFFUSION",
  "VISITES",
  "OFFRES",
  "COMPROMIS",
  "VENDU",
  "ARCHIVE",
];

export const PROPERTY_STATUS_ORDER = PROPERTY_STATUSES;

export const PROPERTY_FLOW_STATUSES: readonly PropertyStatus[] = [
  "PROSPECTION",
  "MANDAT_SIGNE",
  "EN_DIFFUSION",
  "VISITES",
  "OFFRES",
  "COMPROMIS",
  "VENDU",
];

export const STATUS_LABELS: Record<PropertyStatus, string> = {
  PROSPECTION: "Prospection",
  MANDAT_SIGNE: "Mandat signe",
  EN_DIFFUSION: "En diffusion",
  VISITES: "Visites",
  OFFRES: "Offres",
  COMPROMIS: "Compromis",
  VENDU: "Vendu",
  ARCHIVE: "Archive",
};

export const PARTICIPANT_ROLES: readonly ParticipantRole[] = [
  "VENDEUR",
  "ACHETEUR",
  "LOCATAIRE",
  "NOTAIRE",
  "ARTISAN",
  "AUTRE",
];

export const PARTICIPANT_LABELS: Record<ParticipantRole, string> = {
  VENDEUR: "Vendeur",
  ACHETEUR: "Acheteur",
  LOCATAIRE: "Locataire",
  NOTAIRE: "Notaire",
  ARTISAN: "Artisan",
  AUTRE: "Autre",
};

export const TYPE_DOCUMENT_OPTIONS: readonly TypeDocument[] = [
  "PIECE_IDENTITE",
  "LIVRET_FAMILLE",
  "CONTRAT_MARIAGE_PACS",
  "JUGEMENT_DIVORCE",
  "TITRE_PROPRIETE",
  "ATTESTATION_NOTARIALE",
  "TAXE_FONCIERE",
  "REFERENCE_CADASTRALE",
  "MANDAT_VENTE_SIGNE",
  "BON_VISITE",
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
];

export type DetailFieldType = "text" | "number" | "boolean" | "select" | "textarea" | "date";

export interface DetailSelectOption {
  value: string;
  label: string;
}

export interface PropertyDetailsFieldDefinition {
  key: string;
  label: string;
  type: DetailFieldType;
  source?: "property";
  options?: readonly DetailSelectOption[];
}

export type PropertyDetailsCategoryId =
  | "general"
  | "location"
  | "characteristics"
  | "amenities"
  | "copropriete"
  | "finance"
  | "regulation"
  | "marketing";

export interface PropertyDetailsCategoryDefinition {
  id: PropertyDetailsCategoryId;
  label: string;
  fields: readonly PropertyDetailsFieldDefinition[];
}

const BOOL_OPTIONS: readonly DetailSelectOption[] = [
  { value: "true", label: "Oui" },
  { value: "false", label: "Non" },
];

const PROPERTY_TYPE_OPTIONS: readonly DetailSelectOption[] = [
  { value: "APPARTEMENT", label: "Appartement" },
  { value: "MAISON", label: "Maison" },
  { value: "IMMEUBLE", label: "Immeuble" },
  { value: "TERRAIN", label: "Terrain" },
  { value: "LOCAL_COMMERCIAL", label: "Local commercial" },
  { value: "AUTRE", label: "Autre" },
];

const OPERATION_TYPE_OPTIONS: readonly DetailSelectOption[] = [
  { value: "VENTE", label: "Vente" },
  { value: "LOCATION", label: "Location" },
  { value: "VIAGER", label: "Viager" },
  { value: "LOCATION_SAISONNIERE", label: "Location saisonniere" },
];

const KITCHEN_TYPE_OPTIONS: readonly DetailSelectOption[] = [
  { value: "SEPAREE", label: "Separee" },
  { value: "OUVERTE", label: "Ouverte" },
  { value: "EQUIPEE", label: "Equipee" },
  { value: "AUTRE", label: "Autre" },
];

const FIELD_STATE_OPTIONS: readonly DetailSelectOption[] = [
  { value: "NEUF", label: "Neuf" },
  { value: "RENOVE", label: "Renove" },
  { value: "A_RAFRAICHIR", label: "A rafraichir" },
  { value: "A_RENOVER", label: "A renover" },
];

const FIELD_STANDING_OPTIONS: readonly DetailSelectOption[] = [
  { value: "STANDARD", label: "Standard" },
  { value: "HAUT_DE_GAMME", label: "Haut de gamme" },
  { value: "LUXE", label: "Luxe" },
];

const FEES_RESPONSIBILITY_OPTIONS: readonly DetailSelectOption[] = [
  { value: "VENDEUR", label: "Charge vendeur" },
  { value: "ACQUEREUR", label: "Charge acquereur" },
];

const LEASE_TYPE_OPTIONS: readonly DetailSelectOption[] = [
  { value: "VIDE", label: "Bail vide" },
  { value: "MEUBLE", label: "Bail meuble" },
  { value: "COMMERCIAL", label: "Bail commercial" },
  { value: "SAISONNIER", label: "Bail saisonnier" },
];

const MANDATE_TYPE_OPTIONS: readonly DetailSelectOption[] = [
  { value: "SIMPLE", label: "Simple" },
  { value: "EXCLUSIF", label: "Exclusif" },
  { value: "SEMI_EXCLUSIF", label: "Semi-exclusif" },
];

const DPE_CLASS_OPTIONS: readonly DetailSelectOption[] = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "D", label: "D" },
  { value: "E", label: "E" },
  { value: "F", label: "F" },
  { value: "G", label: "G" },
];

export const PROPERTY_DETAILS_CATEGORIES: readonly PropertyDetailsCategoryDefinition[] = [
  {
    id: "general",
    label: "Informations generales",
    fields: [
      { key: "internalReference", label: "Reference interne agence", type: "text" },
      { key: "title", label: "Titre de l'annonce", type: "text", source: "property" },
      { key: "propertyType", label: "Type de bien", type: "select", options: PROPERTY_TYPE_OPTIONS },
      {
        key: "operationType",
        label: "Type d'operation",
        type: "select",
        options: OPERATION_TYPE_OPTIONS,
      },
      { key: "portfolioEntryDate", label: "Date d'entree portefeuille", type: "date" },
      { key: "propertySource", label: "Source du bien", type: "text" },
    ],
  },
  {
    id: "location",
    label: "Localisation",
    fields: [
      { key: "address", label: "Adresse", type: "text", source: "property" },
      { key: "postalCode", label: "Code postal", type: "text", source: "property" },
      { key: "city", label: "Ville", type: "text", source: "property" },
      { key: "floor", label: "Etage", type: "text" },
      { key: "lotNumber", label: "Numero de lot", type: "text" },
      { key: "gpsLat", label: "Coordonnee GPS lat", type: "number" },
      { key: "gpsLng", label: "Coordonnee GPS lng", type: "number" },
      { key: "distanceSchools", label: "Distance ecoles", type: "number" },
      { key: "distanceTransport", label: "Distance transports", type: "number" },
      { key: "distanceShops", label: "Distance commerces", type: "number" },
      { key: "distanceSupermarket", label: "Distance supermarche", type: "number" },
      { key: "distancePharmacy", label: "Distance pharmacie", type: "number" },
      { key: "distanceDoctor", label: "Distance medecin", type: "number" },
      { key: "distancePark", label: "Distance parc", type: "number" },
      { key: "distanceTrainStation", label: "Distance gare", type: "number" },
      { key: "distanceHighway", label: "Distance autoroute", type: "number" },
    ],
  },
  {
    id: "characteristics",
    label: "Caracteristiques principales",
    fields: [
      { key: "livingArea", label: "Surface habitable (m2)", type: "number" },
      { key: "landArea", label: "Surface terrain (m2)", type: "number" },
      { key: "carrezArea", label: "Surface loi Carrez (m2)", type: "number" },
      { key: "rooms", label: "Nombre de pieces", type: "number" },
      { key: "bedrooms", label: "Nombre de chambres", type: "number" },
      { key: "bathrooms", label: "Nombre de salles de bain", type: "number" },
      { key: "toilets", label: "Nombre de WC", type: "number" },
      { key: "kitchenType", label: "Cuisine", type: "select", options: KITCHEN_TYPE_OPTIONS },
      { key: "livingRoomArea", label: "Sejour (surface)", type: "number" },
      { key: "ceilingHeight", label: "Hauteur sous plafond", type: "number" },
      { key: "heatingType", label: "Type de chauffage", type: "text" },
      { key: "hotWaterProduction", label: "Production eau chaude", type: "text" },
      { key: "constructionYear", label: "Annee de construction", type: "number" },
      { key: "condition", label: "Etat general", type: "select", options: FIELD_STATE_OPTIONS },
      { key: "standing", label: "Standing", type: "select", options: FIELD_STANDING_OPTIONS },
    ],
  },
  {
    id: "amenities",
    label: "Prestations & equipements",
    fields: [
      { key: "elevator", label: "Ascenseur", type: "select", options: BOOL_OPTIONS },
      { key: "balcony", label: "Balcon", type: "select", options: BOOL_OPTIONS },
      { key: "terrace", label: "Terrasse", type: "select", options: BOOL_OPTIONS },
      { key: "garden", label: "Jardin", type: "select", options: BOOL_OPTIONS },
      { key: "pool", label: "Piscine", type: "select", options: BOOL_OPTIONS },
      { key: "garage", label: "Garage", type: "select", options: BOOL_OPTIONS },
      { key: "parking", label: "Parking", type: "select", options: BOOL_OPTIONS },
      { key: "cellar", label: "Cave", type: "select", options: BOOL_OPTIONS },
      { key: "attic", label: "Grenier", type: "select", options: BOOL_OPTIONS },
      { key: "fiber", label: "Fibre optique", type: "select", options: BOOL_OPTIONS },
      { key: "airConditioning", label: "Climatisation", type: "select", options: BOOL_OPTIONS },
      { key: "homeAutomation", label: "Domotique", type: "select", options: BOOL_OPTIONS },
      { key: "intercom", label: "Interphone / visiophone", type: "select", options: BOOL_OPTIONS },
      { key: "digicode", label: "Digicode", type: "select", options: BOOL_OPTIONS },
      { key: "electricGate", label: "Portail electrique", type: "select", options: BOOL_OPTIONS },
      {
        key: "electricShutters",
        label: "Volets roulants electriques",
        type: "select",
        options: BOOL_OPTIONS,
      },
      { key: "fireplace", label: "Cheminee", type: "select", options: BOOL_OPTIONS },
      { key: "doubleGlazing", label: "Double vitrage", type: "select", options: BOOL_OPTIONS },
    ],
  },
  {
    id: "copropriete",
    label: "Copropriete",
    fields: [
      { key: "isCopropriete", label: "Bien en copropriete", type: "select", options: BOOL_OPTIONS },
      { key: "lotsCount", label: "Nombre de lots", type: "number" },
      { key: "monthlyCharges", label: "Charges mensuelles", type: "number" },
      { key: "ongoingProcedure", label: "Procedure en cours", type: "select", options: BOOL_OPTIONS },
      { key: "syndic", label: "Syndic", type: "text" },
      { key: "worksFund", label: "Fonds de travaux", type: "number" },
      {
        key: "coproRulesAvailable",
        label: "Reglement de copro disponible",
        type: "select",
        options: BOOL_OPTIONS,
      },
    ],
  },
  {
    id: "finance",
    label: "Informations financieres",
    fields: [
      { key: "salePriceTtc", label: "Prix de vente TTC", type: "number" },
      {
        key: "feesResponsibility",
        label: "Honoraires",
        type: "select",
        options: FEES_RESPONSIBILITY_OPTIONS,
      },
      { key: "feesAmount", label: "Montant honoraires", type: "number" },
      { key: "netSellerPrice", label: "Prix net vendeur", type: "number" },
      { key: "notaryFees", label: "Frais notaire", type: "number" },
      { key: "propertyTax", label: "Taxe fonciere", type: "number" },
      { key: "annualChargesEstimate", label: "Charges annuelles", type: "number" },
      { key: "isRental", label: "Location", type: "select", options: BOOL_OPTIONS },
      { key: "monthlyRent", label: "Loyer mensuel", type: "number" },
      { key: "rentalCharges", label: "Charges locatives", type: "number" },
      { key: "securityDeposit", label: "Depot de garantie", type: "number" },
      { key: "tenantFees", label: "Honoraires locataire", type: "number" },
      { key: "landlordFees", label: "Honoraires bailleur", type: "number" },
      { key: "availability", label: "Disponibilite", type: "text" },
      { key: "leaseType", label: "Type de bail", type: "select", options: LEASE_TYPE_OPTIONS },
    ],
  },
  {
    id: "regulation",
    label: "Donnees reglementaires",
    fields: [
      { key: "dpeClass", label: "DPE (classe energie)", type: "select", options: DPE_CLASS_OPTIONS },
      { key: "energyConsumption", label: "Consommation energetique", type: "number" },
      { key: "gesClass", label: "Classe GES", type: "select", options: DPE_CLASS_OPTIONS },
      { key: "co2Emission", label: "Emissions CO2", type: "number" },
      { key: "dpeDate", label: "Date du DPE", type: "date" },
      { key: "energyAuditRequired", label: "Audit energetique", type: "select", options: BOOL_OPTIONS },
      { key: "asbestos", label: "Amiante", type: "select", options: BOOL_OPTIONS },
      { key: "lead", label: "Plomb", type: "select", options: BOOL_OPTIONS },
      { key: "electricity", label: "Electricite", type: "select", options: BOOL_OPTIONS },
      { key: "gas", label: "Gaz", type: "select", options: BOOL_OPTIONS },
      { key: "riskStatement", label: "ERP", type: "select", options: BOOL_OPTIONS },
    ],
  },
  {
    id: "marketing",
    label: "Commercialisation",
    fields: [
      { key: "shortDescription", label: "Description courte", type: "textarea" },
      { key: "longDescription", label: "Description longue", type: "textarea" },
      { key: "keywords", label: "Mots-cles", type: "text" },
      { key: "marketingHook", label: "Accroche marketing", type: "text" },
      { key: "strengths", label: "Points forts", type: "textarea" },
      { key: "weaknesses", label: "Points faibles", type: "textarea" },
      { key: "mandateType", label: "Mandat", type: "select", options: MANDATE_TYPE_OPTIONS },
      { key: "mandateStartDate", label: "Date de debut de mandat", type: "date" },
      { key: "mandateEndDate", label: "Date de fin de mandat", type: "date" },
    ],
  },
];

export type DocumentTabId =
  | "identite_situation"
  | "propriete"
  | "mandat"
  | "technique"
  | "copropriete"
  | "marketing"
  | "offre"
  | "juridique"
  | "acquereur";

export interface DocumentTabDefinition {
  id: DocumentTabId;
  label: string;
  typeDocuments: readonly TypeDocument[];
  expected: readonly string[];
}

export const DOCUMENT_TABS: readonly DocumentTabDefinition[] = [
  {
    id: "identite_situation",
    label: "Identite / situation",
    typeDocuments: [
      "PIECE_IDENTITE",
      "LIVRET_FAMILLE",
      "CONTRAT_MARIAGE_PACS",
      "JUGEMENT_DIVORCE",
    ],
    expected: [
      "Piece d'identite",
      "Livret de famille",
      "Contrat de mariage / PACS",
      "Jugement de divorce",
    ],
  },
  {
    id: "propriete",
    label: "Propriete",
    typeDocuments: [
      "TITRE_PROPRIETE",
      "ATTESTATION_NOTARIALE",
      "TAXE_FONCIERE",
      "REFERENCE_CADASTRALE",
    ],
    expected: [
      "Titre de propriete",
      "Attestation notariee",
      "Dernier avis de taxe fonciere",
      "Reference cadastrale",
    ],
  },
  {
    id: "mandat",
    label: "Mandat",
    typeDocuments: ["MANDAT_VENTE_SIGNE", "BON_VISITE", "OFFRE_ACHAT_SIGNEE"],
    expected: ["Mandat de vente signe", "Bon de visite", "Offre d'achat signee"],
  },
  {
    id: "technique",
    label: "Documents techniques",
    typeDocuments: [
      "DPE",
      "AMIANTE",
      "PLOMB",
      "ELECTRICITE",
      "GAZ",
      "TERMITES",
      "ERP_ETAT_RISQUES",
      "ASSAINISSEMENT",
      "LOI_CARREZ",
    ],
    expected: [
      "DPE",
      "Amiante",
      "Plomb",
      "Electricite",
      "Gaz",
      "Termites",
      "ERP",
      "Assainissement",
      "Loi Carrez",
    ],
  },
  {
    id: "copropriete",
    label: "Documents copropriete",
    typeDocuments: [
      "REGLEMENT_COPROPRIETE",
      "ETAT_DESCRIPTIF_DIVISION",
      "PV_AG_3_DERNIERES_ANNEES",
      "MONTANT_CHARGES",
      "CARNET_ENTRETIEN",
      "FICHE_SYNTHETIQUE",
      "PRE_ETAT_DATE",
      "ETAT_DATE",
    ],
    expected: [
      "Reglement de copropriete",
      "Etat descriptif de division",
      "Proces-verbaux d'assemblee generale",
      "Montant des charges",
      "Carnet d'entretien",
      "Fiche synthetique",
      "Pre-etat date",
      "Etat date",
    ],
  },
  {
    id: "marketing",
    label: "Documents marketing",
    typeDocuments: [
      "PHOTOS_HD",
      "VIDEO_VISITE",
      "PLAN_BIEN",
      "ANNONCE_IMMOBILIERE",
      "AFFICHE_VITRINE",
      "REPORTING_VENDEUR",
    ],
    expected: [
      "Photos HD",
      "Video / visite virtuelle",
      "Plan du bien",
      "Annonce immobiliere",
      "Affiche vitrine",
      "Reporting vendeur",
    ],
  },
  {
    id: "offre",
    label: "Documents lies a l'offre",
    typeDocuments: [
      "OFFRE_ACHAT_SIGNEE",
      "SIMULATION_FINANCEMENT",
      "ATTESTATION_CAPACITE_EMPRUNT",
      "ACCORD_PRINCIPE_BANCAIRE",
    ],
    expected: [
      "Offre d'achat ecrite",
      "Simulation de financement",
      "Attestation de capacite d'emprunt",
      "Accord de principe bancaire",
    ],
  },
  {
    id: "juridique",
    label: "Documents juridiques",
    typeDocuments: [
      "COMPROMIS_OU_PROMESSE",
      "ANNEXES_COMPROMIS",
      "PREUVE_SEQUESTRE",
      "COURRIER_RETRACTATION",
      "LEVEE_CONDITIONS_SUSPENSIVES",
      "ACTE_AUTHENTIQUE",
      "DECOMPTE_NOTAIRE",
    ],
    expected: [
      "Compromis / promesse",
      "Annexes au compromis",
      "Preuve de sequestre",
      "Courrier de retractation",
      "Levee des conditions suspensives",
      "Acte authentique",
      "Decompte notaire",
    ],
  },
  {
    id: "acquereur",
    label: "Documents cote acquereur",
    typeDocuments: ["PIECE_IDENTITE"],
    expected: [
      "Piece d'identite",
      "Justificatifs de domicile",
      "Situation matrimoniale",
      "Plan de financement",
      "Offre de pret",
    ],
  },
];

export const getDocumentTabByTypeDocument = (typeDocument: TypeDocument): DocumentTabDefinition => {
  return DOCUMENT_TABS.find((tab) => tab.typeDocuments.includes(typeDocument)) ?? DOCUMENT_TABS[0];
};
