import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../db/client";
import { files, properties } from "../db/schema";
import { HttpError } from "../http/errors";
import { getStorageProvider } from "../storage";

type FileRow = typeof files.$inferSelect;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const toFileResponse = (row: FileRow) => ({
  id: row.id,
  propertyId: row.propertyId,
  typeDocument: row.typeDocument,
  fileName: row.fileName,
  mimeType: row.mimeType,
  size: row.size,
  status: row.status,
  storageKey: row.storageKey,
  createdAt: row.createdAt.toISOString(),
});

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

const decodeBase64Content = (contentBase64?: string): Uint8Array | string => {
  if (!contentBase64) {
    return "";
  }

  const cleaned = contentBase64.trim();
  if (!cleaned) {
    return "";
  }

  try {
    return Uint8Array.from(Buffer.from(cleaned, "base64"));
  } catch {
    throw new HttpError(400, "INVALID_FILE_CONTENT", "Contenu du fichier invalide");
  }
};

const assertUploadSize = (size: number): void => {
  if (!Number.isInteger(size) || size < 0) {
    throw new HttpError(400, "INVALID_FILE_SIZE", "Taille de fichier invalide");
  }

  if (size > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, "FILE_TOO_LARGE", "Le fichier depasse la taille maximale autorisee");
  }
};

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

export const filesService = {
  async list(input: {
    orgId: string;
    limit: number;
    cursor?: string;
    propertyId?: string;
  }) {
    const cursorValue = parseCursor(input.cursor);
    await assertPropertyScope(input.orgId, input.propertyId);

    const scopeByOrg = eq(files.orgId, input.orgId);
    const scopeByProperty = input.propertyId
      ? eq(files.propertyId, input.propertyId)
      : undefined;
    const scopeByCursor = cursorValue
      ? lt(files.createdAt, new Date(cursorValue))
      : undefined;

    const whereClauses = [scopeByOrg, scopeByProperty, scopeByCursor].filter(
      (clause): clause is Exclude<typeof clause, undefined> => clause !== undefined,
    );

    const rows = await db
      .select()
      .from(files)
      .where(and(...whereClauses))
      .orderBy(desc(files.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const sliced = hasMore ? rows.slice(0, input.limit) : rows;
    const lastItem = sliced.at(-1);

    return {
      items: sliced.map(toFileResponse),
      nextCursor: hasMore && lastItem ? String(lastItem.createdAt.getTime()) : null,
    };
  },

  async upload(input: {
    orgId: string;
    propertyId?: string | null;
    typeDocument?: string | null;
    fileName: string;
    mimeType: string;
    size: number;
    contentBase64?: string;
  }) {
    await assertPropertyScope(input.orgId, input.propertyId);
    assertUploadSize(input.size);

    const now = new Date();
    const id = crypto.randomUUID();
    const storageKey = `${input.orgId}/${id}/${encodeURIComponent(input.fileName)}`;
    const fileContent = decodeBase64Content(input.contentBase64);

    if (fileContent instanceof Uint8Array) {
      if (fileContent.byteLength > MAX_UPLOAD_BYTES) {
        throw new HttpError(413, "FILE_TOO_LARGE", "Le fichier depasse la taille maximale autorisee");
      }

      if (fileContent.byteLength !== input.size) {
        throw new HttpError(
          400,
          "FILE_SIZE_MISMATCH",
          "La taille declaree ne correspond pas au contenu du fichier",
        );
      }
    }

    const storage = getStorageProvider();
    await storage.putObject({
      key: storageKey,
      data: fileContent,
      contentType: input.mimeType,
    });

    await db.insert(files).values({
      id,
      orgId: input.orgId,
      propertyId: input.propertyId ?? null,
      typeDocument: input.typeDocument ?? null,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.size,
      status: "UPLOADED",
      storageKey,
      createdAt: now,
      updatedAt: now,
    });

    const created = await db.query.files.findFirst({
      where: and(eq(files.id, id), eq(files.orgId, input.orgId)),
    });

    if (!created) {
      throw new HttpError(500, "FILE_UPLOAD_FAILED", "Upload impossible");
    }

    return toFileResponse(created);
  },

  async getById(input: { orgId: string; id: string }) {
    const file = await db.query.files.findFirst({
      where: and(eq(files.id, input.id), eq(files.orgId, input.orgId)),
    });

    if (!file) {
      throw new HttpError(404, "FILE_NOT_FOUND", "Fichier introuvable");
    }

    return toFileResponse(file);
  },

  async getDownloadUrl(input: { orgId: string; id: string }) {
    const file = await db.query.files.findFirst({
      where: and(eq(files.id, input.id), eq(files.orgId, input.orgId)),
    });

    if (!file) {
      throw new HttpError(404, "FILE_NOT_FOUND", "Fichier introuvable");
    }

    const expiresInSeconds = 15 * 60;
    const storage = getStorageProvider();
    const url = await storage.getDownloadUrl(file.storageKey, expiresInSeconds);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    return {
      url,
      expiresAt: expiresAt.toISOString(),
    };
  },

  async patchById(input: {
    orgId: string;
    id: string;
    data: {
      propertyId?: string | null;
      typeDocument?: string;
      status?: string;
    };
  }) {
    const existing = await db.query.files.findFirst({
      where: and(eq(files.id, input.id), eq(files.orgId, input.orgId)),
    });

    if (!existing) {
      throw new HttpError(404, "FILE_NOT_FOUND", "Fichier introuvable");
    }

    if (input.data.propertyId !== undefined) {
      await assertPropertyScope(input.orgId, input.data.propertyId);
    }

    await db
      .update(files)
      .set({
        propertyId:
          input.data.propertyId === undefined ? existing.propertyId : input.data.propertyId,
        typeDocument:
          input.data.typeDocument === undefined
            ? existing.typeDocument
            : input.data.typeDocument,
        status: input.data.status === undefined ? existing.status : input.data.status,
        updatedAt: new Date(),
      })
      .where(and(eq(files.id, input.id), eq(files.orgId, input.orgId)));

    const updated = await db.query.files.findFirst({
      where: and(eq(files.id, input.id), eq(files.orgId, input.orgId)),
    });

    if (!updated) {
      throw new HttpError(500, "FILE_PATCH_FAILED", "Mise à jour impossible");
    }

    return toFileResponse(updated);
  },

  async setClassification(input: {
    orgId: string;
    id: string;
    typeDocument?: string | null;
    status: "UPLOADED" | "CLASSIFIED" | "REVIEW_REQUIRED";
  }) {
    const existing = await db.query.files.findFirst({
      where: and(eq(files.id, input.id), eq(files.orgId, input.orgId)),
    });

    if (!existing) {
      throw new HttpError(404, "FILE_NOT_FOUND", "Fichier introuvable");
    }

    await db
      .update(files)
      .set({
        typeDocument:
          input.typeDocument === undefined ? existing.typeDocument : input.typeDocument,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(and(eq(files.id, input.id), eq(files.orgId, input.orgId)));
  },

  async upsertImportedFile(input: {
    orgId: string;
    sourceProvider: "GMAIL" | "WHATSAPP" | "GOOGLE_CALENDAR";
    externalId: string;
    propertyId?: string | null;
    fileName: string;
    mimeType: string;
    size: number;
  }): Promise<{ id: string; created: boolean }> {
    const existing = await db.query.files.findFirst({
      where: and(
        eq(files.orgId, input.orgId),
        eq(files.sourceProvider, input.sourceProvider),
        eq(files.externalId, input.externalId),
      ),
    });

    await assertPropertyScope(input.orgId, input.propertyId);

    const now = new Date();
    const storage = getStorageProvider();
    if (existing) {
      await db
        .update(files)
        .set({
          propertyId: input.propertyId ?? existing.propertyId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          size: input.size,
          updatedAt: now,
        })
        .where(and(eq(files.id, existing.id), eq(files.orgId, input.orgId)));

      return { id: existing.id, created: false };
    }

    const id = crypto.randomUUID();
    const storageKey = `${input.orgId}/imports/${input.sourceProvider}/${encodeURIComponent(
      input.externalId,
    )}/${encodeURIComponent(input.fileName)}`;

    await storage.putObject({
      key: storageKey,
      data: "",
      contentType: input.mimeType,
    });

    await db.insert(files).values({
      id,
      orgId: input.orgId,
      propertyId: input.propertyId ?? null,
      typeDocument: null,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.size,
      status: "UPLOADED",
      storageKey,
      sourceProvider: input.sourceProvider,
      externalId: input.externalId,
      createdAt: now,
      updatedAt: now,
    });

    return { id, created: true };
  },
};
