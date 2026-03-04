export type ObjectType = "bien" | "client" | "rdv" | "visite";

export type ObjectFieldType =
  | "string"
  | "text"
  | "int"
  | "float"
  | "boolean"
  | "date"
  | "datetime"
  | "select";

export type ObjectFieldSource = "object" | "property";

export type ObjectFieldRuleOperator = "=" | "!=" | "in" | "notIn";

export type ObjectFieldHideRule = {
  key: string;
  operator: ObjectFieldRuleOperator;
  value: string | number | boolean | Array<string | number | boolean>;
};

export type ObjectFieldOption = {
  value: string;
  label: string;
};

export type ObjectFieldDefinition = {
  key: string;
  name: string;
  group: string;
  subgroup?: string;
  type: ObjectFieldType;
  source?: ObjectFieldSource;
  required?: boolean;
  min?: number;
  max?: number;
  options?: ObjectFieldOption[];
  hide?: ObjectFieldHideRule[];
};

const yesNoOptions: ObjectFieldOption[] = [
  { value: "true", label: "Oui" },
  { value: "false", label: "Non" },
];

const dpeOptions: ObjectFieldOption[] = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "D", label: "D" },
  { value: "E", label: "E" },
  { value: "F", label: "F" },
  { value: "G", label: "G" },
];

const bienFields: ObjectFieldDefinition[] = [
  { key: "title", name: "Titre de l'annonce", group: "general", type: "string", source: "property", required: true },
  { key: "internalReference", name: "Référence interne", group: "general", type: "string" },
  {
    key: "propertyType",
    name: "Type de bien",
    group: "general",
    type: "select",
    required: true,
    options: [
      { value: "APPARTEMENT", label: "Appartement" },
      { value: "MAISON", label: "Maison" },
      { value: "IMMEUBLE", label: "Immeuble" },
      { value: "TERRAIN", label: "Terrain" },
      { value: "LOCAL_COMMERCIAL", label: "Local commercial" },
      { value: "AUTRE", label: "Autre" },
    ],
  },
  {
    key: "operationType",
    name: "Type d'opération",
    group: "general",
    type: "select",
    options: [
      { value: "VENTE", label: "Vente" },
      { value: "LOCATION", label: "Location" },
      { value: "VIAGER", label: "Viager" },
      { value: "LOCATION_SAISONNIERE", label: "Location saisonnière" },
    ],
  },
  { key: "portfolioEntryDate", name: "Date entrée portefeuille", group: "general", type: "date" },
  { key: "propertySource", name: "Source du bien", group: "general", type: "string" },
  { key: "address", name: "Adresse", group: "location", subgroup: "adresse", type: "string", source: "property", required: true },
  { key: "postalCode", name: "Code postal", group: "location", subgroup: "adresse", type: "string", source: "property", required: true },
  { key: "city", name: "Ville", group: "location", subgroup: "adresse", type: "string", source: "property", required: true },
  { key: "floor", name: "Étage", group: "location", subgroup: "adresse", type: "string" },
  { key: "lotNumber", name: "Numéro de lot", group: "location", subgroup: "adresse", type: "string" },
  { key: "gpsLat", name: "Latitude GPS", group: "location", subgroup: "geoposition", type: "float" },
  { key: "gpsLng", name: "Longitude GPS", group: "location", subgroup: "geoposition", type: "float" },
  { key: "distanceSchools", name: "Distance écoles", group: "location", subgroup: "proximite", type: "float", min: 0 },
  { key: "distanceTransport", name: "Distance transports", group: "location", subgroup: "proximite", type: "float", min: 0 },
  { key: "distanceShops", name: "Distance commerces", group: "location", subgroup: "proximite", type: "float", min: 0 },
  { key: "distanceSupermarket", name: "Distance supermarché", group: "location", subgroup: "proximite", type: "float", min: 0 },
  { key: "distancePharmacy", name: "Distance pharmacie", group: "location", subgroup: "proximite", type: "float", min: 0 },
  { key: "distanceDoctor", name: "Distance médecin", group: "location", subgroup: "proximite", type: "float", min: 0 },
  { key: "distancePark", name: "Distance parc", group: "location", subgroup: "proximite", type: "float", min: 0 },
  { key: "distanceTrainStation", name: "Distance gare", group: "location", subgroup: "proximite", type: "float", min: 0 },
  { key: "distanceHighway", name: "Distance autoroute", group: "location", subgroup: "proximite", type: "float", min: 0 },
  { key: "price", name: "Prix", group: "finance", type: "int", source: "property", min: 0 },
  { key: "livingArea", name: "Surface habitable (m2)", group: "characteristics", type: "float", min: 0 },
  { key: "carrezArea", name: "Surface loi Carrez (m2)", group: "characteristics", type: "float", min: 0 },
  { key: "landArea", name: "Surface terrain (m2)", group: "characteristics", type: "float", min: 0 },
  { key: "rooms", name: "Nombre de pièces", group: "characteristics", type: "int", min: 0 },
  { key: "bedrooms", name: "Nombre de chambres", group: "characteristics", type: "int", min: 0 },
  { key: "bathrooms", name: "Nombre de salles de bain", group: "characteristics", type: "int", min: 0 },
  { key: "toilets", name: "Nombre de WC", group: "characteristics", type: "int", min: 0 },
  {
    key: "kitchenType",
    name: "Cuisine",
    group: "characteristics",
    type: "select",
    options: [
      { value: "SEPAREE", label: "Séparée" },
      { value: "OUVERTE", label: "Ouverte" },
      { value: "EQUIPEE", label: "Équipée" },
      { value: "AUTRE", label: "Autre" },
    ],
  },
  { key: "livingRoomArea", name: "Séjour (surface)", group: "characteristics", type: "float", min: 0 },
  { key: "ceilingHeight", name: "Hauteur sous plafond", group: "characteristics", type: "float", min: 0 },
  { key: "heatingType", name: "Type de chauffage", group: "characteristics", type: "string" },
  { key: "hotWaterProduction", name: "Production eau chaude", group: "characteristics", type: "string" },
  { key: "constructionYear", name: "Année de construction", group: "characteristics", type: "int", min: 0 },
  { key: "lastRenovationYear", name: "Année dernière rénovation", group: "characteristics", type: "int", min: 0 },
  {
    key: "condition",
    name: "État général",
    group: "characteristics",
    type: "select",
    options: [
      { value: "NEUF", label: "Neuf" },
      { value: "RENOVE", label: "Rénové" },
      { value: "A_RAFRAICHIR", label: "À rafraîchir" },
      { value: "A_RENOVER", label: "À rénover" },
    ],
  },
  {
    key: "standing",
    name: "Standing",
    group: "characteristics",
    type: "select",
    options: [
      { value: "STANDARD", label: "Standard" },
      { value: "HAUT_DE_GAMME", label: "Haut de gamme" },
      { value: "LUXE", label: "Luxe" },
    ],
  },
  { key: "hasCracks", name: "Problème de fissures", group: "characteristics", type: "boolean" },
  { key: "hasVisAVis", name: "Vis-à-vis", group: "characteristics", type: "boolean" },
  {
    key: "noiseLevel",
    name: "Niveau de bruit",
    group: "characteristics",
    type: "select",
    options: [
      { value: "FAIBLE", label: "Faible" },
      { value: "MODERE", label: "Modéré" },
      { value: "ELEVE", label: "Élevé" },
    ],
  },
  {
    key: "crawlSpacePresence",
    name: "Présence vide sanitaire",
    group: "characteristics",
    type: "select",
    options: [
      { value: "NON", label: "Non" },
      { value: "OUI", label: "Oui" },
      { value: "PARTIEL", label: "Partiel" },
    ],
  },
  {
    key: "sanitationType",
    name: "Assainissement",
    group: "characteristics",
    type: "select",
    options: [
      { value: "TOUT_A_L_EGOUT", label: "Tout-à-l'égout" },
      { value: "FOSSE_SEPTIQUE", label: "Fosse septique" },
    ],
  },
  {
    key: "septicTankCompliant",
    name: "Fosse septique aux normes",
    group: "characteristics",
    type: "boolean",
    hide: [{ key: "sanitationType", operator: "!=", value: "FOSSE_SEPTIQUE" }],
  },
  {
    key: "foundationUnderpinningDone",
    name: "Reprise des fondations faite",
    group: "characteristics",
    type: "boolean",
  },
  { key: "agentAdditionalDetails", name: "Détails complémentaires agent", group: "characteristics", type: "text" },
  { key: "elevator", name: "Ascenseur", group: "amenities", type: "boolean" },
  { key: "balcony", name: "Balcon", group: "amenities", type: "boolean" },
  { key: "terrace", name: "Terrasse", group: "amenities", type: "boolean" },
  {
    key: "garden",
    name: "Jardin",
    group: "amenities",
    type: "select",
    options: [
      { value: "NON", label: "Non" },
      { value: "OUI_NU", label: "Oui nu" },
      { value: "OUI_ARBORE", label: "Oui arboré" },
      { value: "OUI_PAYSAGE", label: "Oui paysagé" },
    ],
  },
  {
    key: "pool",
    name: "Piscine",
    group: "amenities",
    type: "select",
    options: [
      { value: "NON", label: "Non" },
      { value: "PISCINABLE", label: "Piscinable" },
      { value: "OUI", label: "Oui" },
    ],
  },
  { key: "fenced", name: "Maison clôturée", group: "amenities", type: "boolean", hide: [{ key: "propertyType", operator: "!=", value: "MAISON" }] },
  { key: "coveredGarage", name: "Garage couvert", group: "amenities", type: "boolean" },
  { key: "carport", name: "Carport", group: "amenities", type: "boolean" },
  { key: "photovoltaicPanels", name: "Panneaux photovoltaïques", group: "amenities", type: "boolean" },
  { key: "photovoltaicAnnualIncome", name: "Revenu annuel photovoltaïque", group: "amenities", type: "int", min: 0 },
  { key: "garage", name: "Garage", group: "amenities", type: "boolean" },
  { key: "parking", name: "Parking", group: "amenities", type: "boolean" },
  { key: "cellar", name: "Cave", group: "amenities", type: "boolean" },
  { key: "attic", name: "Grenier", group: "amenities", type: "boolean" },
  { key: "fiber", name: "Fibre optique", group: "amenities", type: "boolean" },
  { key: "airConditioning", name: "Climatisation", group: "amenities", type: "boolean" },
  { key: "homeAutomation", name: "Domotique", group: "amenities", type: "boolean" },
  { key: "intercom", name: "Interphone", group: "amenities", type: "boolean" },
  { key: "digicode", name: "Digicode", group: "amenities", type: "boolean" },
  { key: "doubleGlazing", name: "Double vitrage", group: "amenities", type: "boolean" },
  { key: "electricShutters", name: "Volets électriques", group: "amenities", type: "boolean" },
  { key: "fireplace", name: "Cheminée", group: "amenities", type: "boolean" },
  { key: "electricGate", name: "Portail électrique", group: "amenities", type: "boolean" },
  { key: "isCopropriete", name: "Bien en copropriété", group: "copropriete", type: "boolean" },
  { key: "lotsCount", name: "Nombre de lots", group: "copropriete", type: "int", min: 0, hide: [{ key: "isCopropriete", operator: "!=", value: true }] },
  { key: "monthlyCharges", name: "Charges mensuelles", group: "copropriete", type: "float", min: 0, hide: [{ key: "isCopropriete", operator: "!=", value: true }] },
  { key: "sharedPool", name: "Piscine copropriété", group: "copropriete", type: "boolean", hide: [{ key: "isCopropriete", operator: "!=", value: true }] },
  { key: "sharedTennis", name: "Tennis copropriété", group: "copropriete", type: "boolean", hide: [{ key: "isCopropriete", operator: "!=", value: true }] },
  { key: "sharedMiniGolf", name: "Mini-golf copropriété", group: "copropriete", type: "boolean", hide: [{ key: "isCopropriete", operator: "!=", value: true }] },
  { key: "privateSeaAccess", name: "Accès mer privé", group: "copropriete", type: "boolean", hide: [{ key: "isCopropriete", operator: "!=", value: true }] },
  { key: "guardedResidence", name: "Résidence gardée", group: "copropriete", type: "boolean", hide: [{ key: "isCopropriete", operator: "!=", value: true }] },
  { key: "fencedResidence", name: "Résidence clôturée", group: "copropriete", type: "boolean", hide: [{ key: "isCopropriete", operator: "!=", value: true }] },
  { key: "ongoingProcedure", name: "Procédure en cours", group: "copropriete", type: "boolean", hide: [{ key: "isCopropriete", operator: "!=", value: true }] },
  { key: "syndic", name: "Syndic", group: "copropriete", type: "string", hide: [{ key: "isCopropriete", operator: "!=", value: true }] },
  { key: "worksFund", name: "Fonds de travaux", group: "copropriete", type: "int", min: 0, hide: [{ key: "isCopropriete", operator: "!=", value: true }] },
  { key: "coproRulesAvailable", name: "Règlement copro disponible", group: "copropriete", type: "boolean", hide: [{ key: "isCopropriete", operator: "!=", value: true }] },
  { key: "salePriceTtc", name: "Prix de vente TTC", group: "finance", type: "int", min: 0 },
  { key: "propertyTax", name: "Taxe foncière", group: "finance", type: "int", min: 0 },
  { key: "netSellerPrice", name: "Prix net vendeur", group: "finance", type: "int", min: 0 },
  { key: "notaryFees", name: "Frais notaire", group: "finance", type: "int", min: 0 },
  { key: "annualChargesEstimate", name: "Charges annuelles", group: "finance", type: "int", min: 0 },
  {
    key: "feesResponsibility",
    name: "Honoraires à la charge",
    group: "finance",
    type: "select",
    options: [
      { value: "VENDEUR", label: "Vendeur" },
      { value: "ACQUEREUR", label: "Acquéreur" },
    ],
  },
  { key: "feesAmount", name: "Montant honoraires", group: "finance", type: "int", min: 0 },
  { key: "isRental", name: "Location", group: "finance", type: "boolean" },
  { key: "monthlyRent", name: "Loyer mensuel", group: "finance", type: "int", min: 0 },
  { key: "rentalCharges", name: "Charges locatives", group: "finance", type: "int", min: 0 },
  { key: "securityDeposit", name: "Dépôt de garantie", group: "finance", type: "int", min: 0 },
  { key: "tenantFees", name: "Honoraires locataire", group: "finance", type: "int", min: 0 },
  { key: "landlordFees", name: "Honoraires bailleur", group: "finance", type: "int", min: 0 },
  { key: "availability", name: "Disponibilité", group: "finance", type: "string" },
  {
    key: "leaseType",
    name: "Type de bail",
    group: "finance",
    type: "select",
    options: [
      { value: "VIDE", label: "Bail vide" },
      { value: "MEUBLE", label: "Bail meublé" },
      { value: "COMMERCIAL", label: "Bail commercial" },
      { value: "SAISONNIER", label: "Bail saisonnier" },
    ],
  },
  { key: "rentalHoldingYears", name: "Durée détention location", group: "finance", type: "int", min: 0 },
  { key: "rentalResalePrice", name: "Prix revente estimé", group: "finance", type: "int", min: 0 },
  { key: "dpeClass", name: "DPE", group: "regulation", type: "select", options: dpeOptions },
  { key: "energyConsumption", name: "Consommation énergétique", group: "regulation", type: "int", min: 0 },
  { key: "gesClass", name: "GES", group: "regulation", type: "select", options: dpeOptions },
  { key: "co2Emission", name: "Émissions CO2", group: "regulation", type: "int", min: 0 },
  { key: "dpeDate", name: "Date DPE", group: "regulation", type: "date" },
  { key: "energyAuditRequired", name: "Audit énergétique", group: "regulation", type: "boolean" },
  { key: "asbestos", name: "Présence d'amiante", group: "regulation", type: "boolean" },
  { key: "lead", name: "Plomb", group: "regulation", type: "boolean" },
  { key: "electricity", name: "Électricité", group: "regulation", type: "boolean" },
  { key: "gas", name: "Gaz", group: "regulation", type: "boolean" },
  { key: "riskStatement", name: "ERP", group: "regulation", type: "boolean" },
  { key: "shortDescription", name: "Description courte", group: "marketing", type: "text" },
  { key: "longDescription", name: "Descriptif annonce", group: "marketing", type: "text" },
  { key: "keywords", name: "Mots-clés", group: "marketing", type: "string" },
  { key: "marketingHook", name: "Accroche marketing", group: "marketing", type: "string" },
  { key: "strengths", name: "Points forts", group: "marketing", type: "text" },
  { key: "weaknesses", name: "Points faibles", group: "marketing", type: "text" },
  {
    key: "mandateType",
    name: "Type de mandat",
    group: "marketing",
    type: "select",
    options: [
      { value: "SIMPLE", label: "Simple" },
      { value: "EXCLUSIF", label: "Exclusif" },
      { value: "SEMI_EXCLUSIF", label: "Semi-exclusif" },
    ],
  },
  { key: "mandateStartDate", name: "Début mandat", group: "marketing", type: "date" },
  { key: "mandateEndDate", name: "Fin mandat", group: "marketing", type: "date" },
];

const clientFields: ObjectFieldDefinition[] = [
  { key: "firstName", name: "Prénom", group: "identity", type: "string" },
  { key: "lastName", name: "Nom", group: "identity", type: "string" },
  { key: "email", name: "Email", group: "contact", type: "string" },
  { key: "phone", name: "Téléphone", group: "contact", type: "string" },
  { key: "address", name: "Adresse", group: "location", type: "string" },
  { key: "postalCode", name: "Code postal", group: "location", type: "string" },
  { key: "city", name: "Ville", group: "location", type: "string" },
  { key: "personalNotes", name: "Notes", group: "notes", type: "text" },
  {
    key: "accountType",
    name: "Type de compte",
    group: "identity",
    type: "select",
    options: [
      { value: "CLIENT", label: "Client" },
      { value: "AGENT", label: "Agent" },
      { value: "NOTAIRE", label: "Notaire" },
    ],
  },
];

const rdvFields: ObjectFieldDefinition[] = [
  { key: "title", name: "Titre", group: "general", type: "string", required: true },
  { key: "propertyId", name: "Bien lié", group: "relations", type: "string", required: true },
  { key: "clientUserId", name: "Client lié", group: "relations", type: "string" },
  { key: "startsAt", name: "Début", group: "schedule", type: "datetime", required: true },
  { key: "endsAt", name: "Fin", group: "schedule", type: "datetime", required: true },
  { key: "address", name: "Adresse", group: "schedule", type: "string" },
  { key: "comment", name: "Commentaire", group: "notes", type: "text" },
];

const visiteFields: ObjectFieldDefinition[] = [
  { key: "propertyId", name: "Bien lié", group: "relations", type: "string", required: true },
  { key: "prospectUserId", name: "Prospect lié", group: "relations", type: "string", required: true },
  { key: "startsAt", name: "Début", group: "schedule", type: "datetime", required: true },
  { key: "endsAt", name: "Fin", group: "schedule", type: "datetime", required: true },
  { key: "compteRendu", name: "Compte-rendu", group: "notes", type: "text" },
  { key: "bonDeVisiteFileId", name: "Fichier bon de visite", group: "documents", type: "string" },
];

const byObjectType: Record<ObjectType, ObjectFieldDefinition[]> = {
  bien: bienFields,
  client: clientFields,
  rdv: rdvFields,
  visite: visiteFields,
};

export const getObjectDataStructure = (objectType: ObjectType): ObjectFieldDefinition[] =>
  byObjectType[objectType].map((field) => ({
    ...field,
    options: field.options?.map((option) => ({ ...option })),
    hide: field.hide?.map((rule) => ({ ...rule })),
  }));

export const listObjectDataFieldKeysByGroup = (
  objectType: ObjectType,
  group: string,
): string[] =>
  byObjectType[objectType]
    .filter((field) => field.group === group)
    .map((field) => field.key);

export const listObjectDataFieldKeys = (objectType: ObjectType): string[] =>
  byObjectType[objectType].map((field) => field.key);

export const getObjectDataFieldDefinition = (
  objectType: ObjectType,
  key: string,
): ObjectFieldDefinition | null =>
  byObjectType[objectType].find((field) => field.key === key) ?? null;

export const OBJECT_FIELD_BOOLEAN_OPTIONS = yesNoOptions;
