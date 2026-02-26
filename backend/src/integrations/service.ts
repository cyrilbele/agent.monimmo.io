import { and, eq } from "drizzle-orm";
import {
  getCalendarConnector,
  getGmailConnector,
  getWhatsAppConnector,
  type IntegrationProvider,
} from "./connectors";
import { decryptToken, encryptToken } from "./crypto";
import { db } from "../db/client";
import { calendarEvents, integrations } from "../db/schema";
import { filesService } from "../files/service";
import { HttpError } from "../http/errors";
import { messagesService } from "../messages/service";
import { enqueueFileAiJob, enqueueMessageAiJob } from "../queues";

type IntegrationRow = typeof integrations.$inferSelect;

const toIntegrationResponse = (row: IntegrationRow, status?: "CONNECTED" | "SYNC_QUEUED") => ({
  provider: row.provider as IntegrationProvider,
  status: status ?? (row.status as "CONNECTED" | "SYNC_QUEUED"),
  connectedAt: row.connectedAt?.toISOString() ?? null,
  lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
});

const getIntegration = async (
  orgId: string,
  provider: IntegrationProvider,
): Promise<IntegrationRow | null> => {
  const row = await db.query.integrations.findFirst({
    where: and(eq(integrations.orgId, orgId), eq(integrations.provider, provider)),
  });
  return row ?? null;
};

const requireConnectedIntegration = async (
  orgId: string,
  provider: IntegrationProvider,
): Promise<IntegrationRow> => {
  const integration = await getIntegration(orgId, provider);
  if (!integration || !integration.accessTokenEnc) {
    throw new HttpError(
      400,
      "INTEGRATION_NOT_CONNECTED",
      `Intégration ${provider} non connectée`,
    );
  }

  return integration;
};

const upsertConnectedIntegration = async (input: {
  orgId: string;
  provider: IntegrationProvider;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}) => {
  const now = new Date();
  const existing = await getIntegration(input.orgId, input.provider);
  const encryptedAccessToken = encryptToken(input.accessToken);
  const encryptedRefreshToken = encryptToken(input.refreshToken);

  if (existing) {
    await db
      .update(integrations)
      .set({
        status: "CONNECTED",
        accessTokenEnc: encryptedAccessToken,
        refreshTokenEnc: encryptedRefreshToken,
        tokenExpiryAt: input.expiresAt,
        connectedAt: now,
        updatedAt: now,
      })
      .where(and(eq(integrations.orgId, input.orgId), eq(integrations.provider, input.provider)));

    const updated = await getIntegration(input.orgId, input.provider);
    if (!updated) {
      throw new HttpError(
        500,
        "INTEGRATION_CONNECT_FAILED",
        "Impossible de finaliser la connexion",
      );
    }

    return updated;
  }

  const id = crypto.randomUUID();
  await db.insert(integrations).values({
    id,
    orgId: input.orgId,
    provider: input.provider,
    status: "CONNECTED",
    accessTokenEnc: encryptedAccessToken,
    refreshTokenEnc: encryptedRefreshToken,
    tokenExpiryAt: input.expiresAt,
    connectedAt: now,
    lastSyncedAt: null,
    cursor: null,
    createdAt: now,
    updatedAt: now,
  });

  const created = await getIntegration(input.orgId, input.provider);
  if (!created) {
    throw new HttpError(500, "INTEGRATION_CONNECT_FAILED", "Impossible de créer l'intégration");
  }

  return created;
};

const updateSyncState = async (input: {
  orgId: string;
  provider: IntegrationProvider;
  cursor: string | null;
}) => {
  const now = new Date();
  await db
    .update(integrations)
    .set({
      status: "CONNECTED",
      cursor: input.cursor,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .where(and(eq(integrations.orgId, input.orgId), eq(integrations.provider, input.provider)));

  const updated = await getIntegration(input.orgId, input.provider);
  if (!updated) {
    throw new HttpError(500, "INTEGRATION_SYNC_FAILED", "État d'intégration introuvable");
  }

  return updated;
};

const syncGmail = async (input: {
  orgId: string;
  cursor?: string;
}) => {
  const integration = await requireConnectedIntegration(input.orgId, "GMAIL");
  const connector = getGmailConnector();
  const accessToken = decryptToken(integration.accessTokenEnc!);

  const { messages, nextCursor } = await connector.syncMessages({
    cursor: input.cursor ?? integration.cursor ?? undefined,
    accessToken,
  });

  for (const item of messages) {
    const message = await messagesService.upsertImportedMessage({
      orgId: input.orgId,
      channel: "GMAIL",
      sourceProvider: "GMAIL",
      externalId: item.externalId,
      subject: item.subject ?? null,
      body: item.body,
      receivedAt: item.receivedAt,
    });

    await enqueueMessageAiJob({ orgId: input.orgId, messageId: message.id });

    for (const attachment of item.attachments) {
      const file = await filesService.upsertImportedFile({
        orgId: input.orgId,
        sourceProvider: "GMAIL",
        externalId: attachment.externalId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        size: attachment.size,
      });

      await messagesService.linkFile({
        orgId: input.orgId,
        messageId: message.id,
        fileId: file.id,
      });
      await enqueueFileAiJob({ orgId: input.orgId, fileId: file.id });
    }
  }

  const updated = await updateSyncState({
    orgId: input.orgId,
    provider: "GMAIL",
    cursor: nextCursor,
  });

  return toIntegrationResponse(updated, "SYNC_QUEUED");
};

const syncCalendar = async (input: {
  orgId: string;
  cursor?: string;
}) => {
  const integration = await requireConnectedIntegration(input.orgId, "GOOGLE_CALENDAR");
  const connector = getCalendarConnector();
  const accessToken = decryptToken(integration.accessTokenEnc!);

  const { events, nextCursor } = await connector.syncEvents({
    cursor: input.cursor ?? integration.cursor ?? undefined,
    accessToken,
  });

  for (const event of events) {
    const existing = await db.query.calendarEvents.findFirst({
      where: and(
        eq(calendarEvents.orgId, input.orgId),
        eq(calendarEvents.provider, "GOOGLE_CALENDAR"),
        eq(calendarEvents.externalId, event.externalId),
      ),
    });

    const now = new Date();
    if (existing) {
      await db
        .update(calendarEvents)
        .set({
          title: event.title,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          payload: event.payload ? JSON.stringify(event.payload) : null,
          updatedAt: now,
        })
        .where(eq(calendarEvents.id, existing.id));
      continue;
    }

    await db.insert(calendarEvents).values({
      id: crypto.randomUUID(),
      orgId: input.orgId,
      provider: "GOOGLE_CALENDAR",
      externalId: event.externalId,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      payload: event.payload ? JSON.stringify(event.payload) : null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const updated = await updateSyncState({
    orgId: input.orgId,
    provider: "GOOGLE_CALENDAR",
    cursor: nextCursor,
  });

  return toIntegrationResponse(updated, "SYNC_QUEUED");
};

const syncWhatsApp = async (input: {
  orgId: string;
  cursor?: string;
}) => {
  const integration = await requireConnectedIntegration(input.orgId, "WHATSAPP");
  const connector = getWhatsAppConnector();
  const accessToken = decryptToken(integration.accessTokenEnc!);

  const { messages, nextCursor } = await connector.syncMessages({
    cursor: input.cursor ?? integration.cursor ?? undefined,
    accessToken,
  });

  for (const item of messages) {
    const message = await messagesService.upsertImportedMessage({
      orgId: input.orgId,
      channel: "WHATSAPP",
      sourceProvider: "WHATSAPP",
      externalId: item.externalId,
      body: item.body,
      receivedAt: item.receivedAt,
    });

    await enqueueMessageAiJob({ orgId: input.orgId, messageId: message.id });

    for (const attachment of item.attachments) {
      const file = await filesService.upsertImportedFile({
        orgId: input.orgId,
        sourceProvider: "WHATSAPP",
        externalId: attachment.externalId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        size: attachment.size,
      });

      await messagesService.linkFile({
        orgId: input.orgId,
        messageId: message.id,
        fileId: file.id,
      });
      await enqueueFileAiJob({ orgId: input.orgId, fileId: file.id });
    }
  }

  const updated = await updateSyncState({
    orgId: input.orgId,
    provider: "WHATSAPP",
    cursor: nextCursor,
  });

  return toIntegrationResponse(updated, "SYNC_QUEUED");
};

export const integrationsService = {
  async connect(input: {
    orgId: string;
    provider: IntegrationProvider;
    code?: string;
    redirectUri?: string;
  }) {
    const code = input.code ?? `demo_${Date.now()}`;
    const connectInput = {
      code,
      redirectUri: input.redirectUri,
    };

    if (input.provider === "GMAIL") {
      const tokens = await getGmailConnector().exchangeCodeForTokens(connectInput);
      const integration = await upsertConnectedIntegration({
        orgId: input.orgId,
        provider: "GMAIL",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      });
      return toIntegrationResponse(integration, "CONNECTED");
    }

    if (input.provider === "GOOGLE_CALENDAR") {
      const tokens = await getCalendarConnector().exchangeCodeForTokens(connectInput);
      const integration = await upsertConnectedIntegration({
        orgId: input.orgId,
        provider: "GOOGLE_CALENDAR",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      });
      return toIntegrationResponse(integration, "CONNECTED");
    }

    const tokens = await getWhatsAppConnector().exchangeCodeForTokens(connectInput);
    const integration = await upsertConnectedIntegration({
      orgId: input.orgId,
      provider: "WHATSAPP",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });
    return toIntegrationResponse(integration, "CONNECTED");
  },

  async sync(input: {
    orgId: string;
    provider: IntegrationProvider;
    cursor?: string;
  }) {
    if (input.provider === "GMAIL") {
      return syncGmail(input);
    }

    if (input.provider === "GOOGLE_CALENDAR") {
      return syncCalendar(input);
    }

    return syncWhatsApp(input);
  },
};
