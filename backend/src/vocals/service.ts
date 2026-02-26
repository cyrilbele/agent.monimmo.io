import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../db/client";
import { files, properties, vocals } from "../db/schema";
import { filesService } from "../files/service";
import { HttpError } from "../http/errors";

type VocalRow = typeof vocals.$inferSelect;

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

const parseInsights = (raw: string | null): Record<string, unknown> | null => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const toVocalResponse = (row: VocalRow) => ({
  id: row.id,
  propertyId: row.propertyId,
  fileId: row.fileId,
  status: row.status as "UPLOADED" | "TRANSCRIBED" | "INSIGHTS_READY" | "REVIEW_REQUIRED",
  transcript: row.transcript,
  summary: row.summary,
  insights: parseInsights(row.insights),
  confidence: row.confidence,
  createdAt: row.createdAt.toISOString(),
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

export const vocalsService = {
  async upload(input: {
    orgId: string;
    propertyId?: string | null;
    fileName: string;
    mimeType: string;
    size: number;
  }) {
    await assertPropertyScope(input.orgId, input.propertyId);

    const file = await filesService.upload({
      orgId: input.orgId,
      propertyId: input.propertyId ?? null,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.size,
    });

    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(vocals).values({
      id,
      orgId: input.orgId,
      propertyId: input.propertyId ?? null,
      fileId: file.id,
      status: "UPLOADED",
      transcript: null,
      summary: null,
      insights: null,
      confidence: null,
      createdAt: now,
      updatedAt: now,
    });

    const created = await db.query.vocals.findFirst({
      where: and(eq(vocals.id, id), eq(vocals.orgId, input.orgId)),
    });

    if (!created) {
      throw new HttpError(500, "VOCAL_UPLOAD_FAILED", "Upload vocal impossible");
    }

    return toVocalResponse(created);
  },

  async list(input: { orgId: string; limit: number; cursor?: string }) {
    const cursorValue = parseCursor(input.cursor);
    const whereClause = cursorValue
      ? and(eq(vocals.orgId, input.orgId), lt(vocals.createdAt, new Date(cursorValue)))
      : eq(vocals.orgId, input.orgId);

    const rows = await db
      .select()
      .from(vocals)
      .where(whereClause)
      .orderBy(desc(vocals.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const sliced = hasMore ? rows.slice(0, input.limit) : rows;
    const lastItem = sliced.at(-1);

    return {
      items: sliced.map(toVocalResponse),
      nextCursor: hasMore && lastItem ? String(lastItem.createdAt.getTime()) : null,
    };
  },

  async getById(input: { orgId: string; id: string }) {
    const vocal = await db.query.vocals.findFirst({
      where: and(eq(vocals.id, input.id), eq(vocals.orgId, input.orgId)),
    });

    if (!vocal) {
      throw new HttpError(404, "VOCAL_NOT_FOUND", "Vocal introuvable");
    }

    return toVocalResponse(vocal);
  },

  async patchById(input: {
    orgId: string;
    id: string;
    propertyId: string;
  }) {
    await assertPropertyScope(input.orgId, input.propertyId);

    const existing = await db.query.vocals.findFirst({
      where: and(eq(vocals.id, input.id), eq(vocals.orgId, input.orgId)),
    });

    if (!existing) {
      throw new HttpError(404, "VOCAL_NOT_FOUND", "Vocal introuvable");
    }

    await db
      .update(vocals)
      .set({
        propertyId: input.propertyId,
        updatedAt: new Date(),
      })
      .where(and(eq(vocals.id, input.id), eq(vocals.orgId, input.orgId)));

    const updated = await db.query.vocals.findFirst({
      where: and(eq(vocals.id, input.id), eq(vocals.orgId, input.orgId)),
    });

    if (!updated) {
      throw new HttpError(500, "VOCAL_PATCH_FAILED", "Mise à jour vocal impossible");
    }

    return toVocalResponse(updated);
  },

  async setTranscription(input: {
    orgId: string;
    id: string;
    transcript: string | null;
    summary: string | null;
    confidence: number | null;
    status: "TRANSCRIBED" | "REVIEW_REQUIRED";
    propertyId?: string | null;
  }) {
    const existing = await db.query.vocals.findFirst({
      where: and(eq(vocals.id, input.id), eq(vocals.orgId, input.orgId)),
    });

    if (!existing) {
      throw new HttpError(404, "VOCAL_NOT_FOUND", "Vocal introuvable");
    }

    if (input.propertyId !== undefined) {
      await assertPropertyScope(input.orgId, input.propertyId);
    }

    await db
      .update(vocals)
      .set({
        transcript: input.transcript,
        summary: input.summary,
        confidence: input.confidence,
        status: input.status,
        propertyId: input.propertyId === undefined ? existing.propertyId : input.propertyId,
        updatedAt: new Date(),
      })
      .where(and(eq(vocals.id, input.id), eq(vocals.orgId, input.orgId)));
  },

  async setInsights(input: {
    orgId: string;
    id: string;
    insights: Record<string, unknown>;
    status: "INSIGHTS_READY" | "REVIEW_REQUIRED";
  }) {
    const existing = await db.query.vocals.findFirst({
      where: and(eq(vocals.id, input.id), eq(vocals.orgId, input.orgId)),
    });

    if (!existing) {
      throw new HttpError(404, "VOCAL_NOT_FOUND", "Vocal introuvable");
    }

    await db
      .update(vocals)
      .set({
        insights: JSON.stringify(input.insights),
        status: input.status,
        updatedAt: new Date(),
      })
      .where(and(eq(vocals.id, input.id), eq(vocals.orgId, input.orgId)));
  },

  async getByIdForProcessing(input: { orgId: string; id: string }) {
    const vocal = await db.query.vocals.findFirst({
      where: and(eq(vocals.id, input.id), eq(vocals.orgId, input.orgId)),
    });

    if (!vocal) {
      throw new HttpError(404, "VOCAL_NOT_FOUND", "Vocal introuvable");
    }

    const file = await db.query.files.findFirst({
      where: and(eq(files.id, vocal.fileId), eq(files.orgId, input.orgId)),
    });

    if (!file) {
      throw new HttpError(404, "FILE_NOT_FOUND", "Fichier vocal introuvable");
    }

    return {
      id: vocal.id,
      orgId: vocal.orgId,
      propertyId: vocal.propertyId,
      fileId: vocal.fileId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      transcript: vocal.transcript,
      summary: vocal.summary,
      confidence: vocal.confidence,
      status: vocal.status as "UPLOADED" | "TRANSCRIBED" | "INSIGHTS_READY" | "REVIEW_REQUIRED",
    };
  },
};
