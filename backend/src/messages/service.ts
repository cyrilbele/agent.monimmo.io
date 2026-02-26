import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../db/client";
import { messageFileLinks, messages, properties } from "../db/schema";
import { HttpError } from "../http/errors";

type MessageRow = typeof messages.$inferSelect;

const parseCursor = (cursor?: string): number | undefined => {
  if (!cursor) {
    return undefined;
  }

  const numericCursor = Number(cursor);
  if (Number.isNaN(numericCursor) || numericCursor <= 0) {
    throw new HttpError(400, "INVALID_CURSOR", "Cursor invalide");
  }

  return numericCursor;
};

const getFileIdsByMessageId = async (
  orgId: string,
  messageId: string,
): Promise<string[]> => {
  const links = await db
    .select({
      fileId: messageFileLinks.fileId,
    })
    .from(messageFileLinks)
    .where(
      and(eq(messageFileLinks.orgId, orgId), eq(messageFileLinks.messageId, messageId)),
    );

  return links.map((link) => link.fileId);
};

const toMessageResponse = async (row: MessageRow) => ({
  id: row.id,
  channel: row.channel as "GMAIL" | "WHATSAPP" | "TELEGRAM",
  propertyId: row.propertyId,
  subject: row.subject,
  body: row.body,
  fileIds: await getFileIdsByMessageId(row.orgId, row.id),
  aiStatus: row.aiStatus as "PENDING" | "PROCESSED" | "REVIEW_REQUIRED",
  receivedAt: row.receivedAt.toISOString(),
});

const assertPropertyScope = async (orgId: string, propertyId?: string | null) => {
  if (!propertyId) {
    return;
  }

  const property = await db.query.properties.findFirst({
    where: and(eq(properties.id, propertyId), eq(properties.orgId, orgId)),
  });

  if (!property) {
    throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
  }
};

export const messagesService = {
  async list(input: {
    orgId: string;
    limit: number;
    cursor?: string;
    channel?: "GMAIL" | "WHATSAPP" | "TELEGRAM";
    propertyId?: string;
    aiStatus?: "PENDING" | "PROCESSED" | "REVIEW_REQUIRED";
  }) {
    const cursorValue = parseCursor(input.cursor);
    const clauses = [eq(messages.orgId, input.orgId)];

    if (cursorValue) {
      clauses.push(lt(messages.receivedAt, new Date(cursorValue)));
    }

    if (input.channel) {
      clauses.push(eq(messages.channel, input.channel));
    }

    if (input.propertyId) {
      clauses.push(eq(messages.propertyId, input.propertyId));
    }

    if (input.aiStatus) {
      clauses.push(eq(messages.aiStatus, input.aiStatus));
    }

    const rows = await db
      .select()
      .from(messages)
      .where(and(...clauses))
      .orderBy(desc(messages.receivedAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const sliced = hasMore ? rows.slice(0, input.limit) : rows;
    const lastItem = sliced.at(-1);

    const items = await Promise.all(sliced.map((row) => toMessageResponse(row)));

    return {
      items,
      nextCursor: hasMore && lastItem ? String(lastItem.receivedAt.getTime()) : null,
    };
  },

  async getById(input: { orgId: string; id: string }) {
    const message = await db.query.messages.findFirst({
      where: and(eq(messages.id, input.id), eq(messages.orgId, input.orgId)),
    });

    if (!message) {
      throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message introuvable");
    }

    return toMessageResponse(message);
  },

  async patchById(input: { orgId: string; id: string; propertyId: string }) {
    const existing = await db.query.messages.findFirst({
      where: and(eq(messages.id, input.id), eq(messages.orgId, input.orgId)),
    });

    if (!existing) {
      throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message introuvable");
    }

    await assertPropertyScope(input.orgId, input.propertyId);

    await db
      .update(messages)
      .set({
        propertyId: input.propertyId,
        aiStatus: "PROCESSED",
        updatedAt: new Date(),
      })
      .where(and(eq(messages.id, input.id), eq(messages.orgId, input.orgId)));

    const updated = await db.query.messages.findFirst({
      where: and(eq(messages.id, input.id), eq(messages.orgId, input.orgId)),
    });

    if (!updated) {
      throw new HttpError(500, "MESSAGE_PATCH_FAILED", "Mise à jour du message impossible");
    }

    return toMessageResponse(updated);
  },

  async setAiStatus(input: {
    orgId: string;
    id: string;
    aiStatus: "PENDING" | "PROCESSED" | "REVIEW_REQUIRED";
    propertyId?: string | null;
  }) {
    const existing = await db.query.messages.findFirst({
      where: and(eq(messages.id, input.id), eq(messages.orgId, input.orgId)),
    });

    if (!existing) {
      throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message introuvable");
    }

    if (input.propertyId !== undefined) {
      await assertPropertyScope(input.orgId, input.propertyId);
    }

    await db
      .update(messages)
      .set({
        aiStatus: input.aiStatus,
        propertyId: input.propertyId === undefined ? existing.propertyId : input.propertyId,
        updatedAt: new Date(),
      })
      .where(and(eq(messages.id, input.id), eq(messages.orgId, input.orgId)));
  },

  async upsertImportedMessage(input: {
    orgId: string;
    channel: "GMAIL" | "WHATSAPP" | "TELEGRAM";
    sourceProvider: "GMAIL" | "WHATSAPP" | "GOOGLE_CALENDAR";
    externalId: string;
    subject?: string | null;
    body: string;
    receivedAt: Date;
  }): Promise<{ id: string; created: boolean }> {
    const existing = await db.query.messages.findFirst({
      where: and(
        eq(messages.orgId, input.orgId),
        eq(messages.channel, input.channel),
        eq(messages.externalId, input.externalId),
      ),
    });

    const now = new Date();
    if (existing) {
      await db
        .update(messages)
        .set({
          subject: input.subject ?? null,
          body: input.body,
          receivedAt: input.receivedAt,
          updatedAt: now,
        })
        .where(and(eq(messages.id, existing.id), eq(messages.orgId, input.orgId)));

      return { id: existing.id, created: false };
    }

    const id = crypto.randomUUID();
    await db.insert(messages).values({
      id,
      orgId: input.orgId,
      propertyId: null,
      channel: input.channel,
      sourceProvider: input.sourceProvider,
      externalId: input.externalId,
      subject: input.subject ?? null,
      body: input.body,
      aiStatus: "PENDING",
      receivedAt: input.receivedAt,
      createdAt: now,
      updatedAt: now,
    });

    return { id, created: true };
  },

  async linkFile(input: { orgId: string; messageId: string; fileId: string }) {
    const existing = await db.query.messageFileLinks.findFirst({
      where: and(
        eq(messageFileLinks.orgId, input.orgId),
        eq(messageFileLinks.messageId, input.messageId),
        eq(messageFileLinks.fileId, input.fileId),
      ),
    });

    if (existing) {
      return;
    }

    await db.insert(messageFileLinks).values({
      id: crypto.randomUUID(),
      orgId: input.orgId,
      messageId: input.messageId,
      fileId: input.fileId,
      createdAt: new Date(),
    });
  },
};
