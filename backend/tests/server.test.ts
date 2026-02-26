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
});
