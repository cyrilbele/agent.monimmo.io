import { and, desc, eq, gte, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "../db/client";
import { files, properties, vocals } from "../db/schema";
import { filesService } from "../files/service";
import { HttpError } from "../http/errors";

type VocalRow = typeof vocals.$inferSelect;
export type VocalType =
  | "VISITE_INITIALE"
  | "VISITE_SUIVI"
  | "COMPTE_RENDU_VISITE_CLIENT"
  | "ERREUR_TRAITEMENT";
export type VocalStatus =
  | "UPLOADED"
  | "TRANSCRIBED"
  | "INSIGHTS_READY"
  | "REVIEW_REQUIRED";
export type VocalRecoveryStep = "TRANSCRIBE" | "DETECT_TYPE";

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
  status: row.status as VocalStatus,
  vocalType: row.vocalType as VocalType | null,
  processingError: row.processingError,
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
    contentBase64?: string;
  }) {
    await assertPropertyScope(input.orgId, input.propertyId);

    const file = await filesService.upload({
      orgId: input.orgId,
      propertyId: input.propertyId ?? null,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.size,
      contentBase64: input.contentBase64,
    });

    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(vocals).values({
      id,
      orgId: input.orgId,
      propertyId: input.propertyId ?? null,
      fileId: file.id,
      status: "UPLOADED",
      vocalType: null,
      processingError: null,
      processingAttempts: 0,
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
    status: Extract<VocalStatus, "TRANSCRIBED" | "REVIEW_REQUIRED">;
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
        processingError: null,
        processingAttempts: 0,
        updatedAt: new Date(),
      })
      .where(and(eq(vocals.id, input.id), eq(vocals.orgId, input.orgId)));
  },

  async setVocalType(input: {
    orgId: string;
    id: string;
    vocalType: VocalType | null;
    status?: VocalStatus;
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
        status: input.status ?? existing.status,
        vocalType: input.vocalType,
        processingError: null,
        processingAttempts: 0,
        updatedAt: new Date(),
      })
      .where(and(eq(vocals.id, input.id), eq(vocals.orgId, input.orgId)));
  },

  async setInsights(input: {
    orgId: string;
    id: string;
    insights: Record<string, unknown>;
    status: Extract<VocalStatus, "INSIGHTS_READY" | "REVIEW_REQUIRED">;
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
        processingError: null,
        processingAttempts: 0,
        updatedAt: new Date(),
      })
      .where(and(eq(vocals.id, input.id), eq(vocals.orgId, input.orgId)));
  },

  async markProcessingFailure(input: {
    orgId: string;
    id: string;
    step: VocalRecoveryStep | "INSIGHTS" | "INITIAL_VISIT_PARAMS";
    message: string;
    isFinal: boolean;
  }) {
    const existing = await db.query.vocals.findFirst({
      where: and(eq(vocals.id, input.id), eq(vocals.orgId, input.orgId)),
    });

    if (!existing) {
      throw new HttpError(404, "VOCAL_NOT_FOUND", "Vocal introuvable");
    }

    const normalizedMessage = input.message.trim();
    const processingError = normalizedMessage
      ? `[${input.step}] ${normalizedMessage}`.slice(0, 1000)
      : `[${input.step}] Erreur inconnue`;

    await db
      .update(vocals)
      .set({
        processingError,
        status: input.isFinal ? "REVIEW_REQUIRED" : existing.status,
        vocalType: input.isFinal ? "ERREUR_TRAITEMENT" : existing.vocalType,
        updatedAt: new Date(),
      })
      .where(and(eq(vocals.id, input.id), eq(vocals.orgId, input.orgId)));
  },

  async registerRecoveryAttempt(input: {
    orgId: string;
    id: string;
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
        processingAttempts: existing.processingAttempts + 1,
        processingError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(vocals.id, input.id), eq(vocals.orgId, input.orgId)));
  },

  async listAbandonedForRecovery(input: {
    staleBefore: Date;
    maxAttempts: number;
    limit: number;
  }) {
    const staleUploads = await db
      .select({
        id: vocals.id,
        orgId: vocals.orgId,
        step: vocals.status,
        processingAttempts: vocals.processingAttempts,
      })
      .from(vocals)
      .where(
        and(
          eq(vocals.status, "UPLOADED"),
          lt(vocals.updatedAt, input.staleBefore),
          or(isNull(vocals.vocalType), ne(vocals.vocalType, "ERREUR_TRAITEMENT")),
          lt(vocals.processingAttempts, input.maxAttempts),
        ),
      )
      .limit(input.limit);

    const staleTypeDetection = await db
      .select({
        id: vocals.id,
        orgId: vocals.orgId,
        step: vocals.status,
        processingAttempts: vocals.processingAttempts,
      })
      .from(vocals)
      .where(
        and(
          eq(vocals.status, "TRANSCRIBED"),
          isNull(vocals.vocalType),
          lt(vocals.updatedAt, input.staleBefore),
          lt(vocals.processingAttempts, input.maxAttempts),
        ),
      )
      .limit(input.limit);

    return {
      transcribe: staleUploads.map((row) => ({
        id: row.id,
        orgId: row.orgId,
        processingAttempts: row.processingAttempts,
      })),
      detectType: staleTypeDetection.map((row) => ({
        id: row.id,
        orgId: row.orgId,
        processingAttempts: row.processingAttempts,
      })),
    };
  },

  async listRecoveryExhausted(input: {
    staleBefore: Date;
    minAttempts: number;
    limit: number;
  }) {
    const rows = await db
      .select({
        id: vocals.id,
        orgId: vocals.orgId,
        status: vocals.status,
      })
      .from(vocals)
      .where(
        and(
          or(
            eq(vocals.status, "UPLOADED"),
            and(eq(vocals.status, "TRANSCRIBED"), isNull(vocals.vocalType)),
          ),
          lt(vocals.updatedAt, input.staleBefore),
          or(isNull(vocals.vocalType), ne(vocals.vocalType, "ERREUR_TRAITEMENT")),
          gte(vocals.processingAttempts, input.minAttempts),
        ),
      )
      .limit(input.limit);

    return rows;
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
      storageKey: file.storageKey,
      vocalType: vocal.vocalType as VocalType | null,
      processingError: vocal.processingError,
      processingAttempts: vocal.processingAttempts,
      transcript: vocal.transcript,
      summary: vocal.summary,
      confidence: vocal.confidence,
      status: vocal.status as VocalStatus,
    };
  },
};
