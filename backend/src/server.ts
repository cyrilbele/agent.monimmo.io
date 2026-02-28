import { z } from "zod";
import { authService } from "./auth/service";
import {
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
  PropertyParticipantCreateRequestSchema,
  PropertyProspectCreateRequestSchema,
  PropertyVisitCreateRequestSchema,
  PropertyStatusUpdateRequestSchema,
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
import { filesService } from "./files/service";
import { integrationsService } from "./integrations/service";
import { messagesService } from "./messages/service";
import { propertiesService } from "./properties/service";
import { MARKET_PROPERTY_TYPES, type MarketPropertyType } from "./properties/dvf-client";
import {
  enqueueFileAiJob,
  enqueueMessageAiJob,
  enqueueVocalInsightsJob,
  enqueueVocalTranscriptionJob,
} from "./queues";
import { reviewQueueService } from "./review-queue/service";
import { getStorageProvider } from "./storage";
import { usersService } from "./users/service";
import { vocalsService } from "./vocals/service";

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
  headers.set("access-control-allow-methods", "GET,POST,PATCH,OPTIONS");
  headers.set(
    "access-control-allow-headers",
    request.headers.get("access-control-request-headers") ??
      "authorization,content-type",
  );
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "Origin");
  return headers;
};

const withCors = (request: Request, response: Response): Response => {
  const corsHeaders = buildCorsHeaders(request);
  if (!corsHeaders) {
    return response;
  }

  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders.entries()) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const createApp = (options?: { openapiPath?: string }) => ({
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return withCors(request, new Response(null, { status: 204 }));
    }

    try {
      const url = new URL(request.url);
      const openapiPath = options?.openapiPath ?? "openapi/openapi.yaml";

      const parseJson = async <T extends z.ZodTypeAny>(schema: T): Promise<z.infer<T>> => {
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
        if (!expiresAtRaw) {
          throw new HttpError(400, "INVALID_STORAGE_URL", "URL de téléchargement invalide");
        }

        const expiresAt = new Date(expiresAtRaw);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
          throw new HttpError(403, "STORAGE_URL_EXPIRED", "URL de téléchargement expirée");
        }

        const key = decodeURIComponent(storageMatch[1]);
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
        const payload = await parseJson(ForgotPasswordRequestSchema);
        await authService.forgotPassword(payload);
        return withCors(request, new Response(null, { status: 202 }));
      }

      if (request.method === "POST" && url.pathname === "/auth/reset-password") {
        const payload = await parseJson(ResetPasswordRequestSchema);
        await authService.resetPassword(payload);
        return withCors(request, new Response(null, { status: 204 }));
      }

      if (request.method === "GET" && url.pathname === "/me") {
        const accessToken = getBearerToken();
        const response = await authService.me(accessToken);
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

      const propertyParticipantsMatch = url.pathname.match(
        /^\/properties\/([^/]+)\/participants$/,
      );
      if (propertyParticipantsMatch && request.method === "POST") {
        const propertyId = decodeURIComponent(propertyParticipantsMatch[1]);
        const user = await getAuthenticatedUser();
        const payload = await parseJson(PropertyParticipantCreateRequestSchema);
        const response = await propertiesService.addParticipant({
          orgId: user.orgId,
          propertyId,
          contactId: payload.contactId,
          role: payload.role,
        });
        return withCors(request, json(response, { status: 201 }));
      }

      const propertyProspectsMatch = url.pathname.match(/^\/properties\/([^/]+)\/prospects$/);
      if (propertyProspectsMatch) {
        const propertyId = decodeURIComponent(propertyProspectsMatch[1]);
        const user = await getAuthenticatedUser();

        if (request.method === "GET") {
          const response = await propertiesService.listProspects({
            orgId: user.orgId,
            propertyId,
          });
          return withCors(request, json(response, { status: 200 }));
        }

        if (request.method === "POST") {
          const payload = await parseJson(PropertyProspectCreateRequestSchema);
          const response = await propertiesService.addProspect({
            orgId: user.orgId,
            propertyId,
            userId: payload.userId,
            newClient: payload.newClient,
          });
          return withCors(request, json(response, { status: 201 }));
        }
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
