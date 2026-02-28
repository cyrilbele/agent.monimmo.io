import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../db/client";
import { files, messages, properties, reviewQueueItems, vocals } from "../db/schema";
import { HttpError } from "../http/errors";

type ReviewQueueItemRow = typeof reviewQueueItems.$inferSelect;

type ReviewQueueItemType = "MESSAGE" | "FILE" | "VOCAL";
type ReviewQueueItemStatus = "OPEN" | "RESOLVED";

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

const safeParsePayload = (payload: string | null): Record<string, unknown> | null => {
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const toReviewQueueItemResponse = (item: ReviewQueueItemRow) => ({
  id: item.id,
  itemType: item.itemType as ReviewQueueItemType,
  itemId: item.itemId,
  reason: item.reason,
  status: item.status as ReviewQueueItemStatus,
  payload: safeParsePayload(item.payload),
  createdAt: item.createdAt.toISOString(),
  resolvedAt: item.resolvedAt?.toISOString() ?? null,
});

const assertPropertyScope = async (orgId: string, propertyId: string): Promise<void> => {
  const property = await db.query.properties.findFirst({
    where: and(eq(properties.id, propertyId), eq(properties.orgId, orgId)),
  });

  if (!property) {
    throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
  }
};

const resolveLinkedEntity = async (input: {
  orgId: string;
  itemType: ReviewQueueItemType;
  itemId: string;
  propertyId?: string | null;
}) => {
  if (!input.propertyId) {
    return;
  }

  await assertPropertyScope(input.orgId, input.propertyId);

  if (input.itemType === "MESSAGE") {
    await db
      .update(messages)
      .set({
        propertyId: input.propertyId,
        aiStatus: "PROCESSED",
        updatedAt: new Date(),
      })
      .where(and(eq(messages.id, input.itemId), eq(messages.orgId, input.orgId)));
    return;
  }

  if (input.itemType === "FILE") {
    await db
      .update(files)
      .set({
        propertyId: input.propertyId,
        updatedAt: new Date(),
      })
      .where(and(eq(files.id, input.itemId), eq(files.orgId, input.orgId)));
    return;
  }

  await db
    .update(vocals)
    .set({
      propertyId: input.propertyId,
      updatedAt: new Date(),
    })
    .where(and(eq(vocals.id, input.itemId), eq(vocals.orgId, input.orgId)));
};

export const reviewQueueService = {
  async list(input: {
    orgId: string;
    limit: number;
    cursor?: string;
  }) {
    const cursorValue = parseCursor(input.cursor);

    const whereClause = cursorValue
      ? and(
          eq(reviewQueueItems.orgId, input.orgId),
          lt(reviewQueueItems.createdAt, new Date(cursorValue)),
        )
      : eq(reviewQueueItems.orgId, input.orgId);

    const rows = await db
      .select()
      .from(reviewQueueItems)
      .where(whereClause)
      .orderBy(desc(reviewQueueItems.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const sliced = hasMore ? rows.slice(0, input.limit) : rows;
    const lastItem = sliced.at(-1);

    return {
      items: sliced.map(toReviewQueueItemResponse),
      nextCursor: hasMore && lastItem ? String(lastItem.createdAt.getTime()) : null,
    };
  },

  async createOpenItem(input: {
    orgId: string;
    itemType: ReviewQueueItemType;
    itemId: string;
    reason: string;
    payload?: Record<string, unknown>;
  }) {
    const existingOpen = await db.query.reviewQueueItems.findFirst({
      where: and(
        eq(reviewQueueItems.orgId, input.orgId),
        eq(reviewQueueItems.itemType, input.itemType),
        eq(reviewQueueItems.itemId, input.itemId),
        eq(reviewQueueItems.reason, input.reason),
        eq(reviewQueueItems.status, "OPEN"),
      ),
    });

    if (existingOpen) {
      return toReviewQueueItemResponse(existingOpen);
    }

    const now = new Date();
    const id = crypto.randomUUID();

    await db.insert(reviewQueueItems).values({
      id,
      orgId: input.orgId,
      itemType: input.itemType,
      itemId: input.itemId,
      reason: input.reason,
      status: "OPEN",
      payload: input.payload ? JSON.stringify(input.payload) : null,
      resolution: null,
      note: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    });

    const created = await db.query.reviewQueueItems.findFirst({
      where: and(eq(reviewQueueItems.id, id), eq(reviewQueueItems.orgId, input.orgId)),
    });

    if (!created) {
      throw new HttpError(500, "REVIEW_QUEUE_CREATE_FAILED", "Impossible de créer l'item review");
    }

    return toReviewQueueItemResponse(created);
  },

  async resolve(input: {
    orgId: string;
    id: string;
    resolution: string;
    propertyId?: string | null;
    note?: string | null;
  }) {
    const existing = await db.query.reviewQueueItems.findFirst({
      where: and(eq(reviewQueueItems.id, input.id), eq(reviewQueueItems.orgId, input.orgId)),
    });

    if (!existing) {
      throw new HttpError(404, "REVIEW_QUEUE_NOT_FOUND", "Élément review introuvable");
    }

    await resolveLinkedEntity({
      orgId: input.orgId,
      itemType: existing.itemType as ReviewQueueItemType,
      itemId: existing.itemId,
      propertyId: input.propertyId ?? null,
    });

    const now = new Date();
    await db
      .update(reviewQueueItems)
      .set({
        status: "RESOLVED",
        resolution: input.resolution,
        note: input.note ?? null,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(and(eq(reviewQueueItems.id, input.id), eq(reviewQueueItems.orgId, input.orgId)));

    const resolved = await db.query.reviewQueueItems.findFirst({
      where: and(eq(reviewQueueItems.id, input.id), eq(reviewQueueItems.orgId, input.orgId)),
    });

    if (!resolved) {
      throw new HttpError(500, "REVIEW_QUEUE_RESOLVE_FAILED", "Impossible de résoudre l'item");
    }

    return toReviewQueueItemResponse(resolved);
  },
};
