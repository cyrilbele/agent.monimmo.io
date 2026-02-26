type ErrorResponse = {
  code: string;
  message: string;
  details?: unknown;
};

const json = (data: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  });

const notFound = (): Response => {
  const body: ErrorResponse = {
    code: "NOT_FOUND",
    message: "Route introuvable",
  };

  return json(body, { status: 404 });
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

export const createApp = (options?: { openapiPath?: string }) => ({
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const openapiPath = options?.openapiPath ?? "openapi/openapi.yaml";

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ status: "ok" }, { status: 200 });
    }

    if (request.method === "GET" && url.pathname === "/openapi.yaml") {
      const specFile = Bun.file(openapiPath);

      if (!(await specFile.exists())) {
        return json(
          {
            code: "OPENAPI_NOT_FOUND",
            message: "Spec OpenAPI introuvable",
          },
          { status: 500 },
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

    return notFound();
  },
});
