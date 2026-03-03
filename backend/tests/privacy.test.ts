import { beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import { properties, users } from "../src/db/schema";
import { createApp } from "../src/server";

const password = "MonimmoPwd123!";

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const registerAccount = async (email: string): Promise<{
  orgId: string;
  userId: string;
}> => {
  const response = await createApp().fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        firstName: "Privacy",
        lastName: "Manager",
      }),
    }),
  );
  expect(response.status).toBe(201);
  const payload = await response.json();

  return {
    orgId: payload.user.orgId as string,
    userId: payload.user.id as string,
  };
};

const login = async (email: string): Promise<string> => {
  const response = await createApp().fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password,
      }),
    }),
  );
  expect(response.status).toBe(200);
  const payload = await response.json();
  return payload.accessToken as string;
};

const registerManagerAndGetToken = async (email: string): Promise<{
  orgId: string;
  token: string;
}> => {
  const account = await registerAccount(email);
  await db
    .update(users)
    .set({
      role: "MANAGER",
    })
    .where(eq(users.id, account.userId));

  const token = await login(email);
  return {
    orgId: account.orgId,
    token,
  };
};

describe("privacy endpoints", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("lance un export RGPD asynchrone et retourne son statut", async () => {
    const email = `privacy.export.${crypto.randomUUID()}@monimmo.fr`;
    const manager = await registerManagerAndGetToken(email);

    const startResponse = await createApp().fetch(
      new Request("http://localhost/privacy/exports", {
        method: "POST",
        headers: {
          authorization: `Bearer ${manager.token}`,
        },
      }),
    );

    expect(startResponse.status).toBe(202);
    const startPayload = await startResponse.json();
    expect(typeof startPayload.id).toBe("string");

    let statusPayload = startPayload as {
      id: string;
      status: string;
      data?: { orgId?: string };
    };

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const statusResponse = await createApp().fetch(
        new Request(`http://localhost/privacy/exports/${encodeURIComponent(startPayload.id)}`, {
          method: "GET",
          headers: {
            authorization: `Bearer ${manager.token}`,
          },
        }),
      );
      expect(statusResponse.status).toBe(200);
      statusPayload = await statusResponse.json();
      if (statusPayload.status === "COMPLETED" || statusPayload.status === "FAILED") {
        break;
      }
      await sleep(25);
    }

    expect(statusPayload.status).toBe("COMPLETED");
    expect(statusPayload.data?.orgId).toBe(manager.orgId);
  });

  it("refuse les endpoints privacy pour un role AGENT", async () => {
    const email = `privacy.agent.${crypto.randomUUID()}@monimmo.fr`;
    await registerAccount(email);
    const token = await login(email);

    const response = await createApp().fetch(
      new Request("http://localhost/privacy/exports", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("FORBIDDEN_ROLE");
  });

  it("lance un effacement RGPD asynchrone", async () => {
    const email = `privacy.erase.${crypto.randomUUID()}@monimmo.fr`;
    const manager = await registerManagerAndGetToken(email);

    await db.insert(properties).values({
      id: crypto.randomUUID(),
      orgId: manager.orgId,
      title: "Bien à effacer",
      city: "Paris",
      postalCode: "75001",
      address: "1 rue RGPD",
      status: "PROSPECTION",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const eraseResponse = await createApp().fetch(
      new Request("http://localhost/privacy/erase", {
        method: "POST",
        headers: {
          authorization: `Bearer ${manager.token}`,
        },
      }),
    );

    expect(eraseResponse.status).toBe(202);
    const erasePayload = await eraseResponse.json();
    expect(erasePayload.status).toBe("PENDING");

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const remainingUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.orgId, manager.orgId));
      if (remainingUsers.length === 0) {
        break;
      }
      await sleep(25);
    }

    const remainingUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.orgId, manager.orgId));
    const remainingProperties = await db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.orgId, manager.orgId));

    expect(remainingUsers.length).toBe(0);
    expect(remainingProperties.length).toBe(0);
  });
});
