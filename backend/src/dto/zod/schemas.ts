import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.string(),
});

export const ErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const UserRoleSchema = z.enum(["AGENT", "MANAGER", "ADMIN"]);

export const UserResponseSchema = z.object({
  id: z.string(),
  email: z.email(),
  firstName: z.string(),
  lastName: z.string(),
  orgId: z.string(),
  role: UserRoleSchema,
  createdAt: z.iso.datetime(),
});

export const MeResponseSchema = z.object({
  user: UserResponseSchema,
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
  orgId: z.string(),
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

export const PropertyCreateRequestSchema = z.object({
  title: z.string(),
  city: z.string(),
  postalCode: z.string(),
  address: z.string().optional(),
  price: z.number().optional(),
  status: PropertyStatusSchema,
});

export const PropertyPatchRequestSchema = z.object({
  title: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  address: z.string().optional(),
  price: z.number().optional(),
  status: PropertyStatusSchema.optional(),
});

export const PropertyResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  city: z.string(),
  postalCode: z.string(),
  address: z.string().nullable(),
  price: z.number().nullable(),
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
]);

export const FileStatusSchema = z.enum(["UPLOADED", "CLASSIFIED", "REVIEW_REQUIRED"]);

export const FileUploadRequestSchema = z.object({
  propertyId: z.string().nullable().optional(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
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

export const VocalUploadRequestSchema = z.object({
  propertyId: z.string().nullable().optional(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
});

export const VocalUpdateRequestSchema = z.object({
  propertyId: z.string(),
});

export const VocalResponseSchema = z.object({
  id: z.string(),
  propertyId: z.string().nullable().optional(),
  fileId: z.string(),
  status: VocalStatusSchema,
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
  UserResponse: UserResponseSchema,
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
  PropertyCreateRequest: PropertyCreateRequestSchema,
  PropertyPatchRequest: PropertyPatchRequestSchema,
  PropertyResponse: PropertyResponseSchema,
  PropertyListResponse: PropertyListResponseSchema,
  PropertyStatusUpdateRequest: PropertyStatusUpdateRequestSchema,
  PropertyParticipantCreateRequest: PropertyParticipantCreateRequestSchema,
  PropertyParticipantResponse: PropertyParticipantResponseSchema,
  TypeDocument: TypeDocumentSchema,
  FileStatus: FileStatusSchema,
  FileUploadRequest: FileUploadRequestSchema,
  FileUpdateRequest: FileUpdateRequestSchema,
  FileResponse: FileResponseSchema,
  FileDownloadUrlResponse: FileDownloadUrlResponseSchema,
  MessageChannel: MessageChannelSchema,
  MessageAIStatus: MessageAIStatusSchema,
  MessageResponse: MessageResponseSchema,
  MessageListResponse: MessageListResponseSchema,
  MessageUpdateRequest: MessageUpdateRequestSchema,
  VocalStatus: VocalStatusSchema,
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

