import { beforeAll, describe, expect, it } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { DEMO_AUTH_EMAIL, DEMO_AUTH_PASSWORD } from "../src/auth/constants";
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runSeed } from "../src/db/seed";
import {
  calendarEvents,
  files,
  integrations,
  messageFileLinks,
  messages,
} from "../src/db/schema";
import { createApp } from "../src/server";

const loginAndGetAccessToken = async (): Promise<string> => {
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

  const payload = await response.json();
  return payload.accessToken as string;
};

describe("integrations endpoints", () => {
  beforeAll(async () => {
    runMigrations();
    await runSeed();
  });

  it("connecte Gmail, synchronise en incrémental idempotent et lie les attachments", async () => {
    const token = await loginAndGetAccessToken();

    const connectResponse = await createApp().fetch(
      new Request("http://localhost/integrations/gmail/connect", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: "gmail_test_code" }),
      }),
    );
    expect(connectResponse.status).toBe(200);

    const integration = await db.query.integrations.findFirst({
      where: and(eq(integrations.orgId, "org_demo"), eq(integrations.provider, "GMAIL")),
    });
    expect(integration).toBeDefined();
    expect(integration?.accessTokenEnc).toBeString();
    expect(integration?.accessTokenEnc?.includes("gmail_access")).toBeFalse();

    const syncResponse = await createApp().fetch(
      new Request("http://localhost/integrations/gmail/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ cursor: "0" }),
      }),
    );
    expect(syncResponse.status).toBe(202);

    const messageCountBefore = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(
        sql`${messages.orgId} = 'org_demo' and ${messages.sourceProvider} = 'GMAIL' and ${messages.externalId} in ('gmail_msg_1', 'gmail_msg_2')`,
      );
    const fileCountBefore = await db
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(
        sql`${files.orgId} = 'org_demo' and ${files.sourceProvider} = 'GMAIL' and ${files.externalId} in ('gmail_att_1', 'gmail_att_2', 'gmail_att_3')`,
      );

    const syncAgainResponse = await createApp().fetch(
      new Request("http://localhost/integrations/gmail/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ cursor: "0" }),
      }),
    );
    expect(syncAgainResponse.status).toBe(202);

    const messageCountAfter = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(
        sql`${messages.orgId} = 'org_demo' and ${messages.sourceProvider} = 'GMAIL' and ${messages.externalId} in ('gmail_msg_1', 'gmail_msg_2')`,
      );
    const fileCountAfter = await db
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(
        sql`${files.orgId} = 'org_demo' and ${files.sourceProvider} = 'GMAIL' and ${files.externalId} in ('gmail_att_1', 'gmail_att_2', 'gmail_att_3')`,
      );

    expect(messageCountAfter[0].count).toBe(messageCountBefore[0].count);
    expect(fileCountAfter[0].count).toBe(fileCountBefore[0].count);

    const linkedAttachment = await db.query.messageFileLinks.findFirst({
      where: eq(messageFileLinks.orgId, "org_demo"),
    });
    expect(linkedAttachment).toBeDefined();
  });

  it("connecte/synchronise Google Calendar et WhatsApp", async () => {
    const token = await loginAndGetAccessToken();

    const calendarConnect = await createApp().fetch(
      new Request("http://localhost/integrations/google-calendar/connect", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: "calendar_test_code" }),
      }),
    );
    expect(calendarConnect.status).toBe(200);

    const calendarSync = await createApp().fetch(
      new Request("http://localhost/integrations/google-calendar/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      }),
    );
    expect(calendarSync.status).toBe(202);

    const syncedEvent = await db.query.calendarEvents.findFirst({
      where: and(eq(calendarEvents.orgId, "org_demo"), eq(calendarEvents.provider, "GOOGLE_CALENDAR")),
    });
    expect(syncedEvent).toBeDefined();

    const whatsappConnect = await createApp().fetch(
      new Request("http://localhost/integrations/whatsapp/connect", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: "wa_test_code" }),
      }),
    );
    expect(whatsappConnect.status).toBe(200);

    const whatsappSync = await createApp().fetch(
      new Request("http://localhost/integrations/whatsapp/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      }),
    );
    expect(whatsappSync.status).toBe(202);

    const waMessage = await db.query.messages.findFirst({
      where: and(eq(messages.orgId, "org_demo"), eq(messages.channel, "WHATSAPP")),
    });
    expect(waMessage).toBeDefined();
  });
});
