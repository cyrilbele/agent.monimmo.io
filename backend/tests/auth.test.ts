import { beforeAll, describe, expect, it } from "bun:test";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { passwordResetStore } from "../src/auth/password-reset-store";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { createApp } from "../src/server";

describe("auth endpoints", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("authentifie un utilisateur et renvoie access+refresh", async () => {
    const response = await createApp().fetch(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: DEMO_AUTH_EMAIL,
          password: DEMO_AUTH_PASSWORD,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(typeof payload.accessToken).toBe("string");
    expect(typeof payload.refreshToken).toBe("string");
    expect(payload.user.email).toBe(DEMO_AUTH_EMAIL);
  });

  it("renvoie 401 si les identifiants sont invalides", async () => {
    const response = await createApp().fetch(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: DEMO_AUTH_EMAIL,
          password: "mauvais-pass",
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: "INVALID_CREDENTIALS",
      message: "Identifiants invalides",
    });
  });

  it("rafraîchit un token valide", async () => {
    const loginResponse = await createApp().fetch(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: DEMO_AUTH_EMAIL,
          password: DEMO_AUTH_PASSWORD,
        }),
      }),
    );
    const loginPayload = await loginResponse.json();

    const refreshResponse = await createApp().fetch(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: loginPayload.refreshToken }),
      }),
    );

    expect(refreshResponse.status).toBe(200);
    const refreshPayload = await refreshResponse.json();
    expect(typeof refreshPayload.accessToken).toBe("string");
    expect(typeof refreshPayload.refreshToken).toBe("string");
  });

  it("renvoie /me pour un access token valide", async () => {
    const loginResponse = await createApp().fetch(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: DEMO_AUTH_EMAIL,
          password: DEMO_AUTH_PASSWORD,
        }),
      }),
    );
    const loginPayload = await loginResponse.json();

    const meResponse = await createApp().fetch(
      new Request("http://localhost/me", {
        method: "GET",
        headers: {
          authorization: `Bearer ${loginPayload.accessToken}`,
        },
      }),
    );

    expect(meResponse.status).toBe(200);
    const mePayload = await meResponse.json();
    expect(mePayload.user.email).toBe(DEMO_AUTH_EMAIL);
  });

  it("invalide le refresh token après logout", async () => {
    const loginResponse = await createApp().fetch(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: DEMO_AUTH_EMAIL,
          password: DEMO_AUTH_PASSWORD,
        }),
      }),
    );
    const loginPayload = await loginResponse.json();

    const logoutResponse = await createApp().fetch(
      new Request("http://localhost/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: loginPayload.refreshToken }),
      }),
    );

    expect(logoutResponse.status).toBe(204);

    const refreshResponse = await createApp().fetch(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: loginPayload.refreshToken }),
      }),
    );

    expect(refreshResponse.status).toBe(401);
    expect(await refreshResponse.json()).toEqual({
      code: "INVALID_REFRESH_TOKEN",
      message: "Refresh token invalide",
    });
  });

  it("crée un compte avec /auth/register", async () => {
    const email = `nouvel.agent.${crypto.randomUUID()}@monimmo.fr`;
    const password = "MonimmoPwd123!";

    const response = await createApp().fetch(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          firstName: "Nina",
          lastName: "Durand",
          orgId: "org_register_test",
        }),
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.user.email).toBe(email);
    expect(typeof payload.accessToken).toBe("string");
  });

  it("gère forgot-password + reset-password", async () => {
    const forgotResponse = await createApp().fetch(
      new Request("http://localhost/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: DEMO_AUTH_EMAIL }),
      }),
    );

    expect(forgotResponse.status).toBe(202);
    const token = passwordResetStore.peekTokenForEmail(DEMO_AUTH_EMAIL);
    expect(typeof token).toBe("string");

    const newPassword = "NouveauPass123!";
    const resetResponse = await createApp().fetch(
      new Request("http://localhost/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword,
        }),
      }),
    );

    expect(resetResponse.status).toBe(204);

    const loginResponse = await createApp().fetch(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: DEMO_AUTH_EMAIL,
          password: newPassword,
        }),
      }),
    );

    expect(loginResponse.status).toBe(200);

  });
});
