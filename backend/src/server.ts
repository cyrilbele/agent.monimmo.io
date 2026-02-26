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
  PropertyStatusUpdateRequestSchema,
  ReviewQueueResolveRequestSchema,
  RegisterRequestSchema,
  RefreshRequestSchema,
  ResetPasswordRequestSchema,
  VocalUpdateRequestSchema,
  VocalUploadRequestSchema,
} from "./dto/zod";
import { HttpError, toApiError } from "./http/errors";
import { filesService } from "./files/service";
import { integrationsService } from "./integrations/service";
import { messagesService } from "./messages/service";
import { propertiesService } from "./properties/service";
import {
  enqueueFileAiJob,
  enqueueMessageAiJob,
  enqueueVocalInsightsJob,
  enqueueVocalTranscriptionJob,
} from "./queues";
import { reviewQueueService } from "./review-queue/service";
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

export const createApp = (options?: { openapiPath?: string }) => ({
  async fetch(request: Request): Promise<Response> {
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

      if (request.method === "GET" && url.pathname === "/health") {
        return json({ status: "ok" }, { status: 200 });
      }

      if (request.method === "POST" && url.pathname === "/auth/login") {
        const payload = await parseJson(LoginRequestSchema);
        const response = await authService.login(payload);
        return json(response, { status: 200 });
      }

      if (request.method === "POST" && url.pathname === "/auth/register") {
        const payload = await parseJson(RegisterRequestSchema);
        const response = await authService.register(payload);
        return json(response, { status: 201 });
      }

      if (request.method === "POST" && url.pathname === "/auth/refresh") {
        const payload = await parseJson(RefreshRequestSchema);
        const response = await authService.refresh(payload);
        return json(response, { status: 200 });
      }

      if (request.method === "POST" && url.pathname === "/auth/logout") {
        const payload = await parseJson(LogoutRequestSchema);
        await authService.logout(payload);
        return new Response(null, { status: 204 });
      }

      if (request.method === "POST" && url.pathname === "/auth/forgot-password") {
        const payload = await parseJson(ForgotPasswordRequestSchema);
        await authService.forgotPassword(payload);
        return new Response(null, { status: 202 });
      }

      if (request.method === "POST" && url.pathname === "/auth/reset-password") {
        const payload = await parseJson(ResetPasswordRequestSchema);
        await authService.resetPassword(payload);
        return new Response(null, { status: 204 });
      }

      if (request.method === "GET" && url.pathname === "/me") {
        const accessToken = getBearerToken();
        const response = await authService.me(accessToken);
        return json(response, { status: 200 });
      }

      if (request.method === "GET" && url.pathname === "/properties") {
        const user = await getAuthenticatedUser();
        const response = await propertiesService.list({
          orgId: user.orgId,
          limit: parseLimit(),
          cursor: url.searchParams.get("cursor") ?? undefined,
        });
        return json(response, { status: 200 });
      }

      if (request.method === "POST" && url.pathname === "/properties") {
        const user = await getAuthenticatedUser();
        const payload = await parseJson(PropertyCreateRequestSchema);
        const response = await propertiesService.create({
          orgId: user.orgId,
          ...payload,
        });
        return json(response, { status: 201 });
      }

      if (request.method === "POST" && url.pathname === "/files/upload") {
        const user = await getAuthenticatedUser();
        const payload = await parseJson(FileUploadRequestSchema);
        const response = await filesService.upload({
          orgId: user.orgId,
          ...payload,
        });
        return json(response, { status: 201 });
      }

      const fileDownloadUrlMatch = url.pathname.match(/^\/files\/([^/]+)\/download-url$/);
      if (fileDownloadUrlMatch && request.method === "GET") {
        const fileId = decodeURIComponent(fileDownloadUrlMatch[1]);
        const user = await getAuthenticatedUser();
        const response = await filesService.getDownloadUrl({
          orgId: user.orgId,
          id: fileId,
        });
        return json(response, { status: 200 });
      }

      const fileRunAiMatch = url.pathname.match(/^\/files\/([^/]+)\/run-ai$/);
      if (fileRunAiMatch && request.method === "POST") {
        const fileId = decodeURIComponent(fileRunAiMatch[1]);
        const user = await getAuthenticatedUser();
        const response = await enqueueFileAiJob({
          orgId: user.orgId,
          fileId,
        });
        return json(response, { status: 202 });
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
          return json(response, { status: 200 });
        }

        if (request.method === "PATCH") {
          const payload = await parseJson(FileUpdateRequestSchema);
          const response = await filesService.patchById({
            orgId: user.orgId,
            id: fileId,
            data: payload,
          });
          return json(response, { status: 200 });
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

        return json(response, { status: 200 });
      }

      const messageRunAiMatch = url.pathname.match(/^\/messages\/([^/]+)\/run-ai$/);
      if (messageRunAiMatch && request.method === "POST") {
        const messageId = decodeURIComponent(messageRunAiMatch[1]);
        const user = await getAuthenticatedUser();
        const response = await enqueueMessageAiJob({
          orgId: user.orgId,
          messageId,
        });
        return json(response, { status: 202 });
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
          return json(response, { status: 200 });
        }

        if (request.method === "PATCH") {
          const payload = await parseJson(MessageUpdateRequestSchema);
          const response = await messagesService.patchById({
            orgId: user.orgId,
            id: messageId,
            propertyId: payload.propertyId,
          });
          return json(response, { status: 200 });
        }
      }

      if (request.method === "POST" && url.pathname === "/vocals/upload") {
        const user = await getAuthenticatedUser();
        const payload = await parseJson(VocalUploadRequestSchema);
        const response = await vocalsService.upload({
          orgId: user.orgId,
          ...payload,
        });
        return json(response, { status: 201 });
      }

      if (request.method === "GET" && url.pathname === "/vocals") {
        const user = await getAuthenticatedUser();
        const response = await vocalsService.list({
          orgId: user.orgId,
          limit: parseLimit(),
          cursor: url.searchParams.get("cursor") ?? undefined,
        });
        return json(response, { status: 200 });
      }

      const vocalTranscribeMatch = url.pathname.match(/^\/vocals\/([^/]+)\/transcribe$/);
      if (vocalTranscribeMatch && request.method === "POST") {
        const vocalId = decodeURIComponent(vocalTranscribeMatch[1]);
        const user = await getAuthenticatedUser();
        const response = await enqueueVocalTranscriptionJob({
          orgId: user.orgId,
          vocalId,
        });
        return json(response, { status: 202 });
      }

      const vocalInsightsMatch = url.pathname.match(/^\/vocals\/([^/]+)\/extract-insights$/);
      if (vocalInsightsMatch && request.method === "POST") {
        const vocalId = decodeURIComponent(vocalInsightsMatch[1]);
        const user = await getAuthenticatedUser();
        const response = await enqueueVocalInsightsJob({
          orgId: user.orgId,
          vocalId,
        });
        return json(response, { status: 202 });
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
          return json(response, { status: 200 });
        }

        if (request.method === "PATCH") {
          const payload = await parseJson(VocalUpdateRequestSchema);
          const response = await vocalsService.patchById({
            orgId: user.orgId,
            id: vocalId,
            propertyId: payload.propertyId,
          });
          return json(response, { status: 200 });
        }
      }

      if (request.method === "GET" && url.pathname === "/review-queue") {
        const user = await getAuthenticatedUser();
        const response = await reviewQueueService.list({
          orgId: user.orgId,
          limit: parseLimit(),
          cursor: url.searchParams.get("cursor") ?? undefined,
        });
        return json(response, { status: 200 });
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
        return json(response, { status: 200 });
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
        return json(response, { status: 200 });
      }

      if (request.method === "POST" && url.pathname === "/integrations/gmail/sync") {
        const user = await getAuthenticatedUser();
        const payload = await parseOptionalJson(IntegrationSyncRequestSchema);
        const response = await integrationsService.sync({
          orgId: user.orgId,
          provider: "GMAIL",
          cursor: payload.cursor,
        });
        return json(response, { status: 202 });
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
        return json(response, { status: 200 });
      }

      if (request.method === "POST" && url.pathname === "/integrations/google-calendar/sync") {
        const user = await getAuthenticatedUser();
        const payload = await parseOptionalJson(IntegrationSyncRequestSchema);
        const response = await integrationsService.sync({
          orgId: user.orgId,
          provider: "GOOGLE_CALENDAR",
          cursor: payload.cursor,
        });
        return json(response, { status: 202 });
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
        return json(response, { status: 200 });
      }

      if (request.method === "POST" && url.pathname === "/integrations/whatsapp/sync") {
        const user = await getAuthenticatedUser();
        const payload = await parseOptionalJson(IntegrationSyncRequestSchema);
        const response = await integrationsService.sync({
          orgId: user.orgId,
          provider: "WHATSAPP",
          cursor: payload.cursor,
        });
        return json(response, { status: 202 });
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
        return json(response, { status: 200 });
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
        return json(response, { status: 201 });
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
          return json(response, { status: 200 });
        }

        if (request.method === "PATCH") {
          const payload = await parseJson(PropertyPatchRequestSchema);
          const response = await propertiesService.patchById({
            orgId: user.orgId,
            id: propertyId,
            data: payload,
          });
          return json(response, { status: 200 });
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

        return new Response(specFile, {
          status: 200,
          headers: {
            "content-type": "application/yaml; charset=utf-8",
          },
        });
      }

      if (request.method === "GET" && url.pathname === "/docs") {
        return new Response(getSwaggerHtml(), {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        });
      }

      return error(404, "NOT_FOUND", "Route introuvable");
    } catch (caughtError) {
      const { status, payload } = toApiError(caughtError);
      return json(payload, { status });
    }
  },
});
