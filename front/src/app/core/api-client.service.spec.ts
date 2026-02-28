import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCESS_TOKEN_STORAGE_KEY } from "./constants";
import { ApiClientService } from "./api-client.service";

describe("ApiClientService", () => {
  beforeEach(() => {
    localStorage.clear();
    (window as Window & { MONIMMO_API_BASE_URL?: string }).MONIMMO_API_BASE_URL =
      "https://api.example.test///";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete (window as Window & { MONIMMO_API_BASE_URL?: string }).MONIMMO_API_BASE_URL;
    vi.restoreAllMocks();
  });

  it("refuse les appels authentifiés sans token", async () => {
    const service = new ApiClientService();

    await expect(service.request("GET", "/health")).rejects.toThrow(
      "Session expirée. Veuillez vous reconnecter.",
    );
  });

  it("compose l'URL avec params filtrés et ajoute le header Authorization", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "token_demo");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
      );

    const service = new ApiClientService();
    const payload = await service.request<{ ok: boolean }>("GET", "items", {
      params: {
        q: "paris",
        limit: 20,
        forceRefresh: true,
        ignoredNull: null,
        ignoredUndefined: undefined,
        ignoredEmpty: "",
      },
    });

    expect(payload.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.test/items?q=paris&limit=20&forceRefresh=true");
    expect(options.method).toBe("GET");

    const headers = new Headers(options.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer token_demo");
  });

  it("encode un body JSON quand ce n'est pas un FormData", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "token_demo");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "1" }), { status: 200 }));

    const service = new ApiClientService();
    await service.request<{ id: string }>("POST", "/users", {
      body: { firstName: "Alice" },
    });

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);

    expect(headers.get("content-type")).toBe("application/json");
    expect(options.body).toBe(JSON.stringify({ firstName: "Alice" }));
  });

  it("n'ajoute pas content-type pour FormData", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "token_demo");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "1" }), { status: 200 }));

    const body = new FormData();
    body.append("file", new Blob(["hello"], { type: "text/plain" }), "test.txt");

    const service = new ApiClientService();
    await service.request<{ id: string }>("POST", "/files/upload", {
      body,
    });

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);

    expect(headers.get("content-type")).toBeNull();
    expect(options.body).toBe(body);
  });

  it("retourne undefined sur 204", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "token_demo");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    const service = new ApiClientService();
    const payload = await service.request<void>("POST", "/auth/logout", {
      body: { refreshToken: "a" },
    });

    expect(payload).toBeUndefined();
  });

  it("remonte le message d'erreur API quand disponible", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "token_demo");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Boom explicite" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );

    const service = new ApiClientService();

    await expect(service.request("GET", "/boom")).rejects.toThrow("Boom explicite");
  });

  it("retombe sur le message HTTP générique si la réponse erreur n'est pas JSON", async () => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, "token_demo");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("erreur serveur", {
        status: 500,
        headers: { "content-type": "text/plain" },
      }),
    );

    const service = new ApiClientService();

    await expect(service.request("GET", "/boom")).rejects.toThrow("Requête impossible (500).");
  });

  it("permet de désactiver auth via options.auth=false", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const service = new ApiClientService();
    const payload = await service.request<{ ok: boolean }>("GET", "/public", {
      auth: false,
    });

    expect(payload.ok).toBe(true);

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(headers.get("authorization")).toBeNull();
  });
});
