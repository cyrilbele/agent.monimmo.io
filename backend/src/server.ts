import { z } from "zod";
import { aiCallLogsService } from "./ai/call-logs";
import { enforceAuthRateLimit } from "./auth/rate-limit";
import { assertManagerOrAdmin } from "./auth/rbac";
import { authService } from "./auth/service";
import {
  AssistantConversationResponseSchema,
  LinkCreateRequestSchema,
  LinkListResponseSchema,
  LinkPatchRequestSchema,
  LinkRelatedResponseSchema,
  LinkResponseSchema,
  LinkTypeDefinitionListResponseSchema,
  LinkTypeDefinitionSchema,
  ObjectDataStructureResponseSchema,
  ObjectChangeListResponseSchema,
  AssistantMessageCreateRequestSchema,
  AssistantMessageCreateResponseSchema,
  AppSettingsPatchRequestSchema,
  AICallLogListResponseSchema,
  CalendarAppointmentCreateRequestSchema,
  ForgotPasswordRequestSchema,
  FileUpdateRequestSchema,
  FileUploadRequestSchema,
  IntegrationConnectRequestSchema,
  IntegrationSyncRequestSchema,
  LoginRequestSchema,
  LogoutRequestSchema,
  MessageUpdateRequestSchema,
  PropertyCreateRequestSchema,
  PropertyPatchRequestSchema,
  PropertyVisitPatchRequestSchema,
  PropertyVisitCreateRequestSchema,
  PropertyStatusUpdateRequestSchema,
  PropertyValuationAIPromptResponseSchema,
  PropertyValuationAIRequestSchema,
  PrivacyEraseRequestSchema,
  PrivacyEraseResponseSchema,
  PrivacyExportRequestSchema,
  PrivacyExportResponseSchema,
  ReviewQueueResolveRequestSchema,
  RegisterRequestSchema,
  RefreshRequestSchema,
  ResetPasswordRequestSchema,
  UserCreateRequestSchema,
  UserPatchRequestSchema,
  VocalUpdateRequestSchema,
  VocalUploadRequestSchema,
} from "./dto/zod";
import { HttpError, toApiError } from "./http/errors";
import { assistantService } from "./assistant/service";
import { calendarService } from "./calendar/service";
import { filesService } from "./files/service";
import { integrationsService } from "./integrations/service";
import { messagesService } from "./messages/service";
import { propertiesService } from "./properties/service";
import { privacyService } from "./privacy/service";
import { MARKET_PROPERTY_TYPES, type MarketPropertyType } from "./properties/dvf-client";
import {
  enqueueFileAiJob,
  enqueueMessageAiJob,
  enqueueVocalInsightsJob,
  enqueueVocalTranscriptionJob,
} from "./queues";
import { reviewQueueService } from "./review-queue/service";
import { globalSearchService } from "./search/global-search";
import { getStorageProvider } from "./storage";
import {
  STORAGE_URL_SIGNATURE_QUERY_PARAM,
  verifyStorageUrlSignature,
} from "./storage/url-signing";
import { usersService } from "./users/service";
import { vocalsService } from "./vocals/service";
import { objectChangeLogService } from "./object-data/change-log";
import { getLinkDataStructure, getObjectDataStructure, listLinkDataStructures } from "./object-data/structure";
import { linksService } from "./links/service";

const json = (data: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });

const error = (status: number, code: string, message: string, details?: unknown): Response =>
  json(
    {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
    { status },
  );

const toSseEvent = (event: string, payload: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

const splitStreamingText = (text: string): string[] => {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let index = 0;
  const hardLimit = 56;
  const minChunk = 16;

  while (index < normalized.length) {
    const maxEnd = Math.min(normalized.length, index + hardLimit);
    let end = maxEnd;

    if (maxEnd < normalized.length) {
      const whitespaceBreak = normalized.lastIndexOf(" ", maxEnd);
      if (whitespaceBreak >= index + minChunk) {
        end = whitespaceBreak + 1;
      }
    }

    chunks.push(normalized.slice(index, end));
    index = end;
  }

  return chunks;
};

const getSwaggerHtml = (): string => `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Monimmo API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({ url: "/openapi.yaml", dom_id: "#swagger-ui" });
    </script>
  </body>
</html>`;

const DEFAULT_CORS_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const getAllowedCorsOrigins = (): Set<string> => {
  const fromEnv = process.env.CORS_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (fromEnv && fromEnv.length > 0) {
    return new Set(fromEnv);
  }

  return new Set(DEFAULT_CORS_ALLOWED_ORIGINS);
};

const allowedCorsOrigins = getAllowedCorsOrigins();
const MAX_JSON_BODY_BYTES = 25 * 1024 * 1024;

const mimeTypeByExtension: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  webm: "audio/webm",
  ogg: "audio/ogg",
  pdf: "application/pdf",
};

const detectMimeTypeFromStorageKey = (key: string): string => {
  const [basePath] = key.split("?", 1);
  const extension = basePath.split(".").at(-1)?.toLowerCase() ?? "";
  return mimeTypeByExtension[extension] ?? "application/octet-stream";
};

const buildCorsHeaders = (request: Request): Headers | null => {
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }

  if (!allowedCorsOrigins.has("*") && !allowedCorsOrigins.has(origin)) {
    return null;
  }

  const headers = new Headers();
  headers.set(
    "access-control-allow-origin",
    allowedCorsOrigins.has("*") ? "*" : origin,
  );
  headers.set("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  headers.set(
    "access-control-allow-headers",
    request.headers.get("access-control-request-headers") ??
      "authorization,content-type",
  );
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "Origin");
  return headers;
};

const applySecurityHeaders = (headers: Headers): void => {
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  headers.set(
    "content-security-policy",
    "default-src 'self' https://unpkg.com; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
};

const withCors = (request: Request, response: Response): Response => {
  const corsHeaders = buildCorsHeaders(request);
  const headers = new Headers(response.headers);
  applySecurityHeaders(headers);

  if (corsHeaders) {
    for (const [key, value] of corsHeaders.entries()) {
      headers.set(key, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const isLoopbackHost = (host: string): boolean => {
  const normalized = host.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
};

const isHttpsRequest = (request: Request, url: URL): boolean => {
  if (url.protocol === "https:") {
    return true;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (!forwardedProto) {
    return false;
  }

  return forwardedProto
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .includes("https");
};

const shouldEnforceHttps = (request: Request, url: URL): boolean => {
  const explicit = process.env.ENFORCE_HTTPS;
  if (explicit === "false") {
    return false;
  }

  if (isLoopbackHost(url.hostname)) {
    return false;
  }

  if (request.headers.get("x-forwarded-host")?.includes("localhost")) {
    return false;
  }

  return true;
};

export const createApp = (options?: { openapiPath?: string }) => ({
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return withCors(request, new Response(null, { status: 204 }));
    }

    try {
      const url = new URL(request.url);
      const openapiPath = options?.openapiPath ?? "openapi/openapi.yaml";
      if (shouldEnforceHttps(request, url) && !isHttpsRequest(request, url)) {
        throw new HttpError(400, "HTTPS_REQUIRED", "HTTPS est requis pour accéder à cette API");
      }

      const parseJson = async <T extends z.ZodTypeAny>(schema: T): Promise<z.infer<T>> => {
        const contentLength = request.headers.get("content-length");
        if (contentLength) {
          const numericLength = Number(contentLength);
          if (Number.isFinite(numericLength) && numericLength > MAX_JSON_BODY_BYTES) {
            throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Payload trop volumineux");
          }
        }

        let body: unknown;

        try {
          body = await request.json();
        } catch {
          throw new HttpError(400, "INVALID_JSON", "Corps JSON invalide");
        }

        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          throw new HttpError(400, "VALIDATION_ERROR", "Payload invalide", parsed.error.flatten());
        }

        return parsed.data;
      };

      const parseOptionalJson = async <T extends z.ZodTypeAny>(
        schema: T,
      ): Promise<z.infer<T>> => {
        const contentLength = request.headers.get("content-length");
        const contentType = request.headers.get("content-type");

        if (contentLength && contentType?.includes("application/json")) {
          const numericLength = Number(contentLength);
          if (Number.isFinite(numericLength) && numericLength > MAX_JSON_BODY_BYTES) {
            throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Payload trop volumineux");
          }
        }

        if (!contentLength || contentLength === "0" || !contentType?.includes("application/json")) {
          const parsedEmpty = schema.safeParse({});
          if (parsedEmpty.success) {
            return parsedEmpty.data;
          }

          throw new HttpError(400, "VALIDATION_ERROR", "Payload invalide", parsedEmpty.error.flatten());
        }

        return parseJson(schema);
      };

      const getBearerToken = (): string => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          throw new HttpError(401, "UNAUTHORIZED", "Token d'accès manquant");
        }

        return authHeader.slice("Bearer ".length).trim();
      };

      const getAuthenticatedUser = async () => {
        const accessToken = getBearerToken();
        const me = await authService.me(accessToken);
        return me.user;
      };

      const parseLimit = (): number => {
        const raw = url.searchParams.get("limit");
        if (!raw) {
          return 20;
        }

        const limit = Number(raw);
        if (Number.isNaN(limit) || limit < 1 || limit > 100) {
          throw new HttpError(400, "INVALID_LIMIT", "Le paramètre limit est invalide");
        }

        return limit;
      };

      const parseBooleanQueryParam = (name: string): boolean | undefined => {
        const raw = url.searchParams.get(name);
        if (raw === null || raw === "") {
          return undefined;
        }

        if (raw === "true") {
          return true;
        }

        if (raw === "false") {
          return false;
        }

        throw new HttpError(400, "INVALID_QUERY_PARAM", `Le parametre ${name} est invalide`);
      };

      const parseComparablePropertyTypeParam = (): MarketPropertyType | undefined => {
        const raw = url.searchParams.get("propertyType");
        if (!raw) {
          return undefined;
        }

        const normalized = raw.trim().toUpperCase();
        if (!MARKET_PROPERTY_TYPES.includes(normalized as MarketPropertyType)) {
          throw new HttpError(
            400,
            "INVALID_PROPERTY_TYPE",
            "Le type de bien est invalide pour les comparables",
          );
        }

        return normalized as MarketPropertyType;
      };

      if (request.method === "GET" && url.pathname === "/health") {
        return withCors(request, json({ status: "ok" }, { status: 200 }));
      }

      const storageMatch = url.pathname.match(/^\/storage\/(.+)$/);
      if (storageMatch && request.method === "GET") {
        const expiresAtRaw = url.searchParams.get("expiresAt");
        const signature = url.searchParams.get(STORAGE_URL_SIGNATURE_QUERY_PARAM);
        if (!expiresAtRaw) {
          throw new HttpError(400, "INVALID_STORAGE_URL", "URL de téléchargement invalide");
        }

        const key = decodeURIComponent(storageMatch[1]);
        if (!signature) {
          throw new HttpError(403, "INVALID_STORAGE_SIGNATURE", "Signature de téléchargement invalide");
        }

        const signatureValid = verifyStorageUrlSignature({
          key,
          expiresAt: expiresAtRaw,
          signature,
        });
        if (!signatureValid) {
          throw new HttpError(403, "INVALID_STORAGE_SIGNATURE", "Signature de téléchargement invalide");
        }

        const expiresAt = new Date(expiresAtRaw);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
          throw new HttpError(403, "STORAGE_URL_EXPIRED", "URL de téléchargement expirée");
        }

        const storageObject = await getStorageProvider().getObject(key);
        const responseBytes = Buffer.from(storageObject.data);

        return withCors(
          request,
          new Response(new Blob([responseBytes]), {
            status: 200,
            headers: {
              "content-type":
                storageObject.contentType ?? detectMimeTypeFromStorageKey(key),
              "cache-control": "no-store",
            },
          }),
        );
      }

      if (request.method === "POST" && url.pathname === "/auth/login") {
        enforceAuthRateLimit({ action: "login", request });
        const payload = await parseJson(LoginRequestSchema);
        const response = await authService.login(payload);
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "POST" && url.pathname === "/auth/register") {
        const payload = await parseJson(RegisterRequestSchema);
        const response = await authService.register(payload);
        return withCors(request, json(response, { status: 201 }));
      }

      if (request.method === "POST" && url.pathname === "/auth/refresh") {
        const payload = await parseJson(RefreshRequestSchema);
        const response = await authService.refresh(payload);
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "POST" && url.pathname === "/auth/logout") {
        const payload = await parseJson(LogoutRequestSchema);
        await authService.logout(payload);
        return withCors(request, new Response(null, { status: 204 }));
      }

      if (request.method === "POST" && url.pathname === "/auth/forgot-password") {
        enforceAuthRateLimit({ action: "forgot-password", request });
        const payload = await parseJson(ForgotPasswordRequestSchema);
        await authService.forgotPassword(payload);
        return withCors(request, new Response(null, { status: 202 }));
      }

      if (request.method === "POST" && url.pathname === "/auth/reset-password") {
        enforceAuthRateLimit({ action: "reset-password", request });
        const payload = await parseJson(ResetPasswordRequestSchema);
        await authService.resetPassword(payload);
        return withCors(request, new Response(null, { status: 204 }));
      }

      if (request.method === "GET" && url.pathname === "/me") {
        const accessToken = getBearerToken();
        const response = await authService.me(accessToken);
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "GET" && url.pathname === "/me/settings") {
        const accessToken = getBearerToken();
        const response = await authService.getSettings(accessToken);
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "PATCH" && url.pathname === "/me/settings") {
        const accessToken = getBearerToken();
        const payload = await parseJson(AppSettingsPatchRequestSchema);
        const response = await authService.updateSettings(accessToken, payload);
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "GET" && url.pathname === "/me/ai-calls") {
        const user = await getAuthenticatedUser();
        const response = AICallLogListResponseSchema.parse(await aiCallLogsService.list({
          orgId: user.orgId,
          limit: parseLimit(),
        }));
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "POST" && url.pathname === "/privacy/exports") {
        const user = await getAuthenticatedUser();
        assertManagerOrAdmin(user.role);
        await parseOptionalJson(PrivacyExportRequestSchema);
        const response = PrivacyExportResponseSchema.parse(
          await privacyService.requestExport({
            orgId: user.orgId,
            requestedByUserId: user.id,
          }),
        );
        return withCors(request, json(response, { status: 202 }));
      }

      const privacyExportByIdMatch = url.pathname.match(/^\/privacy\/exports\/([^/]+)$/);
      if (privacyExportByIdMatch && request.method === "GET") {
        const exportId = decodeURIComponent(privacyExportByIdMatch[1]);
        const user = await getAuthenticatedUser();
        assertManagerOrAdmin(user.role);
        const response = PrivacyExportResponseSchema.parse(
          await privacyService.getExportById({
            orgId: user.orgId,
            id: exportId,
          }),
        );
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "POST" && url.pathname === "/privacy/erase") {
        const user = await getAuthenticatedUser();
        assertManagerOrAdmin(user.role);
        await parseOptionalJson(PrivacyEraseRequestSchema);
        const response = PrivacyEraseResponseSchema.parse(
          await privacyService.requestErase({
            orgId: user.orgId,
            requestedByUserId: user.id,
          }),
        );
        return withCors(request, json(response, { status: 202 }));
      }

      if (request.method === "GET" && url.pathname === "/search") {
        const user = await getAuthenticatedUser();
        const response = await globalSearchService.search({
          orgId: user.orgId,
          query: url.searchParams.get("q") ?? "",
          limit: parseLimit(),
        });
        return withCors(request, json(response, { status: 200 }));
      }

      if (
        request.method === "GET" &&
        (url.pathname === "/data-structure/lien" || url.pathname === "/getdatastructure/lien")
      ) {
        await getAuthenticatedUser();
        const response = LinkTypeDefinitionListResponseSchema.parse({
          items: listLinkDataStructures(),
        });
        return withCors(request, json(response, { status: 200 }));
      }

      const linkDataStructureMatch = url.pathname.match(/^\/(?:data-structure|getdatastructure)\/lien\/([^/]+)$/);
      if (linkDataStructureMatch && request.method === "GET") {
        await getAuthenticatedUser();
        const typeLien = decodeURIComponent(linkDataStructureMatch[1]);
        const definition = getLinkDataStructure(typeLien);
        if (!definition) {
          throw new HttpError(404, "LINK_TYPE_NOT_FOUND", "Type de lien introuvable");
        }
        const response = LinkTypeDefinitionSchema.parse(definition);
        return withCors(request, json(response, { status: 200 }));
      }

      const objectDataStructureMatch = url.pathname.match(/^\/(?:data-structure|getdatastructure)\/([^/]+)$/);
      if (objectDataStructureMatch && request.method === "GET") {
        const user = await getAuthenticatedUser();
        const objectType = decodeURIComponent(objectDataStructureMatch[1]).toLowerCase();
        if (objectType !== "bien" && objectType !== "user" && objectType !== "rdv" && objectType !== "visite") {
          throw new HttpError(400, "INVALID_OBJECT_TYPE", "Type d'objet invalide");
        }

        const response = ObjectDataStructureResponseSchema.parse(
          getObjectDataStructure(objectType),
        );
        if (!user.orgId) {
          throw new HttpError(403, "ORG_SCOPE_REQUIRED", "Organisation requise");
        }

        return withCors(request, json(response, { status: 200 }));
      }

      if (url.pathname === "/links") {
        const user = await getAuthenticatedUser();

        if (request.method === "GET") {
          const response = LinkListResponseSchema.parse(
            await linksService.list({
              orgId: user.orgId,
              limit: parseLimit(),
              cursor: url.searchParams.get("cursor") ?? undefined,
              typeLien: url.searchParams.get("typeLien") ?? undefined,
              objectId: url.searchParams.get("objectId") ?? undefined,
              objectId1: url.searchParams.get("objectId1") ?? undefined,
              objectId2: url.searchParams.get("objectId2") ?? undefined,
            }),
          );
          return withCors(request, json(response, { status: 200 }));
        }

        if (request.method === "POST") {
          const payload = await parseJson(LinkCreateRequestSchema);
          const upserted = await linksService.upsert({
            orgId: user.orgId,
            typeLien: payload.typeLien,
            objectId1: payload.objectId1,
            objectId2: payload.objectId2,
            params: payload.params,
          });
          const response = LinkResponseSchema.parse(upserted.item);
          return withCors(request, json(response, { status: upserted.created ? 201 : 200 }));
        }
      }

      const linkByIdMatch = url.pathname.match(/^\/links\/([^/]+)$/);
      if (linkByIdMatch) {
        const user = await getAuthenticatedUser();
        const linkId = decodeURIComponent(linkByIdMatch[1]);

        if (request.method === "GET") {
          const response = LinkResponseSchema.parse(
            await linksService.getById({
              orgId: user.orgId,
              id: linkId,
            }),
          );
          return withCors(request, json(response, { status: 200 }));
        }

        if (request.method === "PATCH") {
          const payload = await parseJson(LinkPatchRequestSchema);
          const response = LinkResponseSchema.parse(
            await linksService.patchById({
              orgId: user.orgId,
              id: linkId,
              params: payload.params,
            }),
          );
          return withCors(request, json(response, { status: 200 }));
        }

        if (request.method === "DELETE") {
          await linksService.deleteById({
            orgId: user.orgId,
            id: linkId,
          });
          return withCors(request, new Response(null, { status: 204 }));
        }
      }

      const relatedLinksMatch = url.pathname.match(/^\/links\/related\/([^/]+)\/([^/]+)$/);
      if (relatedLinksMatch && request.method === "GET") {
        const user = await getAuthenticatedUser();
        const objectType = decodeURIComponent(relatedLinksMatch[1]).toLowerCase();
        const objectId = decodeURIComponent(relatedLinksMatch[2]);
        const response = LinkRelatedResponseSchema.parse(
          await linksService.getRelated({
            orgId: user.orgId,
            objectType,
            objectId,
          }),
        );
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "GET" && url.pathname === "/assistant/conversation") {
        const accessToken = getBearerToken();
        const [me, settings] = await Promise.all([
          authService.me(accessToken),
          authService.getSettings(accessToken),
        ]);
        const response = AssistantConversationResponseSchema.parse(
          await assistantService.getConversation({
            orgId: me.user.orgId,
            userId: me.user.id,
            assistantSoul: settings.assistantSoul,
          }),
        );
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "POST" && url.pathname === "/assistant/conversation/reset") {
        const accessToken = getBearerToken();
        const [me, settings] = await Promise.all([
          authService.me(accessToken),
          authService.getSettings(accessToken),
        ]);
        const response = AssistantConversationResponseSchema.parse(
          await assistantService.resetConversation({
            orgId: me.user.orgId,
            userId: me.user.id,
            assistantSoul: settings.assistantSoul,
          }),
        );
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "POST" && url.pathname === "/assistant/messages") {
        const accessToken = getBearerToken();
        const [me, settings, payload] = await Promise.all([
          authService.me(accessToken),
          authService.getSettings(accessToken),
          parseJson(AssistantMessageCreateRequestSchema),
        ]);

        const response = AssistantMessageCreateResponseSchema.parse(
          await assistantService.postUserMessage({
            orgId: me.user.orgId,
            userId: me.user.id,
            message: payload.message,
            context: payload.context,
            assistantSoul: settings.assistantSoul,
          }),
        );

        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "POST" && url.pathname === "/assistant/messages/stream") {
        const accessToken = getBearerToken();
        const [me, settings, payload] = await Promise.all([
          authService.me(accessToken),
          authService.getSettings(accessToken),
          parseJson(AssistantMessageCreateRequestSchema),
        ]);

        let streamClosed = false;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();

            const send = (event: string, data: unknown): boolean => {
              if (streamClosed) {
                return false;
              }

              try {
                controller.enqueue(encoder.encode(toSseEvent(event, data)));
                return true;
              } catch {
                streamClosed = true;
                return false;
              }
            };

            const safeClose = (): void => {
              if (streamClosed) {
                return;
              }

              try {
                controller.close();
              } catch {
                // Le client peut avoir annulé le stream avant la fermeture explicite.
              } finally {
                streamClosed = true;
              }
            };

            void (async () => {
              try {
                send("status", { state: "processing" });

                const response = AssistantMessageCreateResponseSchema.parse(
                  await assistantService.postUserMessage({
                    orgId: me.user.orgId,
                    userId: me.user.id,
                    message: payload.message,
                    context: payload.context,
                    assistantSoul: settings.assistantSoul,
                  }),
                );

                const chunks = splitStreamingText(response.assistantMessage.text);
                for (const chunk of chunks) {
                  send("delta", { text: chunk });
                  await new Promise((resolve) => setTimeout(resolve, 14));
                }

                send("final", response);
              } catch (streamError) {
                if (streamError instanceof HttpError) {
                  const apiError = toApiError(streamError);
                  send("error", apiError);
                } else {
                  send("error", {
                    code: "ASSISTANT_STREAM_FAILED",
                    message:
                      streamError instanceof Error ? streamError.message : "Streaming assistant impossible",
                  });
                }
              } finally {
                safeClose();
              }
            })();
          },
          cancel() {
            // Le client a fermé la connexion SSE.
            streamClosed = true;
          },
        });

        return withCors(
          request,
          new Response(stream, {
            status: 200,
            headers: {
              "content-type": "text/event-stream; charset=utf-8",
              "cache-control": "no-cache, no-transform",
              connection: "keep-alive",
              "x-accel-buffering": "no",
            },
          }),
        );
      }

      const objectChangesMatch = url.pathname.match(/^\/object-changes\/([^/]+)\/([^/]+)$/);
      if (objectChangesMatch && request.method === "GET") {
        const user = await getAuthenticatedUser();
        const objectType = decodeURIComponent(objectChangesMatch[1]).toLowerCase();
        const objectId = decodeURIComponent(objectChangesMatch[2]);

        if (
          objectType !== "bien" &&
          objectType !== "user" &&
          objectType !== "rdv" &&
          objectType !== "visite" &&
          objectType !== "lien"
        ) {
          throw new HttpError(400, "INVALID_OBJECT_TYPE", "Type d'objet invalide");
        }

        const response = ObjectChangeListResponseSchema.parse(
          await objectChangeLogService.list({
            orgId: user.orgId,
            objectType,
            objectId,
            limit: parseLimit(),
          }),
        );

        return withCors(request, json(response, { status: 200 }));
      }

      if (url.pathname === "/users") {
        const user = await getAuthenticatedUser();

        if (request.method === "GET") {
          const accountTypeParam = url.searchParams.get("accountType");
          const allowedAccountTypes = ["AGENT", "CLIENT", "NOTAIRE"] as const;
          const accountType =
            accountTypeParam && allowedAccountTypes.includes(accountTypeParam as (typeof allowedAccountTypes)[number])
              ? (accountTypeParam as (typeof allowedAccountTypes)[number])
              : undefined;

          if (accountTypeParam && !accountType) {
            throw new HttpError(
              400,
              "INVALID_ACCOUNT_TYPE",
              "Le type de compte est invalide",
            );
          }

          const response = await usersService.list({
            orgId: user.orgId,
            limit: parseLimit(),
            cursor: url.searchParams.get("cursor") ?? undefined,
            query: url.searchParams.get("q") ?? undefined,
            accountType,
          });
          return withCors(request, json(response, { status: 200 }));
        }

        if (request.method === "POST") {
          const payload = await parseJson(UserCreateRequestSchema);
          const response = await usersService.create({
            orgId: user.orgId,
            data: payload,
          });
          return withCors(request, json(response, { status: 201 }));
        }
      }

      if (request.method === "GET" && url.pathname === "/properties") {
        const user = await getAuthenticatedUser();
        const response = await propertiesService.list({
          orgId: user.orgId,
          limit: parseLimit(),
          cursor: url.searchParams.get("cursor") ?? undefined,
          query: url.searchParams.get("q") ?? undefined,
        });
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "POST" && url.pathname === "/properties") {
        const user = await getAuthenticatedUser();
        const payload = await parseJson(PropertyCreateRequestSchema);
        const response = await propertiesService.create({
          orgId: user.orgId,
          ...payload,
        });
        return withCors(request, json(response, { status: 201 }));
      }

      if (request.method === "GET" && url.pathname === "/visits") {
        const user = await getAuthenticatedUser();
        const response = await propertiesService.listCalendarVisits({
          orgId: user.orgId,
          from: url.searchParams.get("from") ?? undefined,
          to: url.searchParams.get("to") ?? undefined,
        });
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "GET" && url.pathname === "/calendar-events") {
        const user = await getAuthenticatedUser();
        const response = await calendarService.listManualAppointments({
          orgId: user.orgId,
          from: url.searchParams.get("from") ?? undefined,
          to: url.searchParams.get("to") ?? undefined,
        });
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "POST" && url.pathname === "/calendar-events") {
        const user = await getAuthenticatedUser();
        const payload = await parseJson(CalendarAppointmentCreateRequestSchema);
        const response = await calendarService.createManualAppointment({
          orgId: user.orgId,
          title: payload.title,
          propertyId: payload.propertyId,
          userId: payload.userId ?? null,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
          address: payload.address ?? null,
          comment: payload.comment ?? null,
        });
        return withCors(request, json(response, { status: 201 }));
      }

      const visitByIdMatch = url.pathname.match(/^\/visits\/([^/]+)$/);
      if (visitByIdMatch) {
        const visitId = decodeURIComponent(visitByIdMatch[1]);
        const user = await getAuthenticatedUser();

        if (request.method === "GET") {
          const response = await propertiesService.getVisitById({
            orgId: user.orgId,
            id: visitId,
          });
          return withCors(request, json(response, { status: 200 }));
        }

        if (request.method === "PATCH") {
          const payload = await parseJson(PropertyVisitPatchRequestSchema);
          const response = await propertiesService.patchVisitById({
            orgId: user.orgId,
            id: visitId,
            data: payload,
          });
          return withCors(request, json(response, { status: 200 }));
        }
      }

      if (request.method === "GET" && url.pathname === "/files") {
        const user = await getAuthenticatedUser();
        const response = await filesService.list({
          orgId: user.orgId,
          limit: parseLimit(),
          cursor: url.searchParams.get("cursor") ?? undefined,
          propertyId: url.searchParams.get("propertyId") ?? undefined,
        });
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "POST" && url.pathname === "/files/upload") {
        const user = await getAuthenticatedUser();
        const payload = await parseJson(FileUploadRequestSchema);
        const response = await filesService.upload({
          orgId: user.orgId,
          ...payload,
        });
        return withCors(request, json(response, { status: 201 }));
      }

      const fileDownloadUrlMatch = url.pathname.match(/^\/files\/([^/]+)\/download-url$/);
      if (fileDownloadUrlMatch && request.method === "GET") {
        const fileId = decodeURIComponent(fileDownloadUrlMatch[1]);
        const user = await getAuthenticatedUser();
        const response = await filesService.getDownloadUrl({
          orgId: user.orgId,
          id: fileId,
        });
        return withCors(request, json(response, { status: 200 }));
      }

      const fileRunAiMatch = url.pathname.match(/^\/files\/([^/]+)\/run-ai$/);
      if (fileRunAiMatch && request.method === "POST") {
        const fileId = decodeURIComponent(fileRunAiMatch[1]);
        const user = await getAuthenticatedUser();
        const response = await enqueueFileAiJob({
          orgId: user.orgId,
          fileId,
        });
        return withCors(request, json(response, { status: 202 }));
      }

      const fileByIdMatch = url.pathname.match(/^\/files\/([^/]+)$/);
      if (fileByIdMatch) {
        const fileId = decodeURIComponent(fileByIdMatch[1]);
        const user = await getAuthenticatedUser();

        if (request.method === "GET") {
          const response = await filesService.getById({
            orgId: user.orgId,
            id: fileId,
          });
          return withCors(request, json(response, { status: 200 }));
        }

        if (request.method === "PATCH") {
          const payload = await parseJson(FileUpdateRequestSchema);
          const response = await filesService.patchById({
            orgId: user.orgId,
            id: fileId,
            data: payload,
          });
          return withCors(request, json(response, { status: 200 }));
        }
      }

      if (request.method === "GET" && url.pathname === "/messages") {
        const user = await getAuthenticatedUser();
        const channelParam = url.searchParams.get("channel");
        const aiStatusParam = url.searchParams.get("aiStatus");

        const response = await messagesService.list({
          orgId: user.orgId,
          limit: parseLimit(),
          cursor: url.searchParams.get("cursor") ?? undefined,
          channel: channelParam
            ? (channelParam as "GMAIL" | "WHATSAPP" | "TELEGRAM")
            : undefined,
          propertyId: url.searchParams.get("propertyId") ?? undefined,
          aiStatus: aiStatusParam
            ? (aiStatusParam as "PENDING" | "PROCESSED" | "REVIEW_REQUIRED")
            : undefined,
        });

        return withCors(request, json(response, { status: 200 }));
      }

      const messageRunAiMatch = url.pathname.match(/^\/messages\/([^/]+)\/run-ai$/);
      if (messageRunAiMatch && request.method === "POST") {
        const messageId = decodeURIComponent(messageRunAiMatch[1]);
        const user = await getAuthenticatedUser();
        const response = await enqueueMessageAiJob({
          orgId: user.orgId,
          messageId,
        });
        return withCors(request, json(response, { status: 202 }));
      }

      const messageByIdMatch = url.pathname.match(/^\/messages\/([^/]+)$/);
      if (messageByIdMatch) {
        const messageId = decodeURIComponent(messageByIdMatch[1]);
        const user = await getAuthenticatedUser();

        if (request.method === "GET") {
          const response = await messagesService.getById({
            orgId: user.orgId,
            id: messageId,
          });
          return withCors(request, json(response, { status: 200 }));
        }

        if (request.method === "PATCH") {
          const payload = await parseJson(MessageUpdateRequestSchema);
          const response = await messagesService.patchById({
            orgId: user.orgId,
            id: messageId,
            propertyId: payload.propertyId,
          });
          return withCors(request, json(response, { status: 200 }));
        }
      }

      if (request.method === "POST" && url.pathname === "/vocals/upload") {
        const user = await getAuthenticatedUser();
        const payload = await parseJson(VocalUploadRequestSchema);
        const response = await vocalsService.upload({
          orgId: user.orgId,
          ...payload,
        });
        await enqueueVocalTranscriptionJob({
          orgId: user.orgId,
          vocalId: response.id,
        });
        return withCors(request, json(response, { status: 201 }));
      }

      if (request.method === "GET" && url.pathname === "/vocals") {
        const user = await getAuthenticatedUser();
        const response = await vocalsService.list({
          orgId: user.orgId,
          limit: parseLimit(),
          cursor: url.searchParams.get("cursor") ?? undefined,
        });
        return withCors(request, json(response, { status: 200 }));
      }

      const vocalTranscribeMatch = url.pathname.match(/^\/vocals\/([^/]+)\/transcribe$/);
      if (vocalTranscribeMatch && request.method === "POST") {
        const vocalId = decodeURIComponent(vocalTranscribeMatch[1]);
        const user = await getAuthenticatedUser();
        const response = await enqueueVocalTranscriptionJob({
          orgId: user.orgId,
          vocalId,
        });
        return withCors(request, json(response, { status: 202 }));
      }

      const vocalInsightsMatch = url.pathname.match(/^\/vocals\/([^/]+)\/extract-insights$/);
      if (vocalInsightsMatch && request.method === "POST") {
        const vocalId = decodeURIComponent(vocalInsightsMatch[1]);
        const user = await getAuthenticatedUser();
        const response = await enqueueVocalInsightsJob({
          orgId: user.orgId,
          vocalId,
        });
        return withCors(request, json(response, { status: 202 }));
      }

      const vocalByIdMatch = url.pathname.match(/^\/vocals\/([^/]+)$/);
      if (vocalByIdMatch) {
        const vocalId = decodeURIComponent(vocalByIdMatch[1]);
        const user = await getAuthenticatedUser();

        if (request.method === "GET") {
          const response = await vocalsService.getById({
            orgId: user.orgId,
            id: vocalId,
          });
          return withCors(request, json(response, { status: 200 }));
        }

        if (request.method === "PATCH") {
          const payload = await parseJson(VocalUpdateRequestSchema);
          const response = await vocalsService.patchById({
            orgId: user.orgId,
            id: vocalId,
            propertyId: payload.propertyId,
          });
          return withCors(request, json(response, { status: 200 }));
        }
      }

      if (request.method === "GET" && url.pathname === "/review-queue") {
        const user = await getAuthenticatedUser();
        const response = await reviewQueueService.list({
          orgId: user.orgId,
          limit: parseLimit(),
          cursor: url.searchParams.get("cursor") ?? undefined,
        });
        return withCors(request, json(response, { status: 200 }));
      }

      const reviewResolveMatch = url.pathname.match(/^\/review-queue\/([^/]+)\/resolve$/);
      if (reviewResolveMatch && request.method === "POST") {
        const reviewId = decodeURIComponent(reviewResolveMatch[1]);
        const user = await getAuthenticatedUser();
        const payload = await parseJson(ReviewQueueResolveRequestSchema);
        const response = await reviewQueueService.resolve({
          orgId: user.orgId,
          id: reviewId,
          resolution: payload.resolution,
          propertyId: payload.propertyId,
          note: payload.note,
        });
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "POST" && url.pathname === "/integrations/gmail/connect") {
        const user = await getAuthenticatedUser();
        const payload = await parseOptionalJson(IntegrationConnectRequestSchema);
        const response = await integrationsService.connect({
          orgId: user.orgId,
          provider: "GMAIL",
          code: payload.code,
          redirectUri: payload.redirectUri,
        });
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "POST" && url.pathname === "/integrations/gmail/sync") {
        const user = await getAuthenticatedUser();
        const payload = await parseOptionalJson(IntegrationSyncRequestSchema);
        const response = await integrationsService.sync({
          orgId: user.orgId,
          provider: "GMAIL",
          cursor: payload.cursor,
        });
        return withCors(request, json(response, { status: 202 }));
      }

      if (request.method === "POST" && url.pathname === "/integrations/google-calendar/connect") {
        const user = await getAuthenticatedUser();
        const payload = await parseOptionalJson(IntegrationConnectRequestSchema);
        const response = await integrationsService.connect({
          orgId: user.orgId,
          provider: "GOOGLE_CALENDAR",
          code: payload.code,
          redirectUri: payload.redirectUri,
        });
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "POST" && url.pathname === "/integrations/google-calendar/sync") {
        const user = await getAuthenticatedUser();
        const payload = await parseOptionalJson(IntegrationSyncRequestSchema);
        const response = await integrationsService.sync({
          orgId: user.orgId,
          provider: "GOOGLE_CALENDAR",
          cursor: payload.cursor,
        });
        return withCors(request, json(response, { status: 202 }));
      }

      if (request.method === "POST" && url.pathname === "/integrations/whatsapp/connect") {
        const user = await getAuthenticatedUser();
        const payload = await parseOptionalJson(IntegrationConnectRequestSchema);
        const response = await integrationsService.connect({
          orgId: user.orgId,
          provider: "WHATSAPP",
          code: payload.code,
          redirectUri: payload.redirectUri,
        });
        return withCors(request, json(response, { status: 200 }));
      }

      if (request.method === "POST" && url.pathname === "/integrations/whatsapp/sync") {
        const user = await getAuthenticatedUser();
        const payload = await parseOptionalJson(IntegrationSyncRequestSchema);
        const response = await integrationsService.sync({
          orgId: user.orgId,
          provider: "WHATSAPP",
          cursor: payload.cursor,
        });
        return withCors(request, json(response, { status: 202 }));
      }

      const propertyStatusMatch = url.pathname.match(/^\/properties\/([^/]+)\/status$/);
      if (propertyStatusMatch && request.method === "PATCH") {
        const propertyId = decodeURIComponent(propertyStatusMatch[1]);
        const user = await getAuthenticatedUser();
        const payload = await parseJson(PropertyStatusUpdateRequestSchema);
        const response = await propertiesService.updateStatus({
          orgId: user.orgId,
          id: propertyId,
          status: payload.status,
        });
        return withCors(request, json(response, { status: 200 }));
      }

      const propertyVisitsMatch = url.pathname.match(/^\/properties\/([^/]+)\/visits$/);
      if (propertyVisitsMatch) {
        const propertyId = decodeURIComponent(propertyVisitsMatch[1]);
        const user = await getAuthenticatedUser();

        if (request.method === "GET") {
          const response = await propertiesService.listVisits({
            orgId: user.orgId,
            propertyId,
          });
          return withCors(request, json(response, { status: 200 }));
        }

        if (request.method === "POST") {
          const payload = await parseJson(PropertyVisitCreateRequestSchema);
          const response = await propertiesService.addVisit({
            orgId: user.orgId,
            propertyId,
            prospectUserId: payload.prospectUserId,
            startsAt: payload.startsAt,
            endsAt: payload.endsAt,
          });
          return withCors(request, json(response, { status: 201 }));
        }
      }

      const propertyRisksMatch = url.pathname.match(/^\/properties\/([^/]+)\/risks$/);
      if (propertyRisksMatch && request.method === "GET") {
        const propertyId = decodeURIComponent(propertyRisksMatch[1]);
        const user = await getAuthenticatedUser();
        const response = await propertiesService.getRisks({
          orgId: user.orgId,
          propertyId,
        });
        return withCors(request, json(response, { status: 200 }));
      }

      const propertyComparablesMatch = url.pathname.match(/^\/properties\/([^/]+)\/comparables$/);
      if (propertyComparablesMatch && request.method === "GET") {
        const propertyId = decodeURIComponent(propertyComparablesMatch[1]);
        const user = await getAuthenticatedUser();
        const response = await propertiesService.getComparables({
          orgId: user.orgId,
          propertyId,
          propertyType: parseComparablePropertyTypeParam(),
          forceRefresh: parseBooleanQueryParam("forceRefresh"),
        });
        return withCors(request, json(response, { status: 200 }));
      }

      const propertyValuationAIMatch = url.pathname.match(/^\/properties\/([^/]+)\/valuation-ai$/);
      if (propertyValuationAIMatch && request.method === "POST") {
        const propertyId = decodeURIComponent(propertyValuationAIMatch[1]);
        const user = await getAuthenticatedUser();
        const payload = await parseOptionalJson(PropertyValuationAIRequestSchema);
        const response = await propertiesService.runValuationAIAnalysis({
          orgId: user.orgId,
          propertyId,
          data: payload,
        });
        return withCors(request, json(response, { status: 200 }));
      }

      const propertyValuationAIPromptMatch = url.pathname.match(
        /^\/properties\/([^/]+)\/valuation-ai\/prompt$/,
      );
      if (propertyValuationAIPromptMatch && request.method === "POST") {
        const propertyId = decodeURIComponent(propertyValuationAIPromptMatch[1]);
        const user = await getAuthenticatedUser();
        const payload = await parseOptionalJson(PropertyValuationAIRequestSchema);
        const response = await propertiesService.generateValuationAIPrompt({
          orgId: user.orgId,
          propertyId,
          data: payload,
        });
        return withCors(
          request,
          json(PropertyValuationAIPromptResponseSchema.parse(response), { status: 200 }),
        );
      }

      const propertyByIdMatch = url.pathname.match(/^\/properties\/([^/]+)$/);
      if (propertyByIdMatch) {
        const propertyId = decodeURIComponent(propertyByIdMatch[1]);
        const user = await getAuthenticatedUser();

        if (request.method === "GET") {
          const response = await propertiesService.getById({
            orgId: user.orgId,
            id: propertyId,
          });
          return withCors(request, json(response, { status: 200 }));
        }

        if (request.method === "PATCH") {
          const payload = await parseJson(PropertyPatchRequestSchema);
          const response = await propertiesService.patchById({
            orgId: user.orgId,
            id: propertyId,
            data: payload,
          });
          return withCors(request, json(response, { status: 200 }));
        }
      }

      const userByIdMatch = url.pathname.match(/^\/users\/([^/]+)$/);
      if (userByIdMatch) {
        const userId = decodeURIComponent(userByIdMatch[1]);
        const user = await getAuthenticatedUser();

        if (request.method === "GET") {
          const response = await usersService.getById({
            orgId: user.orgId,
            id: userId,
          });
          return withCors(request, json(response, { status: 200 }));
        }

        if (request.method === "PATCH") {
          const payload = await parseJson(UserPatchRequestSchema);
          const response = await usersService.patchById({
            orgId: user.orgId,
            id: userId,
            data: payload,
          });
          return withCors(request, json(response, { status: 200 }));
        }
      }

      if (request.method === "GET" && url.pathname === "/openapi.yaml") {
        const specFile = Bun.file(openapiPath);

        if (!(await specFile.exists())) {
          throw new HttpError(
            500,
            "OPENAPI_NOT_FOUND",
            "Spec OpenAPI introuvable",
            { openapiPath },
          );
        }

        return withCors(request, new Response(specFile, {
          status: 200,
          headers: {
            "content-type": "application/yaml; charset=utf-8",
          },
        }));
      }

      if (request.method === "GET" && url.pathname === "/docs") {
        return withCors(request, new Response(getSwaggerHtml(), {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        }));
      }

      return withCors(request, error(404, "NOT_FOUND", "Route introuvable"));
    } catch (caughtError) {
      const { status, payload } = toApiError(caughtError);
      return withCors(request, json(payload, { status }));
    }
  },
});
