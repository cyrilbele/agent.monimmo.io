import { beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { passwordResetStore } from "../src/auth/password-reset-store";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { organizations, users } from "../src/db/schema";
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

  it("lit et met à jour les paramètres applicatifs via /me/settings", async () => {
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

    const getInitialResponse = await createApp().fetch(
      new Request("http://localhost/me/settings", {
        method: "GET",
        headers: {
          authorization: `Bearer ${loginPayload.accessToken}`,
        },
      }),
    );

    expect(getInitialResponse.status).toBe(200);
    const initialSettings = await getInitialResponse.json();
    expect(typeof initialSettings.notaryFeePct).toBe("number");
    expect(Number.isFinite(initialSettings.notaryFeePct)).toBe(true);
    expect(typeof initialSettings.valuationAiOutputFormat).toBe("string");
    expect(initialSettings.valuationAiOutputFormat.trim().length).toBeGreaterThan(0);

    const updateResponse = await createApp().fetch(
      new Request("http://localhost/me/settings", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${loginPayload.accessToken}`,
        },
        body: JSON.stringify({
          notaryFeePct: 7.35,
          valuationAiOutputFormat: "## Format custom agent\n\n- Bloc A\n- Bloc B",
        }),
      }),
    );

    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toEqual({
      notaryFeePct: 7.35,
      valuationAiOutputFormat: "## Format custom agent\n\n- Bloc A\n- Bloc B",
    });

    const getUpdatedResponse = await createApp().fetch(
      new Request("http://localhost/me/settings", {
        method: "GET",
        headers: {
          authorization: `Bearer ${loginPayload.accessToken}`,
        },
      }),
    );

    expect(getUpdatedResponse.status).toBe(200);
    expect(await getUpdatedResponse.json()).toEqual({
      notaryFeePct: 7.35,
      valuationAiOutputFormat: "## Format custom agent\n\n- Bloc A\n- Bloc B",
    });

    const resetFormatResponse = await createApp().fetch(
      new Request("http://localhost/me/settings", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${loginPayload.accessToken}`,
        },
        body: JSON.stringify({
          valuationAiOutputFormat: null,
        }),
      }),
    );

    expect(resetFormatResponse.status).toBe(200);
    const resetFormatPayload = await resetFormatResponse.json();
    expect(resetFormatPayload.notaryFeePct).toBe(7.35);
    expect(resetFormatPayload.valuationAiOutputFormat).toContain("## 1️⃣ Synthèse exécutive");

    const getResetFormatResponse = await createApp().fetch(
      new Request("http://localhost/me/settings", {
        method: "GET",
        headers: {
          authorization: `Bearer ${loginPayload.accessToken}`,
        },
      }),
    );

    expect(getResetFormatResponse.status).toBe(200);
    const resetSettings = await getResetFormatResponse.json();
    expect(resetSettings.notaryFeePct).toBe(7.35);
    expect(resetSettings.valuationAiOutputFormat).toContain("## 1️⃣ Synthèse exécutive");
    expect(resetSettings.valuationAiOutputFormat).toContain(
      "Fourchette de commercialisation conseillée",
    );
  });

  it("refuse /me/settings PATCH sans champ modifié", async () => {
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

    const updateResponse = await createApp().fetch(
      new Request("http://localhost/me/settings", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${loginPayload.accessToken}`,
        },
        body: JSON.stringify({}),
      }),
    );

    expect(updateResponse.status).toBe(400);
    const payload = await updateResponse.json();
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.message).toBe("Payload invalide");
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
        }),
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.user.email).toBe(email);
    expect(payload.user.orgId).toMatch(/^org_[\w-]{36}$/);
    expect(typeof payload.accessToken).toBe("string");

    const createdOrg = await db.query.organizations.findFirst({
      where: eq(organizations.id, payload.user.orgId),
    });
    expect(createdOrg?.id).toBe(payload.user.orgId);
  });

  it("gère forgot-password + reset-password", async () => {
    const initialLoginResponse = await createApp().fetch(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: DEMO_AUTH_EMAIL,
          password: DEMO_AUTH_PASSWORD,
        }),
      }),
    );
    expect(initialLoginResponse.status).toBe(200);
    const initialLoginPayload = await initialLoginResponse.json();

    const forgotResponse = await createApp().fetch(
      new Request("http://localhost/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: DEMO_AUTH_EMAIL }),
      }),
    );

    expect(forgotResponse.status).toBe(202);
    const firstToken = passwordResetStore.peekTokenForEmail(DEMO_AUTH_EMAIL);
    expect(typeof firstToken).toBe("string");

    const secondForgotResponse = await createApp().fetch(
      new Request("http://localhost/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: DEMO_AUTH_EMAIL }),
      }),
    );
    expect(secondForgotResponse.status).toBe(202);

    const token = passwordResetStore.peekTokenForEmail(DEMO_AUTH_EMAIL);
    expect(typeof token).toBe("string");
    expect(token).not.toBe(firstToken);

    const invalidatedTokenResetResponse = await createApp().fetch(
      new Request("http://localhost/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: firstToken,
          newPassword: "PassIgnoré123!",
        }),
      }),
    );

    expect(invalidatedTokenResetResponse.status).toBe(400);
    expect(await invalidatedTokenResetResponse.json()).toEqual({
      code: "INVALID_RESET_TOKEN",
      message: "Token de réinitialisation invalide",
    });

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

    const refreshAfterResetResponse = await createApp().fetch(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          refreshToken: initialLoginPayload.refreshToken,
        }),
      }),
    );

    expect(refreshAfterResetResponse.status).toBe(401);
    expect(await refreshAfterResetResponse.json()).toEqual({
      code: "INVALID_REFRESH_TOKEN",
      message: "Refresh token invalide",
    });

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

    await createApp().fetch(
      new Request("http://localhost/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: DEMO_AUTH_EMAIL }),
      }),
    );

    const rollbackToken = passwordResetStore.peekTokenForEmail(DEMO_AUTH_EMAIL);
    expect(typeof rollbackToken).toBe("string");

    const rollbackResponse = await createApp().fetch(
      new Request("http://localhost/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: rollbackToken,
          newPassword: DEMO_AUTH_PASSWORD,
        }),
      }),
    );

    expect(rollbackResponse.status).toBe(204);
  });

  it("bloque /me si le rôle n'est pas autorisé", async () => {
    const orgId = `org_role_${crypto.randomUUID()}`;
    const userId = `user_role_${crypto.randomUUID()}`;
    const email = `role.bloque.${crypto.randomUUID()}@monimmo.fr`;
    const password = "RoleBlocked123!";

    await db.insert(organizations).values({
      id: orgId,
      name: "Org Role Test",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(users).values({
      id: userId,
      orgId,
      email,
      firstName: "Role",
      lastName: "Blocked",
      role: "VIEWER",
      passwordHash: await Bun.password.hash(password),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const loginResponse = await createApp().fetch(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
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

    expect(meResponse.status).toBe(403);
    expect(await meResponse.json()).toEqual({
      code: "FORBIDDEN_ROLE",
      message: "Rôle non autorisé",
      details: {
        role: "VIEWER",
        allowedRoles: ["AGENT", "MANAGER", "ADMIN"],
      },
    });
  });

  it("bloque /me si l'orgId du token ne correspond plus", async () => {
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

    const movedOrgId = `org_scope_${crypto.randomUUID()}`;
    await db.insert(organizations).values({
      id: movedOrgId,
      name: "Org Scope Changed",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db
      .update(users)
      .set({
        orgId: movedOrgId,
        updatedAt: new Date(),
      })
      .where(eq(users.email, DEMO_AUTH_EMAIL));

    const meResponse = await createApp().fetch(
      new Request("http://localhost/me", {
        method: "GET",
        headers: {
          authorization: `Bearer ${loginPayload.accessToken}`,
        },
      }),
    );

    expect(meResponse.status).toBe(403);
    expect(await meResponse.json()).toEqual({
      code: "ORG_SCOPE_MISMATCH",
      message: "Le token ne correspond pas à l'organisation de l'utilisateur",
      details: {
        tokenOrgId: "org_demo",
        userOrgId: movedOrgId,
      },
    });

    await db
      .update(users)
      .set({
        orgId: "org_demo",
        updatedAt: new Date(),
      })
      .where(eq(users.email, DEMO_AUTH_EMAIL));
  });
});
