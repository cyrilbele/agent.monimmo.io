import { z } from "zod";
import { authService } from "./auth/service";
import {
  LoginRequestSchema,
  LogoutRequestSchema,
  RefreshRequestSchema,
} from "./dto/zod";
import { HttpError, toApiError } from "./http/errors";

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

      const getBearerToken = (): string => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          throw new HttpError(401, "UNAUTHORIZED", "Token d'accès manquant");
        }

        return authHeader.slice("Bearer ".length).trim();
      };

      if (request.method === "GET" && url.pathname === "/health") {
        return json({ status: "ok" }, { status: 200 });
      }

      if (request.method === "POST" && url.pathname === "/auth/login") {
        const payload = await parseJson(LoginRequestSchema);
        const response = await authService.login(payload);
        return json(response, { status: 200 });
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

      if (request.method === "GET" && url.pathname === "/me") {
        const accessToken = getBearerToken();
        const response = await authService.me(accessToken);
        return json(response, { status: 200 });
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
