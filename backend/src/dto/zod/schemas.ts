import { z } from "zod";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_CONTENT_BASE64_LENGTH = 28 * 1024 * 1024;

export const HealthResponseSchema = z.object({
  status: z.string(),
});

export const ErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const UserRoleSchema = z.enum(["AGENT", "MANAGER", "ADMIN"]);
export const AccountTypeSchema = z.enum(["AGENT", "CLIENT", "NOTAIRE"]);

export const UserResponseSchema = z.object({
  id: z.string(),
  email: z.email(),
  firstName: z.string(),
  lastName: z.string(),
  orgId: z.string(),
  role: UserRoleSchema,
  createdAt: z.iso.datetime(),
});

export const AccountUserResponseSchema = z.object({
  id: z.string(),
  email: z.email().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  orgId: z.string(),
  accountType: AccountTypeSchema,
  role: z.string(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  personalNotes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const AccountUserLinkedPropertyResponseSchema = z.object({
  propertyId: z.string(),
  title: z.string(),
  city: z.string(),
  postalCode: z.string(),
  status: z.string(),
  relationRole: z.string(),
  source: z.enum(["USER_LINK", "PARTY_LINK"]),
});

export const AccountUserDetailResponseSchema = AccountUserResponseSchema.extend({
  linkedProperties: z.array(AccountUserLinkedPropertyResponseSchema),
});

export const AccountUserListResponseSchema = z.object({
  items: z.array(AccountUserDetailResponseSchema),
  nextCursor: z.string().nullable().optional(),
});

export const UserCreateRequestSchema = z
  .object({
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    email: z.email().nullable().optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    postalCode: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    personalNotes: z.string().nullable().optional(),
    accountType: AccountTypeSchema.default("CLIENT"),
  })
  .superRefine((value, context) => {
    const email = value.email?.trim() ?? "";
    const phone = value.phone?.trim() ?? "";

    if (!email && !phone) {
      context.addIssue({
        code: "custom",
        message: "email ou phone est obligatoire",
        path: ["email"],
      });
    }
  });

export const UserPatchRequestSchema = z.object({
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  email: z.email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  personalNotes: z.string().nullable().optional(),
  accountType: AccountTypeSchema.optional(),
});

export const MeResponseSchema = z.object({
  user: UserResponseSchema,
});

export const AppSettingsResponseSchema = z.object({
  notaryFeePct: z.number(),
});

export const AppSettingsPatchRequestSchema = z.object({
  notaryFeePct: z.number(),
});

export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
  user: UserResponseSchema,
});

export const RefreshRequestSchema = z.object({
  refreshToken: z.string(),
});

export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
});

export const LogoutRequestSchema = z.object({
  refreshToken: z.string(),
});

export const RegisterRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  firstName: z.string(),
  lastName: z.string(),
});

export const ForgotPasswordRequestSchema = z.object({
  email: z.email(),
});

export const ResetPasswordRequestSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

export const PropertyStatusSchema = z.enum([
  "PROSPECTION",
  "MANDAT_SIGNE",
  "EN_DIFFUSION",
  "VISITES",
  "OFFRES",
  "COMPROMIS",
  "VENDU",
  "ARCHIVE",
]);

export const OwnerContactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(1),
  email: z.email(),
  address: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
});

export const PropertyDetailsSchema = z.record(z.string(), z.unknown());

export const PropertyCreateRequestSchema = z
  .object({
    title: z.string().min(1),
    city: z.string().min(1),
    postalCode: z.string().min(1),
    address: z.string().min(1),
    ownerUserId: z.string().optional(),
    owner: OwnerContactSchema.optional(),
    details: PropertyDetailsSchema.optional(),
  })
  .superRefine((value, context) => {
    if (!value.ownerUserId && !value.owner) {
      context.addIssue({
        code: "custom",
        message: "ownerUserId ou owner est obligatoire",
        path: ["ownerUserId"],
      });
    }
  });

export const PropertyPatchRequestSchema = z.object({
  title: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  address: z.string().optional(),
  price: z.number().optional(),
  details: PropertyDetailsSchema.optional(),
  hiddenExpectedDocumentKeys: z.array(z.string()).optional(),
});

export const PropertyResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  city: z.string(),
  postalCode: z.string(),
  address: z.string().nullable(),
  price: z.number().nullable(),
  details: PropertyDetailsSchema,
  hiddenExpectedDocumentKeys: z.array(z.string()),
  status: PropertyStatusSchema,
  orgId: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const PropertyListResponseSchema = z.object({
  items: z.array(PropertyResponseSchema),
  nextCursor: z.string().nullable().optional(),
});

export const PropertyStatusUpdateRequestSchema = z.object({
  status: PropertyStatusSchema,
});

export const PropertyParticipantCreateRequestSchema = z.object({
  contactId: z.string(),
  role: z.enum(["VENDEUR", "ACHETEUR", "LOCATAIRE", "NOTAIRE", "ARTISAN", "AUTRE"]),
});

export const PropertyProspectCreateRequestSchema = z
  .object({
    userId: z.string().optional(),
    newClient: OwnerContactSchema.optional(),
  })
  .superRefine((value, context) => {
    if (!value.userId && !value.newClient) {
      context.addIssue({
        code: "custom",
        message: "userId ou newClient est obligatoire",
        path: ["userId"],
      });
    }
  });

export const PropertyProspectResponseSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  userId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  relationRole: z.string(),
  createdAt: z.iso.datetime(),
});

export const PropertyProspectListResponseSchema = z.object({
  items: z.array(PropertyProspectResponseSchema),
});

export const PropertyVisitCreateRequestSchema = z.object({
  prospectUserId: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

export const PropertyVisitPatchRequestSchema = z.object({
  compteRendu: z.string().nullable().optional(),
  bonDeVisiteFileId: z.string().nullable().optional(),
});

export const PropertyVisitResponseSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  propertyTitle: z.string(),
  prospectUserId: z.string(),
  prospectFirstName: z.string(),
  prospectLastName: z.string(),
  prospectEmail: z.email().nullable(),
  prospectPhone: z.string().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  compteRendu: z.string().nullable(),
  bonDeVisiteFileId: z.string().nullable(),
  bonDeVisiteFileName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const PropertyVisitListResponseSchema = z.object({
  items: z.array(PropertyVisitResponseSchema),
});

export const PropertyRiskStatusSchema = z.enum(["OK", "NO_DATA", "UNAVAILABLE"]);

export const PropertyRiskLocationSchema = z.object({
  address: z.string().nullable(),
  postalCode: z.string(),
  city: z.string(),
  inseeCode: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

export const PropertyRiskItemResponseSchema = z.object({
  label: z.string(),
  categoryCode: z.string().nullable(),
  source: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
});

export const PropertyRiskResponseSchema = z.object({
  propertyId: z.string(),
  status: PropertyRiskStatusSchema,
  source: z.literal("GEORISQUES"),
  georisquesUrl: z.url(),
  reportPdfUrl: z.url().nullable(),
  generatedAt: z.iso.datetime(),
  message: z.string().nullable(),
  location: PropertyRiskLocationSchema,
  items: z.array(PropertyRiskItemResponseSchema),
});

export const ComparablePropertyTypeSchema = z.enum([
  "APPARTEMENT",
  "MAISON",
  "IMMEUBLE",
  "TERRAIN",
  "LOCAL_COMMERCIAL",
  "AUTRE",
]);

export const ComparablePricingPositionSchema = z.enum([
  "UNDER_PRICED",
  "NORMAL",
  "OVER_PRICED",
  "UNKNOWN",
]);

export const ComparableDataSourceSchema = z.enum(["CACHE", "LIVE"]);

export const ComparableSearchCenterSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

export const ComparableSearchResponseSchema = z.object({
  center: ComparableSearchCenterSchema,
  finalRadiusM: z.number().int(),
  radiiTried: z.array(z.number().int()),
  targetCount: z.number().int(),
  targetReached: z.boolean(),
});

export const ComparableSummaryResponseSchema = z.object({
  count: z.number().int(),
  medianPrice: z.number().nullable(),
  medianPricePerM2: z.number().nullable(),
  minPrice: z.number().nullable(),
  maxPrice: z.number().nullable(),
});

export const ComparableSubjectResponseSchema = z.object({
  surfaceM2: z.number().nullable(),
  askingPrice: z.number().nullable(),
  affinePriceAtSubjectSurface: z.number().nullable(),
  predictedPrice: z.number().nullable(),
  deviationPct: z.number().nullable(),
  pricingPosition: ComparablePricingPositionSchema,
});

export const ComparableRegressionResponseSchema = z.object({
  slope: z.number().nullable(),
  intercept: z.number().nullable(),
  r2: z.number().nullable(),
  pointsUsed: z.number().int(),
});

export const ComparablePointResponseSchema = z.object({
  saleDate: z.iso.datetime(),
  surfaceM2: z.number(),
  landSurfaceM2: z.number().nullable(),
  salePrice: z.number(),
  pricePerM2: z.number(),
  distanceM: z.number().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
});

export const PropertyComparablesResponseSchema = z.object({
  propertyId: z.string(),
  propertyType: ComparablePropertyTypeSchema,
  source: ComparableDataSourceSchema,
  windowYears: z.number().int(),
  search: ComparableSearchResponseSchema,
  summary: ComparableSummaryResponseSchema,
  subject: ComparableSubjectResponseSchema,
  regression: ComparableRegressionResponseSchema,
  points: z.array(ComparablePointResponseSchema),
});

export const PropertyParticipantResponseSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  contactId: z.string(),
  role: z.string(),
  createdAt: z.iso.datetime(),
});

export const TypeDocumentSchema = z.enum([
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
]);

export const FileStatusSchema = z.enum(["UPLOADED", "CLASSIFIED", "REVIEW_REQUIRED"]);

export const FileUploadRequestSchema = z.object({
  propertyId: z.string(),
  typeDocument: TypeDocumentSchema.optional(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z
    .number()
    .int()
    .min(0)
    .max(MAX_UPLOAD_BYTES),
  contentBase64: z.string().max(MAX_UPLOAD_CONTENT_BASE64_LENGTH).optional(),
});

export const FileUpdateRequestSchema = z.object({
  propertyId: z.string().nullable().optional(),
  typeDocument: TypeDocumentSchema.optional(),
  status: FileStatusSchema.optional(),
});

export const FileResponseSchema = z.object({
  id: z.string(),
  propertyId: z.string().nullable().optional(),
  typeDocument: TypeDocumentSchema.optional(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  status: FileStatusSchema,
  storageKey: z.string(),
  createdAt: z.iso.datetime(),
});

export const FileListResponseSchema = z.object({
  items: z.array(FileResponseSchema),
  nextCursor: z.string().nullable().optional(),
});

export const FileDownloadUrlResponseSchema = z.object({
  url: z.url(),
  expiresAt: z.iso.datetime(),
});

export const MessageChannelSchema = z.enum(["GMAIL", "WHATSAPP", "TELEGRAM"]);

export const MessageAIStatusSchema = z.enum(["PENDING", "PROCESSED", "REVIEW_REQUIRED"]);

export const MessageResponseSchema = z.object({
  id: z.string(),
  channel: MessageChannelSchema,
  propertyId: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  body: z.string(),
  fileIds: z.array(z.string()).optional(),
  aiStatus: MessageAIStatusSchema,
  receivedAt: z.iso.datetime(),
});

export const MessageListResponseSchema = z.object({
  items: z.array(MessageResponseSchema),
  nextCursor: z.string().nullable().optional(),
});

export const MessageUpdateRequestSchema = z.object({
  propertyId: z.string(),
});

export const VocalStatusSchema = z.enum([
  "UPLOADED",
  "TRANSCRIBED",
  "INSIGHTS_READY",
  "REVIEW_REQUIRED",
]);

export const VocalTypeSchema = z.enum([
  "VISITE_INITIALE",
  "VISITE_SUIVI",
  "COMPTE_RENDU_VISITE_CLIENT",
  "ERREUR_TRAITEMENT",
]);

export const VocalUploadRequestSchema = z.object({
  propertyId: z.string().nullable().optional(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z
    .number()
    .int()
    .min(0)
    .max(MAX_UPLOAD_BYTES),
  contentBase64: z.string().max(MAX_UPLOAD_CONTENT_BASE64_LENGTH).optional(),
});

export const VocalUpdateRequestSchema = z.object({
  propertyId: z.string(),
});

export const VocalResponseSchema = z.object({
  id: z.string(),
  propertyId: z.string().nullable().optional(),
  fileId: z.string(),
  status: VocalStatusSchema,
  vocalType: VocalTypeSchema.nullable().optional(),
  processingError: z.string().nullable().optional(),
  transcript: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  insights: z.record(z.string(), z.unknown()).nullable().optional(),
  confidence: z.number().nullable().optional(),
  createdAt: z.iso.datetime(),
});

export const VocalListResponseSchema = z.object({
  items: z.array(VocalResponseSchema),
  nextCursor: z.string().nullable().optional(),
});

export const RunAIResponseSchema = z.object({
  jobId: z.string(),
  status: z.literal("QUEUED"),
});

export const ReviewQueueItemResponseSchema = z.object({
  id: z.string(),
  itemType: z.enum(["MESSAGE", "FILE", "VOCAL"]),
  itemId: z.string(),
  reason: z.string(),
  status: z.enum(["OPEN", "RESOLVED"]),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable().optional(),
});

export const ReviewQueueListResponseSchema = z.object({
  items: z.array(ReviewQueueItemResponseSchema),
  nextCursor: z.string().nullable().optional(),
});

export const ReviewQueueResolveRequestSchema = z.object({
  resolution: z.string(),
  propertyId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const IntegrationConnectRequestSchema = z.object({
  code: z.string().optional(),
  redirectUri: z.url().optional(),
});

export const IntegrationSyncRequestSchema = z.object({
  cursor: z.string().optional(),
});

export const IntegrationResponseSchema = z.object({
  provider: z.enum(["GMAIL", "GOOGLE_CALENDAR", "WHATSAPP"]),
  status: z.enum(["CONNECTED", "SYNC_QUEUED"]),
  connectedAt: z.iso.datetime().nullable().optional(),
  lastSyncedAt: z.iso.datetime().nullable().optional(),
});

export const DtoSchemaMap = {
  HealthResponse: HealthResponseSchema,
  ErrorResponse: ErrorResponseSchema,
  AccountType: AccountTypeSchema,
  UserResponse: UserResponseSchema,
  AccountUserResponse: AccountUserResponseSchema,
  AccountUserListResponse: AccountUserListResponseSchema,
  AccountUserLinkedPropertyResponse: AccountUserLinkedPropertyResponseSchema,
  AccountUserDetailResponse: AccountUserDetailResponseSchema,
  UserCreateRequest: UserCreateRequestSchema,
  UserPatchRequest: UserPatchRequestSchema,
  MeResponse: MeResponseSchema,
  LoginRequest: LoginRequestSchema,
  LoginResponse: LoginResponseSchema,
  RefreshRequest: RefreshRequestSchema,
  RefreshResponse: RefreshResponseSchema,
  LogoutRequest: LogoutRequestSchema,
  RegisterRequest: RegisterRequestSchema,
  ForgotPasswordRequest: ForgotPasswordRequestSchema,
  ResetPasswordRequest: ResetPasswordRequestSchema,
  PropertyStatus: PropertyStatusSchema,
  OwnerContact: OwnerContactSchema,
  PropertyDetails: PropertyDetailsSchema,
  PropertyCreateRequest: PropertyCreateRequestSchema,
  PropertyPatchRequest: PropertyPatchRequestSchema,
  PropertyResponse: PropertyResponseSchema,
  PropertyListResponse: PropertyListResponseSchema,
  PropertyStatusUpdateRequest: PropertyStatusUpdateRequestSchema,
  PropertyParticipantCreateRequest: PropertyParticipantCreateRequestSchema,
  PropertyParticipantResponse: PropertyParticipantResponseSchema,
  PropertyProspectCreateRequest: PropertyProspectCreateRequestSchema,
  PropertyProspectResponse: PropertyProspectResponseSchema,
  PropertyProspectListResponse: PropertyProspectListResponseSchema,
  PropertyVisitCreateRequest: PropertyVisitCreateRequestSchema,
  PropertyVisitPatchRequest: PropertyVisitPatchRequestSchema,
  PropertyVisitResponse: PropertyVisitResponseSchema,
  PropertyVisitListResponse: PropertyVisitListResponseSchema,
  PropertyRiskStatus: PropertyRiskStatusSchema,
  PropertyRiskLocation: PropertyRiskLocationSchema,
  PropertyRiskItemResponse: PropertyRiskItemResponseSchema,
  PropertyRiskResponse: PropertyRiskResponseSchema,
  ComparablePropertyType: ComparablePropertyTypeSchema,
  ComparablePricingPosition: ComparablePricingPositionSchema,
  ComparableDataSource: ComparableDataSourceSchema,
  ComparableSearchCenter: ComparableSearchCenterSchema,
  ComparableSearchResponse: ComparableSearchResponseSchema,
  ComparableSummaryResponse: ComparableSummaryResponseSchema,
  ComparableSubjectResponse: ComparableSubjectResponseSchema,
  ComparableRegressionResponse: ComparableRegressionResponseSchema,
  ComparablePointResponse: ComparablePointResponseSchema,
  PropertyComparablesResponse: PropertyComparablesResponseSchema,
  TypeDocument: TypeDocumentSchema,
  FileStatus: FileStatusSchema,
  FileUploadRequest: FileUploadRequestSchema,
  FileUpdateRequest: FileUpdateRequestSchema,
  FileResponse: FileResponseSchema,
  FileListResponse: FileListResponseSchema,
  FileDownloadUrlResponse: FileDownloadUrlResponseSchema,
  MessageChannel: MessageChannelSchema,
  MessageAIStatus: MessageAIStatusSchema,
  MessageResponse: MessageResponseSchema,
  MessageListResponse: MessageListResponseSchema,
  MessageUpdateRequest: MessageUpdateRequestSchema,
  VocalStatus: VocalStatusSchema,
  VocalType: VocalTypeSchema,
  VocalUploadRequest: VocalUploadRequestSchema,
  VocalUpdateRequest: VocalUpdateRequestSchema,
  VocalResponse: VocalResponseSchema,
  VocalListResponse: VocalListResponseSchema,
  RunAIResponse: RunAIResponseSchema,
  ReviewQueueItemResponse: ReviewQueueItemResponseSchema,
  ReviewQueueListResponse: ReviewQueueListResponseSchema,
  ReviewQueueResolveRequest: ReviewQueueResolveRequestSchema,
  IntegrationConnectRequest: IntegrationConnectRequestSchema,
  IntegrationSyncRequest: IntegrationSyncRequestSchema,
  IntegrationResponse: IntegrationResponseSchema,
} as const;

export type DtoSchemaName = keyof typeof DtoSchemaMap;
