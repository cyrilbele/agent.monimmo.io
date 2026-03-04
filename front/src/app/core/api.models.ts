export interface ErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

export type UserRole = "AGENT" | "MANAGER" | "ADMIN";

export interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  orgId: string;
  role: UserRole;
  createdAt: string;
}

export type AccountType = "AGENT" | "CLIENT" | "NOTAIRE";

export interface AccountUserResponse {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  orgId: string;
  accountType: AccountType;
  role: string;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  personalNotes: string | null;
  linkedProperties: AccountUserLinkedPropertyResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface AccountUserListResponse {
  items: AccountUserResponse[];
  nextCursor?: string | null;
}

export interface AccountUserLinkedPropertyResponse {
  propertyId: string;
  title: string;
  city: string;
  postalCode: string;
  status: string;
  relationRole: string;
  source: "BUSINESS_LINK";
}

export interface AccountUserDetailResponse extends AccountUserResponse {
  linkedProperties: AccountUserLinkedPropertyResponse[];
}

export interface AccountUserPatchRequest {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  personalNotes?: string | null;
  accountType?: AccountType;
}

export interface AccountUserCreateRequest {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  personalNotes?: string | null;
  accountType?: AccountType;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserResponse;
}

export type AiProvider = "openai" | "anthropic";

export interface AppSettingsResponse {
  notaryFeePct: number;
  aiProvider: AiProvider;
  valuationAiOutputFormat: string;
  assistantSoul: string;
}

export interface AppSettingsPatchRequest {
  notaryFeePct?: number;
  aiProvider?: AiProvider;
  valuationAiOutputFormat?: string | null;
  assistantSoul?: string | null;
}

export type AssistantObjectType = "bien" | "user" | "rdv" | "visite" | "lien";

export interface AssistantCitationResponse {
  title: string;
  url: string;
  snippet: string;
}

export interface AssistantMessageResponse {
  id: string;
  role: "USER" | "ASSISTANT";
  text: string;
  citations: AssistantCitationResponse[];
  createdAt: string;
}

export interface AssistantConversationResponse {
  id: string;
  greeting: string;
  messages: AssistantMessageResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface AssistantMessageContextRequest {
  objectType: AssistantObjectType;
  objectId: string;
}

export interface AssistantMessageCreateRequest {
  message: string;
  context?: AssistantMessageContextRequest;
}

export interface AssistantMessageCreateResponse {
  conversation: AssistantConversationResponse;
  assistantMessage: AssistantMessageResponse;
}

export type ObjectDataFieldType =
  | "string"
  | "text"
  | "int"
  | "float"
  | "boolean"
  | "date"
  | "datetime"
  | "select";

export type ObjectDataFieldSource = "object" | "property";
export type ObjectDataFieldRuleOperator = "=" | "!=" | "in" | "notIn";

export interface ObjectDataFieldOption {
  value: string;
  label: string;
}

export interface ObjectDataFieldHideRule {
  key: string;
  operator: ObjectDataFieldRuleOperator;
  value: string | number | boolean | Array<string | number | boolean>;
}

export interface ObjectDataFieldDefinition {
  key: string;
  name: string;
  group: string;
  subgroup?: string;
  type: ObjectDataFieldType;
  source?: ObjectDataFieldSource;
  required?: boolean;
  min?: number;
  max?: number;
  options?: ObjectDataFieldOption[];
  hide?: ObjectDataFieldHideRule[];
}

export type ObjectDataStructureResponse = ObjectDataFieldDefinition[];

export type ObjectChangeMode = "USER" | "AI";

export interface ObjectChangeEntryResponse {
  id: string;
  objectType: AssistantObjectType;
  objectId: string;
  paramName: string;
  paramValue: string;
  mode: ObjectChangeMode;
  modifiedAt: string;
}

export interface ObjectChangeListResponse {
  items: ObjectChangeEntryResponse[];
}

export type LinkObjectType = "bien" | "user" | "rdv" | "visite";
export type LinkType = "bien_user" | "rdv_bien" | "rdv_user" | "visite_bien" | "visite_user";

export interface LinkResponse {
  id: string;
  typeLien: LinkType;
  objectId1: string;
  objectId2: string;
  params: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LinkListResponse {
  items: LinkResponse[];
  nextCursor?: string | null;
}

export interface LinkCreateRequest {
  typeLien: LinkType;
  objectId1: string;
  objectId2: string;
  params?: Record<string, unknown>;
}

export interface LinkPatchRequest {
  params: Record<string, unknown>;
}

export interface LinkRelatedItemResponse {
  link: LinkResponse;
  otherSideObjectType: LinkObjectType;
  otherSideObjectId: string;
  otherSide: unknown | null;
}

export interface LinkRelatedResponse {
  items: LinkRelatedItemResponse[];
  grouped: {
    bien: unknown[];
    user: unknown[];
    rdv: unknown[];
    visite: unknown[];
  };
}

export interface AICallLogResponse {
  id: string;
  datetime: string;
  orgId: string;
  useCase: string;
  prompt: string;
  textResponse: string;
  price: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  redactionVersion: string;
  expiresAt: string;
}

export interface AICallLogListResponse {
  items: AICallLogResponse[];
}

export type PrivacyExportStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface PrivacyExportResponse {
  id: string;
  status: PrivacyExportStatus;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  errorMessage: string | null;
  data: unknown | null;
}

export interface PrivacyEraseResponse {
  requestId: string;
  status: "PENDING";
  requestedAt: string;
}

export type GlobalSearchItemType = "PROPERTY" | "USER" | "VOCAL" | "VISIT";

export interface GlobalSearchItemResponse {
  type: GlobalSearchItemType;
  id: string;
  label: string;
  subtitle: string;
  route: string;
}

export interface GlobalSearchResponse {
  items: GlobalSearchItemResponse[];
}

export interface PropertyOwner {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
}

export type PropertyStatus =
  | "PROSPECTION"
  | "MANDAT_SIGNE"
  | "EN_DIFFUSION"
  | "VISITES"
  | "OFFRES"
  | "COMPROMIS"
  | "VENDU"
  | "ARCHIVE";

export interface PropertyResponse {
  id: string;
  title: string;
  city: string;
  postalCode: string;
  address?: string | null;
  price?: number | null;
  details: Record<string, unknown>;
  hiddenExpectedDocumentKeys?: string[];
  status: PropertyStatus;
  orgId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyListResponse {
  items: PropertyResponse[];
  nextCursor?: string | null;
}

export interface PropertyCreateRequest {
  title: string;
  city: string;
  postalCode: string;
  address: string;
  details?: Record<string, unknown>;
}

export interface PropertyPatchRequest {
  title?: string;
  city?: string;
  postalCode?: string;
  address?: string;
  price?: number;
  details?: Record<string, unknown>;
  hiddenExpectedDocumentKeys?: string[];
}

export interface PropertyStatusUpdateRequest {
  status: PropertyStatus;
}

export type ParticipantRole =
  | "VENDEUR"
  | "ACHETEUR"
  | "LOCATAIRE"
  | "NOTAIRE"
  | "ARTISAN"
  | "AUTRE";

export interface PropertyParticipantCreateRequest {
  contactId: string;
  role: ParticipantRole;
}

export interface PropertyParticipantResponse {
  id: string;
  propertyId: string;
  contactId: string;
  role: ParticipantRole;
  createdAt: string;
}

export interface PropertyProspectResponse {
  id: string;
  propertyId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  relationRole: string;
  createdAt: string;
}

export interface PropertyProspectListResponse {
  items: PropertyProspectResponse[];
}

export interface PropertyProspectCreateRequest {
  userId?: string;
  newClient?: PropertyOwner;
  relationRole?: "OWNER" | "PROSPECT" | "ACHETEUR";
}

export interface PropertyVisitCreateRequest {
  prospectUserId: string;
  startsAt: string;
  endsAt: string;
}

export interface PropertyVisitPatchRequest {
  compteRendu?: string | null;
  bonDeVisiteFileId?: string | null;
}

export interface PropertyVisitResponse {
  id: string;
  propertyId: string;
  propertyTitle: string;
  prospectUserId: string;
  prospectFirstName: string;
  prospectLastName: string;
  prospectEmail: string | null;
  prospectPhone: string | null;
  startsAt: string;
  endsAt: string;
  compteRendu: string | null;
  bonDeVisiteFileId: string | null;
  bonDeVisiteFileName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyVisitListResponse {
  items: PropertyVisitResponse[];
}

export interface CalendarAppointmentCreateRequest {
  title: string;
  propertyId: string;
  userId?: string | null;
  startsAt: string;
  endsAt: string;
  address?: string | null;
  comment?: string | null;
}

export interface CalendarAppointmentResponse {
  id: string;
  title: string;
  propertyId: string;
  propertyTitle: string;
  userId: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  address: string | null;
  comment: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarAppointmentListResponse {
  items: CalendarAppointmentResponse[];
}

export type PropertyRiskStatus = "OK" | "NO_DATA" | "UNAVAILABLE";

export interface PropertyRiskLocation {
  address: string | null;
  postalCode: string;
  city: string;
  inseeCode: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface PropertyRiskItemResponse {
  label: string;
  categoryCode: string | null;
  source: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface PropertyRiskResponse {
  propertyId: string;
  status: PropertyRiskStatus;
  source: "GEORISQUES";
  georisquesUrl: string;
  reportPdfUrl: string | null;
  generatedAt: string;
  message: string | null;
  location: PropertyRiskLocation;
  items: PropertyRiskItemResponse[];
}

export type ComparablePropertyType =
  | "APPARTEMENT"
  | "MAISON"
  | "IMMEUBLE"
  | "TERRAIN"
  | "LOCAL_COMMERCIAL"
  | "AUTRE";

export type ComparablePricingPosition =
  | "UNDER_PRICED"
  | "NORMAL"
  | "OVER_PRICED"
  | "UNKNOWN";

export interface ComparableSearchCenter {
  latitude: number;
  longitude: number;
}

export interface ComparableSearchResponse {
  center: ComparableSearchCenter;
  finalRadiusM: number;
  radiiTried: number[];
  targetCount: number;
  targetReached: boolean;
}

export interface ComparableSummaryResponse {
  count: number;
  medianPrice: number | null;
  medianPricePerM2: number | null;
  minPrice: number | null;
  maxPrice: number | null;
}

export interface ComparableSubjectResponse {
  surfaceM2: number | null;
  askingPrice: number | null;
  affinePriceAtSubjectSurface: number | null;
  predictedPrice: number | null;
  deviationPct: number | null;
  pricingPosition: ComparablePricingPosition;
}

export interface ComparableRegressionResponse {
  slope: number | null;
  intercept: number | null;
  r2: number | null;
  pointsUsed: number;
}

export interface ComparablePointResponse {
  saleDate: string;
  surfaceM2: number;
  landSurfaceM2: number | null;
  salePrice: number;
  pricePerM2: number;
  distanceM: number | null;
  city: string | null;
  postalCode: string | null;
}

export interface PropertyComparablesResponse {
  propertyId: string;
  propertyType: ComparablePropertyType;
  source: "CACHE" | "LIVE";
  windowYears: number;
  search: ComparableSearchResponse;
  summary: ComparableSummaryResponse;
  subject: ComparableSubjectResponse;
  regression: ComparableRegressionResponse;
  points: ComparablePointResponse[];
}

export interface PropertyValuationAICriteriaItem {
  label: string;
  value: string;
}

export interface PropertyValuationAIComparableFilters {
  propertyType?: ComparablePropertyType;
  radiusMaxM?: number | null;
  surfaceMinM2?: number | null;
  surfaceMaxM2?: number | null;
  landSurfaceMinM2?: number | null;
  landSurfaceMaxM2?: number | null;
}

export interface PropertyValuationAIRequest {
  comparableFilters?: PropertyValuationAIComparableFilters;
  agentAdjustedPrice?: number | null;
}

export interface PropertyValuationAIResponse {
  propertyId: string;
  aiCalculatedValuation: number | null;
  valuationJustification: string;
  promptUsed: string;
  generatedAt: string;
  comparableCountUsed: number;
  criteriaUsed: PropertyValuationAICriteriaItem[];
}

export interface PropertyValuationAIPromptResponse {
  propertyId: string;
  promptUsed: string;
}

export type TypeDocument =
  | "PIECE_IDENTITE"
  | "LIVRET_FAMILLE"
  | "CONTRAT_MARIAGE_PACS"
  | "JUGEMENT_DIVORCE"
  | "TITRE_PROPRIETE"
  | "ATTESTATION_NOTARIALE"
  | "TAXE_FONCIERE"
  | "REFERENCE_CADASTRALE"
  | "MANDAT_VENTE_SIGNE"
  | "OFFRE_ACHAT_SIGNEE"
  | "DPE"
  | "AMIANTE"
  | "PLOMB"
  | "ELECTRICITE"
  | "GAZ"
  | "TERMITES"
  | "ERP_ETAT_RISQUES"
  | "ASSAINISSEMENT"
  | "LOI_CARREZ"
  | "REGLEMENT_COPROPRIETE"
  | "ETAT_DESCRIPTIF_DIVISION"
  | "PV_AG_3_DERNIERES_ANNEES"
  | "MONTANT_CHARGES"
  | "CARNET_ENTRETIEN"
  | "FICHE_SYNTHETIQUE"
  | "PRE_ETAT_DATE"
  | "ETAT_DATE"
  | "PHOTOS_HD"
  | "VIDEO_VISITE"
  | "PLAN_BIEN"
  | "ANNONCE_IMMOBILIERE"
  | "AFFICHE_VITRINE"
  | "REPORTING_VENDEUR"
  | "SIMULATION_FINANCEMENT"
  | "ATTESTATION_CAPACITE_EMPRUNT"
  | "ACCORD_PRINCIPE_BANCAIRE"
  | "COMPROMIS_OU_PROMESSE"
  | "ANNEXES_COMPROMIS"
  | "PREUVE_SEQUESTRE"
  | "COURRIER_RETRACTATION"
  | "LEVEE_CONDITIONS_SUSPENSIVES"
  | "ACTE_AUTHENTIQUE"
  | "DECOMPTE_NOTAIRE";

export type FileStatus = "UPLOADED" | "CLASSIFIED" | "REVIEW_REQUIRED";

export interface FileResponse {
  id: string;
  propertyId?: string | null;
  typeDocument?: TypeDocument;
  fileName: string;
  mimeType: string;
  size: number;
  status: FileStatus;
  storageKey: string;
  createdAt: string;
}

export interface FileListResponse {
  items: FileResponse[];
  nextCursor?: string | null;
}

export interface FileDownloadUrlResponse {
  url: string;
  expiresAt: string;
}

export interface FileUploadRequest {
  propertyId: string;
  typeDocument?: TypeDocument;
  fileName: string;
  mimeType: string;
  size: number;
  contentBase64?: string;
}

export type MessageChannel = "GMAIL" | "WHATSAPP" | "TELEGRAM";
export type MessageAIStatus = "PENDING" | "PROCESSED" | "REVIEW_REQUIRED";

export interface MessageResponse {
  id: string;
  channel: MessageChannel;
  propertyId?: string | null;
  subject?: string | null;
  body: string;
  fileIds?: string[];
  aiStatus: MessageAIStatus;
  receivedAt: string;
}

export interface MessageListResponse {
  items: MessageResponse[];
  nextCursor?: string | null;
}

export type VocalStatus =
  | "UPLOADED"
  | "TRANSCRIBED"
  | "INSIGHTS_READY"
  | "REVIEW_REQUIRED";

export type VocalType =
  | "VISITE_INITIALE"
  | "VISITE_SUIVI"
  | "COMPTE_RENDU_VISITE_CLIENT"
  | "ERREUR_TRAITEMENT";

export interface VocalUploadRequest {
  propertyId?: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  contentBase64?: string;
}

export interface VocalResponse {
  id: string;
  propertyId?: string | null;
  fileId: string;
  status: VocalStatus;
  vocalType?: VocalType | null;
  processingError?: string | null;
  transcript?: string | null;
  summary?: string | null;
  insights?: Record<string, unknown> | null;
  confidence?: number | null;
  createdAt: string;
}

export interface VocalListResponse {
  items: VocalResponse[];
  nextCursor?: string | null;
}

export interface RunAIResponse {
  jobId: string;
  status: "QUEUED";
}

export type IntegrationProvider = "GMAIL" | "GOOGLE_CALENDAR" | "WHATSAPP";
export type IntegrationStatus = "CONNECTED" | "SYNC_QUEUED";
export type IntegrationPath = "gmail" | "google-calendar" | "whatsapp";

export interface IntegrationResponse {
  provider: IntegrationProvider;
  status: IntegrationStatus;
  connectedAt?: string | null;
  lastSyncedAt?: string | null;
}

export interface IntegrationConnectRequest {
  code?: string;
  redirectUri?: string;
}

export interface IntegrationSyncRequest {
  cursor?: string;
}
