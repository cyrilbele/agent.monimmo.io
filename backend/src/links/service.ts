import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { calendarService } from "../calendar/service";
import { db } from "../db/client";
import { businessLinks, calendarEvents, properties, propertyVisits, users } from "../db/schema";
import { HttpError } from "../http/errors";
import type { ObjectFieldDefinition } from "../object-data/structure";
import { propertiesService } from "../properties/service";
import { usersService } from "../users/service";
import {
  getLinkTypeDefinition,
  isLinkObjectType,
  isLinkType,
  listLinkTypeDefinitions,
  type LinkObjectType,
  type LinkType,
  type LinkTypeDefinition,
} from "./catalog";

type BusinessLinkRow = typeof businessLinks.$inferSelect;

const parseCursor = (cursor?: string): number | undefined => {
  if (!cursor) {
    return undefined;
  }

  const asNumber = Number(cursor);
  if (Number.isNaN(asNumber) || asNumber <= 0) {
    throw new HttpError(400, "INVALID_CURSOR", "Cursor invalide");
  }

  return asNumber;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseRecord = (raw: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const serializeParams = (params: Record<string, unknown>): string => JSON.stringify(params);

const toLinkResponse = (row: BusinessLinkRow) => ({
  id: row.id,
  typeLien: row.typeLien,
  objectId1: row.objectId1,
  objectId2: row.objectId2,
  params: parseRecord(row.params),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toNullableString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toNullableNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const toNullableBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "true") {
      return true;
    }
    if (trimmed === "false") {
      return false;
    }
  }

  return null;
};

const normalizeFieldValue = (field: ObjectFieldDefinition, value: unknown): unknown => {
  if (field.type === "string" || field.type === "text" || field.type === "date" || field.type === "datetime") {
    const normalized = toNullableString(value);
    if (normalized === null) {
      throw new HttpError(400, "INVALID_LINK_PARAM", `Le paramètre ${field.key} doit être une chaîne.`);
    }
    return normalized;
  }

  if (field.type === "select") {
    const normalized = toNullableString(value);
    if (normalized === null) {
      throw new HttpError(400, "INVALID_LINK_PARAM", `Le paramètre ${field.key} doit être une chaîne.`);
    }

    const allowed = new Set((field.options ?? []).map((option) => option.value));
    if (allowed.size > 0 && !allowed.has(normalized)) {
      throw new HttpError(
        400,
        "INVALID_LINK_PARAM",
        `Le paramètre ${field.key} doit être une des valeurs autorisées.`,
      );
    }
    return normalized;
  }

  if (field.type === "int") {
    const normalized = toNullableNumber(value);
    if (normalized === null) {
      throw new HttpError(400, "INVALID_LINK_PARAM", `Le paramètre ${field.key} doit être un nombre entier.`);
    }

    if (!Number.isInteger(normalized)) {
      throw new HttpError(400, "INVALID_LINK_PARAM", `Le paramètre ${field.key} doit être un entier.`);
    }

    if (typeof field.min === "number" && normalized < field.min) {
      throw new HttpError(400, "INVALID_LINK_PARAM", `Le paramètre ${field.key} doit être >= ${field.min}.`);
    }

    if (typeof field.max === "number" && normalized > field.max) {
      throw new HttpError(400, "INVALID_LINK_PARAM", `Le paramètre ${field.key} doit être <= ${field.max}.`);
    }

    return normalized;
  }

  if (field.type === "float") {
    const normalized = toNullableNumber(value);
    if (normalized === null) {
      throw new HttpError(400, "INVALID_LINK_PARAM", `Le paramètre ${field.key} doit être un nombre.`);
    }

    if (typeof field.min === "number" && normalized < field.min) {
      throw new HttpError(400, "INVALID_LINK_PARAM", `Le paramètre ${field.key} doit être >= ${field.min}.`);
    }

    if (typeof field.max === "number" && normalized > field.max) {
      throw new HttpError(400, "INVALID_LINK_PARAM", `Le paramètre ${field.key} doit être <= ${field.max}.`);
    }

    return normalized;
  }

  const normalized = toNullableBoolean(value);
  if (normalized === null) {
    throw new HttpError(400, "INVALID_LINK_PARAM", `Le paramètre ${field.key} doit être booléen.`);
  }
  return normalized;
};

const normalizeParams = (
  rawParams: Record<string, unknown>,
  definition: LinkTypeDefinition,
): Record<string, unknown> => {
  const fieldsByKey = new Map(definition.paramsSchema.map((field) => [field.key, field]));
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawParams)) {
    const field = fieldsByKey.get(key);
    if (!field) {
      throw new HttpError(400, "INVALID_LINK_PARAM", `Paramètre de lien inconnu: ${key}.`);
    }

    normalized[key] = normalizeFieldValue(field, value);
  }

  for (const field of definition.paramsSchema) {
    if (field.required && typeof normalized[field.key] === "undefined") {
      throw new HttpError(400, "INVALID_LINK_PARAM", `Le paramètre ${field.key} est requis.`);
    }
  }

  return normalized;
};

const assertLinkObjectExists = async (input: {
  orgId: string;
  objectType: LinkObjectType;
  objectId: string;
}): Promise<void> => {
  if (input.objectType === "bien") {
    const found = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.objectId), eq(properties.orgId, input.orgId)),
    });
    if (!found) {
      throw new HttpError(404, "LINK_OBJECT_NOT_FOUND", "Bien introuvable pour ce lien.");
    }
    return;
  }

  if (input.objectType === "user") {
    const found = await db.query.users.findFirst({
      where: and(eq(users.id, input.objectId), eq(users.orgId, input.orgId)),
    });
    if (!found) {
      throw new HttpError(404, "LINK_OBJECT_NOT_FOUND", "Utilisateur introuvable pour ce lien.");
    }
    return;
  }

  if (input.objectType === "rdv") {
    const [appointment, visit] = await Promise.all([
      db.query.calendarEvents.findFirst({
        where: and(eq(calendarEvents.id, input.objectId), eq(calendarEvents.orgId, input.orgId)),
      }),
      db.query.propertyVisits.findFirst({
        where: and(eq(propertyVisits.id, input.objectId), eq(propertyVisits.orgId, input.orgId)),
      }),
    ]);
    if (!appointment && !visit) {
      throw new HttpError(404, "LINK_OBJECT_NOT_FOUND", "Rendez-vous introuvable pour ce lien.");
    }
    return;
  }
};

const loadHydratedObject = async (input: {
  orgId: string;
  objectType: LinkObjectType;
  objectId: string;
}): Promise<unknown | null> => {
  try {
    if (input.objectType === "bien") {
      return await propertiesService.getById({ orgId: input.orgId, id: input.objectId });
    }

    if (input.objectType === "user") {
      return await usersService.getById({ orgId: input.orgId, id: input.objectId });
    }

    if (input.objectType === "rdv") {
      return await calendarService.getRdvById({
        orgId: input.orgId,
        id: input.objectId,
      });
    }
  } catch {
    return null;
  }
};

export const linksService = {
  listTypeDefinitions() {
    return {
      items: listLinkTypeDefinitions(),
    };
  },

  getTypeDefinition(input: { typeLien: string }) {
    const definition = getLinkTypeDefinition(input.typeLien);
    if (!definition) {
      throw new HttpError(404, "LINK_TYPE_NOT_FOUND", "Type de lien introuvable.");
    }

    return definition;
  },

  async list(input: {
    orgId: string;
    limit: number;
    cursor?: string;
    typeLien?: string;
    objectId?: string;
    objectId1?: string;
    objectId2?: string;
  }) {
    const cursorValue = parseCursor(input.cursor);
    const filters = [eq(businessLinks.orgId, input.orgId)];

    if (input.typeLien) {
      if (!isLinkType(input.typeLien)) {
        throw new HttpError(400, "INVALID_LINK_TYPE", "Type de lien invalide.");
      }
      filters.push(eq(businessLinks.typeLien, input.typeLien));
    }

    if (input.objectId) {
      filters.push(or(eq(businessLinks.objectId1, input.objectId), eq(businessLinks.objectId2, input.objectId))!);
    }

    if (input.objectId1) {
      filters.push(eq(businessLinks.objectId1, input.objectId1));
    }

    if (input.objectId2) {
      filters.push(eq(businessLinks.objectId2, input.objectId2));
    }

    if (cursorValue) {
      filters.push(lt(businessLinks.createdAt, new Date(cursorValue)));
    }

    const whereClause = filters.length === 1 ? filters[0]! : and(...filters)!;
    const rows = await db
      .select()
      .from(businessLinks)
      .where(whereClause)
      .orderBy(desc(businessLinks.createdAt), desc(businessLinks.id))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const sliced = hasMore ? rows.slice(0, input.limit) : rows;
    const last = sliced.at(-1);

    return {
      items: sliced.map(toLinkResponse),
      nextCursor: hasMore && last ? String(last.createdAt.getTime()) : null,
    };
  },

  async getById(input: { orgId: string; id: string }) {
    const found = await db.query.businessLinks.findFirst({
      where: and(eq(businessLinks.id, input.id), eq(businessLinks.orgId, input.orgId)),
    });

    if (!found) {
      throw new HttpError(404, "LINK_NOT_FOUND", "Lien introuvable.");
    }

    return toLinkResponse(found);
  },

  async upsert(input: {
    orgId: string;
    typeLien: string;
    objectId1: string;
    objectId2: string;
    params?: Record<string, unknown>;
  }): Promise<{ created: boolean; item: ReturnType<typeof toLinkResponse> }> {
    if (!isLinkType(input.typeLien)) {
      throw new HttpError(400, "INVALID_LINK_TYPE", "Type de lien invalide.");
    }

    const definition = getLinkTypeDefinition(input.typeLien)!;

    await assertLinkObjectExists({
      orgId: input.orgId,
      objectType: definition.objectType1,
      objectId: input.objectId1,
    });
    await assertLinkObjectExists({
      orgId: input.orgId,
      objectType: definition.objectType2,
      objectId: input.objectId2,
    });

    const normalizedParams = normalizeParams(input.params ?? {}, definition);
    const now = new Date();

    const existing = await db.query.businessLinks.findFirst({
      where: and(
        eq(businessLinks.orgId, input.orgId),
        eq(businessLinks.typeLien, input.typeLien),
        eq(businessLinks.objectId1, input.objectId1),
        eq(businessLinks.objectId2, input.objectId2),
      ),
    });

    if (existing) {
      await db
        .update(businessLinks)
        .set({
          params: serializeParams(normalizedParams),
          updatedAt: now,
        })
        .where(eq(businessLinks.id, existing.id));

      const updated = await db.query.businessLinks.findFirst({
        where: and(eq(businessLinks.id, existing.id), eq(businessLinks.orgId, input.orgId)),
      });

      if (!updated) {
        throw new HttpError(500, "LINK_UPSERT_FAILED", "Mise à jour du lien impossible.");
      }

      return {
        created: false,
        item: toLinkResponse(updated),
      };
    }

    const id = crypto.randomUUID();
    await db.insert(businessLinks).values({
      id,
      orgId: input.orgId,
      typeLien: input.typeLien,
      objectId1: input.objectId1,
      objectId2: input.objectId2,
      params: serializeParams(normalizedParams),
      createdAt: now,
      updatedAt: now,
    });

    const created = await db.query.businessLinks.findFirst({
      where: and(eq(businessLinks.id, id), eq(businessLinks.orgId, input.orgId)),
    });

    if (!created) {
      throw new HttpError(500, "LINK_CREATE_FAILED", "Création du lien impossible.");
    }

    return {
      created: true,
      item: toLinkResponse(created),
    };
  },

  async patchById(input: {
    orgId: string;
    id: string;
    params: Record<string, unknown>;
  }) {
    const existing = await db.query.businessLinks.findFirst({
      where: and(eq(businessLinks.id, input.id), eq(businessLinks.orgId, input.orgId)),
    });

    if (!existing) {
      throw new HttpError(404, "LINK_NOT_FOUND", "Lien introuvable.");
    }

    const definition = getLinkTypeDefinition(existing.typeLien);
    if (!definition) {
      throw new HttpError(400, "INVALID_LINK_TYPE", "Type de lien invalide.");
    }

    const currentParams = parseRecord(existing.params);
    const merged = { ...currentParams };

    for (const [key, value] of Object.entries(input.params)) {
      if (value === null) {
        delete merged[key];
        continue;
      }

      merged[key] = value;
    }

    const normalizedParams = normalizeParams(merged, definition);

    await db
      .update(businessLinks)
      .set({
        params: serializeParams(normalizedParams),
        updatedAt: new Date(),
      })
      .where(and(eq(businessLinks.id, input.id), eq(businessLinks.orgId, input.orgId)));

    const updated = await db.query.businessLinks.findFirst({
      where: and(eq(businessLinks.id, input.id), eq(businessLinks.orgId, input.orgId)),
    });

    if (!updated) {
      throw new HttpError(500, "LINK_PATCH_FAILED", "Mise à jour du lien impossible.");
    }

    return toLinkResponse(updated);
  },

  async deleteById(input: { orgId: string; id: string }) {
    const existing = await db.query.businessLinks.findFirst({
      where: and(eq(businessLinks.id, input.id), eq(businessLinks.orgId, input.orgId)),
    });

    if (!existing) {
      throw new HttpError(404, "LINK_NOT_FOUND", "Lien introuvable.");
    }

    await db
      .delete(businessLinks)
      .where(and(eq(businessLinks.id, input.id), eq(businessLinks.orgId, input.orgId)));
  },

  async getRelated(input: {
    orgId: string;
    objectType: string;
    objectId: string;
  }) {
    if (!isLinkObjectType(input.objectType)) {
      throw new HttpError(400, "INVALID_OBJECT_TYPE", "Type d'objet invalide.");
    }

    await assertLinkObjectExists({
      orgId: input.orgId,
      objectType: input.objectType,
      objectId: input.objectId,
    });

    const allRows = await db
      .select()
      .from(businessLinks)
      .where(
        and(
          eq(businessLinks.orgId, input.orgId),
          or(eq(businessLinks.objectId1, input.objectId), eq(businessLinks.objectId2, input.objectId))!,
        ),
      )
      .orderBy(desc(businessLinks.createdAt), desc(businessLinks.id));

    const items: Array<{
      link: ReturnType<typeof toLinkResponse>;
      otherSideObjectType: LinkObjectType;
      otherSideObjectId: string;
      otherSide: unknown | null;
    }> = [];

    const grouped: Record<LinkObjectType, unknown[]> = {
      bien: [],
      user: [],
      rdv: [],
    };

    const toHydrateByType: Record<LinkObjectType, Set<string>> = {
      bien: new Set(),
      user: new Set(),
      rdv: new Set(),
    };

    for (const row of allRows) {
      const definition = getLinkTypeDefinition(row.typeLien);
      if (!definition) {
        continue;
      }

      const objectId1Matches = row.objectId1 === input.objectId;
      const objectId2Matches = row.objectId2 === input.objectId;
      if (!objectId1Matches && !objectId2Matches) {
        continue;
      }

      const otherSideObjectType = objectId1Matches ? definition.objectType2 : definition.objectType1;
      const otherSideObjectId = objectId1Matches ? row.objectId2 : row.objectId1;

      toHydrateByType[otherSideObjectType].add(otherSideObjectId);

      items.push({
        link: toLinkResponse(row),
        otherSideObjectType,
        otherSideObjectId,
        otherSide: null,
      });
    }

    const hydrationMap = new Map<string, unknown | null>();
    const hydrate = async (objectType: LinkObjectType, ids: string[]) => {
      for (const objectId of ids) {
        const hydrated = await loadHydratedObject({
          orgId: input.orgId,
          objectType,
          objectId,
        });
        hydrationMap.set(`${objectType}:${objectId}`, hydrated);
        if (hydrated) {
          grouped[objectType].push(hydrated);
        }
      }
    };

    await Promise.all([
      hydrate("bien", [...toHydrateByType.bien]),
      hydrate("user", [...toHydrateByType.user]),
      hydrate("rdv", [...toHydrateByType.rdv]),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        otherSide: hydrationMap.get(`${item.otherSideObjectType}:${item.otherSideObjectId}`) ?? null,
      })),
      grouped,
    };
  },
};
