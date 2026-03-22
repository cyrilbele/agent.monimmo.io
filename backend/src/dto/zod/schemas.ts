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
  source: z.enum(["BUSINESS_LINK"]),
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
  aiProvider: z.enum(["openai", "anthropic"]),
  valuationAiOutputFormat: z.string(),
  assistantSoul: z.string(),
});

export const AppSettingsPatchRequestSchema = z
  .object({
    notaryFeePct: z.number().optional(),
    aiProvider: z.enum(["openai", "anthropic"]).optional(),
    valuationAiOutputFormat: z.string().nullable().optional(),
    assistantSoul: z.string().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (
      typeof value.notaryFeePct === "undefined" &&
      typeof value.aiProvider === "undefined" &&
      typeof value.valuationAiOutputFormat === "undefined" &&
      typeof value.assistantSoul === "undefined"
    ) {
      context.addIssue({
        code: "custom",
        message: "notaryFeePct ou aiProvider ou valuationAiOutputFormat ou assistantSoul est obligatoire",
        path: ["notaryFeePct"],
      });
    }
  });

export const AICallLogResponseSchema = z.object({
  id: z.string(),
  datetime: z.iso.datetime(),
  orgId: z.string(),
  useCase: z.string(),
  prompt: z.string(),
  textResponse: z.string(),
  price: z.number(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  totalTokens: z.number().int().nullable(),
  redactionVersion: z.string(),
  expiresAt: z.iso.datetime(),
});

export const AICallLogListResponseSchema = z.object({
  items: z.array(AICallLogResponseSchema),
});

export const GlobalSearchItemTypeSchema = z.enum(["PROPERTY", "USER", "VOCAL", "VISIT"]);

export const GlobalSearchItemResponseSchema = z.object({
  type: GlobalSearchItemTypeSchema,
  id: z.string(),
  label: z.string(),
  subtitle: z.string(),
  route: z.string(),
});

export const GlobalSearchResponseSchema = z.object({
  items: z.array(GlobalSearchItemResponseSchema),
});

export const AssistantObjectTypeSchema = z.enum(["bien", "user", "rdv", "lien"]);

export const AssistantCitationResponseSchema = z.object({
  title: z.string(),
  url: z.url(),
  snippet: z.string(),
});

export const AssistantMessageResponseSchema = z.object({
  id: z.string(),
  role: z.enum(["USER", "ASSISTANT"]),
  text: z.string(),
  citations: z.array(AssistantCitationResponseSchema),
  createdAt: z.iso.datetime(),
});

export const AssistantConversationResponseSchema = z.object({
  id: z.string(),
  greeting: z.string(),
  messages: z.array(AssistantMessageResponseSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const AssistantMessageContextRequestSchema = z.object({
  objectType: AssistantObjectTypeSchema,
  objectId: z.string().trim().min(1),
});

export const AssistantMessageCreateRequestSchema = z.object({
  message: z.string().trim().min(1),
  context: AssistantMessageContextRequestSchema.optional(),
});

export const AssistantMessageCreateResponseSchema = z.object({
  conversation: AssistantConversationResponseSchema,
  assistantMessage: AssistantMessageResponseSchema,
});

export const ObjectChangeModeSchema = z.enum(["USER", "AI"]);

export const ObjectChangeEntrySchema = z.object({
  id: z.string(),
  objectType: AssistantObjectTypeSchema,
  objectId: z.string(),
  paramName: z.string(),
  paramValue: z.string(),
  mode: ObjectChangeModeSchema,
  modifiedAt: z.iso.datetime(),
});

export const ObjectChangeListResponseSchema = z.object({
  items: z.array(ObjectChangeEntrySchema),
});

export const ObjectDataFieldTypeSchema = z.enum([
  "string",
  "text",
  "int",
  "float",
  "boolean",
  "date",
  "datetime",
  "select",
]);

export const ObjectDataFieldSourceSchema = z.enum(["object", "property"]);

export const ObjectDataFieldRuleOperatorSchema = z.enum(["=", "!=", "in", "notIn"]);

export const ObjectDataFieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export const ObjectDataFieldHideRuleSchema = z.object({
  key: z.string(),
  operator: ObjectDataFieldRuleOperatorSchema,
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
  ]),
});

export const ObjectDataFieldDefinitionSchema = z.object({
  key: z.string(),
  name: z.string(),
  group: z.string(),
  subgroup: z.string().optional(),
  type: ObjectDataFieldTypeSchema,
  source: ObjectDataFieldSourceSchema.optional(),
  required: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(ObjectDataFieldOptionSchema).optional(),
  hide: z.array(ObjectDataFieldHideRuleSchema).optional(),
});

export const ObjectDataStructureResponseSchema = z.array(ObjectDataFieldDefinitionSchema);

export const LinkObjectTypeSchema = z.enum(["bien", "user", "rdv"]);
export const LinkTypeSchema = z.enum([
  "bien_user",
  "rdv_bien",
  "rdv_user",
]);

export const LinkTypeDefinitionSchema = z.object({
  typeLien: LinkTypeSchema,
  name: z.string(),
  objectType1: LinkObjectTypeSchema,
  objectType2: LinkObjectTypeSchema,
  paramsSchema: ObjectDataStructureResponseSchema,
});

export const LinkTypeDefinitionListResponseSchema = z.object({
  items: z.array(LinkTypeDefinitionSchema),
});

export const LinkResponseSchema = z.object({
  id: z.string(),
  typeLien: LinkTypeSchema,
  objectId1: z.string(),
  objectId2: z.string(),
  params: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const LinkListResponseSchema = z.object({
  items: z.array(LinkResponseSchema),
  nextCursor: z.string().nullable().optional(),
});

export const LinkCreateRequestSchema = z.object({
  typeLien: LinkTypeSchema,
  objectId1: z.string().min(1),
  objectId2: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const LinkPatchRequestSchema = z.object({
  params: z.record(z.string(), z.unknown()),
});

export const LinkRelatedItemResponseSchema = z.object({
  link: LinkResponseSchema,
  otherSideObjectType: LinkObjectTypeSchema,
  otherSideObjectId: z.string(),
  otherSide: z.unknown().nullable(),
});

export const LinkRelatedResponseSchema = z.object({
  items: z.array(LinkRelatedItemResponseSchema),
  grouped: z.object({
    bien: z.array(z.unknown()),
    user: z.array(z.unknown()),
    rdv: z.array(z.unknown()),
  }),
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

export const PrivacyExportStatusSchema = z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"]);

export const PrivacyExportRequestSchema = z.object({});

export const PrivacyExportResponseSchema = z.object({
  id: z.string(),
  status: PrivacyExportStatusSchema,
  requestedAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime(),
  errorMessage: z.string().nullable(),
  data: z.unknown().nullable(),
});

export const PrivacyEraseRequestSchema = z.object({});

export const PrivacyEraseResponseSchema = z.object({
  requestId: z.string(),
  status: z.literal("PENDING"),
  requestedAt: z.iso.datetime(),
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
    details: PropertyDetailsSchema.optional(),
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
    relationRole: z.enum(["OWNER", "PROSPECT", "ACHETEUR"]).optional(),
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

export const CalendarAppointmentCreateRequestSchema = z.object({
  title: z.string().min(1),
  propertyId: z.string().min(1),
  userId: z.string().nullable().optional(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  address: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});

export const CalendarAppointmentResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  propertyId: z.string(),
  propertyTitle: z.string(),
  userId: z.string().nullable(),
  userFirstName: z.string().nullable(),
  userLastName: z.string().nullable(),
  address: z.string().nullable(),
  comment: z.string().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const CalendarAppointmentListResponseSchema = z.object({
  items: z.array(CalendarAppointmentResponseSchema),
});

export const RdvTypeSchema = z.enum(["RENDEZ_VOUS", "VISITE_BIEN"]);

export const RdvResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  propertyId: z.string(),
  propertyTitle: z.string(),
  userId: z.string().nullable(),
  userFirstName: z.string().nullable(),
  userLastName: z.string().nullable(),
  address: z.string().nullable(),
  comment: z.string().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  rdvType: RdvTypeSchema,
  bonDeVisiteFileId: z.string().nullable(),
  bonDeVisiteFileName: z.string().nullable(),
});

export const RdvListResponseSchema = z.object({
  items: z.array(RdvResponseSchema),
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

export const PropertyValuationAICriteriaItemSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const PropertyValuationAIComparableFiltersSchema = z.object({
  propertyType: ComparablePropertyTypeSchema.optional(),
  radiusMaxM: z.number().nullable().optional(),
  surfaceMinM2: z.number().nullable().optional(),
  surfaceMaxM2: z.number().nullable().optional(),
  landSurfaceMinM2: z.number().nullable().optional(),
  landSurfaceMaxM2: z.number().nullable().optional(),
});

export const PropertyValuationAIRequestSchema = z.object({
  comparableFilters: PropertyValuationAIComparableFiltersSchema.optional(),
  agentAdjustedPrice: z.number().nullable().optional(),
});

export const PropertyValuationAIResponseSchema = z.object({
  propertyId: z.string(),
  aiCalculatedValuation: z.number().nullable(),
  valuationJustification: z.string(),
  promptUsed: z.string(),
  generatedAt: z.iso.datetime(),
  comparableCountUsed: z.number().int(),
  criteriaUsed: z.array(PropertyValuationAICriteriaItemSchema),
});

export const PropertyValuationAIPromptResponseSchema = z.object({
  propertyId: z.string(),
  promptUsed: z.string(),
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
  AppSettingsResponse: AppSettingsResponseSchema,
  AppSettingsPatchRequest: AppSettingsPatchRequestSchema,
  AICallLogResponse: AICallLogResponseSchema,
  AICallLogListResponse: AICallLogListResponseSchema,
  GlobalSearchItemType: GlobalSearchItemTypeSchema,
  GlobalSearchItemResponse: GlobalSearchItemResponseSchema,
  GlobalSearchResponse: GlobalSearchResponseSchema,
  AssistantObjectType: AssistantObjectTypeSchema,
  AssistantCitationResponse: AssistantCitationResponseSchema,
  AssistantMessageResponse: AssistantMessageResponseSchema,
  AssistantConversationResponse: AssistantConversationResponseSchema,
  AssistantMessageContextRequest: AssistantMessageContextRequestSchema,
  AssistantMessageCreateRequest: AssistantMessageCreateRequestSchema,
  AssistantMessageCreateResponse: AssistantMessageCreateResponseSchema,
  ObjectChangeMode: ObjectChangeModeSchema,
  ObjectChangeEntry: ObjectChangeEntrySchema,
  ObjectChangeListResponse: ObjectChangeListResponseSchema,
  ObjectDataFieldType: ObjectDataFieldTypeSchema,
  ObjectDataFieldSource: ObjectDataFieldSourceSchema,
  ObjectDataFieldRuleOperator: ObjectDataFieldRuleOperatorSchema,
  ObjectDataFieldOption: ObjectDataFieldOptionSchema,
  ObjectDataFieldHideRule: ObjectDataFieldHideRuleSchema,
  ObjectDataFieldDefinition: ObjectDataFieldDefinitionSchema,
  ObjectDataStructureResponse: ObjectDataStructureResponseSchema,
  LinkObjectType: LinkObjectTypeSchema,
  LinkType: LinkTypeSchema,
  LinkTypeDefinition: LinkTypeDefinitionSchema,
  LinkTypeDefinitionListResponse: LinkTypeDefinitionListResponseSchema,
  LinkResponse: LinkResponseSchema,
  LinkListResponse: LinkListResponseSchema,
  LinkCreateRequest: LinkCreateRequestSchema,
  LinkPatchRequest: LinkPatchRequestSchema,
  LinkRelatedItemResponse: LinkRelatedItemResponseSchema,
  LinkRelatedResponse: LinkRelatedResponseSchema,
  LoginRequest: LoginRequestSchema,
  LoginResponse: LoginResponseSchema,
  RefreshRequest: RefreshRequestSchema,
  RefreshResponse: RefreshResponseSchema,
  LogoutRequest: LogoutRequestSchema,
  PrivacyExportStatus: PrivacyExportStatusSchema,
  PrivacyExportRequest: PrivacyExportRequestSchema,
  PrivacyExportResponse: PrivacyExportResponseSchema,
  PrivacyEraseRequest: PrivacyEraseRequestSchema,
  PrivacyEraseResponse: PrivacyEraseResponseSchema,
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
  CalendarAppointmentCreateRequest: CalendarAppointmentCreateRequestSchema,
  CalendarAppointmentResponse: CalendarAppointmentResponseSchema,
  CalendarAppointmentListResponse: CalendarAppointmentListResponseSchema,
  RdvType: RdvTypeSchema,
  RdvResponse: RdvResponseSchema,
  RdvListResponse: RdvListResponseSchema,
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
  PropertyValuationAICriteriaItem: PropertyValuationAICriteriaItemSchema,
  PropertyValuationAIComparableFilters: PropertyValuationAIComparableFiltersSchema,
  PropertyValuationAIRequest: PropertyValuationAIRequestSchema,
  PropertyValuationAIResponse: PropertyValuationAIResponseSchema,
  PropertyValuationAIPromptResponse: PropertyValuationAIPromptResponseSchema,
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
