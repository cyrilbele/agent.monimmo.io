import { describe, expect, it } from "bun:test";
import { createApp } from "../src/server";

describe("server", () => {
  it("retourne 200 sur GET /health", async () => {
    const response = await createApp().fetch(
      new Request("http://localhost/health", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("gère le preflight CORS depuis le front local", async () => {
    const response = await createApp().fetch(
      new Request("http://localhost/auth/register", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "content-type",
    );
  });

  it("ajoute les headers CORS sur une requête standard avec origin", async () => {
    const response = await createApp().fetch(
      new Request("http://localhost/health", {
        method: "GET",
        headers: {
          origin: "http://localhost:5173",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
  });

  it("retourne un format d'erreur standardisé sur une route inconnue", async () => {
    const response = await createApp().fetch(
      new Request("http://localhost/inconnue", { method: "GET" }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      code: "NOT_FOUND",
      message: "Route introuvable",
    });
  });

  it("rejette un payload JSON trop volumineux", async () => {
    const response = await createApp().fetch(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(26 * 1024 * 1024),
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      code: "PAYLOAD_TOO_LARGE",
      message: "Payload trop volumineux",
    });
  });

  it("expose la spec OpenAPI sur /openapi.yaml", async () => {
    const response = await createApp().fetch(
      new Request("http://localhost/openapi.yaml", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/yaml");
    expect(await response.text()).toContain("openapi: 3.0.3");
  });

  it("expose une page swagger ui sur /docs", async () => {
    const response = await createApp().fetch(
      new Request("http://localhost/docs", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("SwaggerUIBundle");
  });

  it("retourne une erreur normalisée si la spec OpenAPI manque", async () => {
    const response = await createApp({
      openapiPath: "openapi/introuvable.yaml",
    }).fetch(new Request("http://localhost/openapi.yaml", { method: "GET" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: "OPENAPI_NOT_FOUND",
      message: "Spec OpenAPI introuvable",
      details: {
        openapiPath: "openapi/introuvable.yaml",
      },
    });
  });
});
