import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../db/client";
import {
  properties,
  propertyParties,
  propertyTimelineEvents,
  propertyUserLinks,
  users,
} from "../db/schema";
import { HttpError } from "../http/errors";

type PropertyRow = typeof properties.$inferSelect;

type ListPropertiesInput = {
  orgId: string;
  limit: number;
  cursor?: string;
};

type OwnerContactInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

type PropertyDetailsInput = Record<string, unknown>;

const generateRandomPassword = (): string => {
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(randomBytes).toString("base64url");
};

const parseDetails = (raw: string | null): Record<string, unknown> => {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
};

const toPropertyResponse = (row: PropertyRow) => ({
  id: row.id,
  title: row.title,
  city: row.city,
  postalCode: row.postalCode,
  address: row.address,
  price: row.price,
  details: parseDetails(row.details),
  status: row.status,
  orgId: row.orgId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
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

export const propertiesService = {
  async list(input: ListPropertiesInput) {
    const cursorValue = parseCursor(input.cursor);

    const whereClause = cursorValue
      ? and(
          eq(properties.orgId, input.orgId),
          lt(properties.createdAt, new Date(cursorValue)),
        )
      : eq(properties.orgId, input.orgId);

    const rows = await db
      .select()
      .from(properties)
      .where(whereClause)
      .orderBy(desc(properties.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const sliced = hasMore ? rows.slice(0, input.limit) : rows;
    const lastItem = sliced.at(-1);

    return {
      items: sliced.map(toPropertyResponse),
      nextCursor: hasMore && lastItem ? String(lastItem.createdAt.getTime()) : null,
    };
  },

  async create(input: {
    orgId: string;
    title: string;
    city: string;
    postalCode: string;
    address: string;
    owner: OwnerContactInput;
    details?: PropertyDetailsInput;
  }) {
    const now = new Date();
    const id = crypto.randomUUID();
    const normalizedOwnerEmail = input.owner.email.trim().toLowerCase();
    const normalizedOwnerPhone = input.owner.phone.trim();

    await db.transaction(async (tx) => {
      const existingOwner = await tx.query.users.findFirst({
        where: eq(users.email, normalizedOwnerEmail),
      });

      let ownerUserId: string;
      if (existingOwner) {
        if (existingOwner.orgId !== input.orgId) {
          throw new HttpError(
            409,
            "OWNER_EMAIL_ALREADY_USED",
            "Cet email propriétaire est déjà utilisé par une autre organisation",
          );
        }

        ownerUserId = existingOwner.id;
        await tx
          .update(users)
          .set({
            firstName: input.owner.firstName,
            lastName: input.owner.lastName,
            phone: normalizedOwnerPhone,
            updatedAt: now,
          })
          .where(and(eq(users.id, existingOwner.id), eq(users.orgId, input.orgId)));
      } else {
        ownerUserId = crypto.randomUUID();
        const passwordHash = await Bun.password.hash(generateRandomPassword());

        await tx.insert(users).values({
          id: ownerUserId,
          orgId: input.orgId,
          email: normalizedOwnerEmail,
          firstName: input.owner.firstName,
          lastName: input.owner.lastName,
          phone: normalizedOwnerPhone,
          role: "OWNER",
          passwordHash,
          createdAt: now,
          updatedAt: now,
        });
      }

      await tx.insert(properties).values({
        id,
        orgId: input.orgId,
        title: input.title,
        city: input.city,
        postalCode: input.postalCode,
        address: input.address,
        price: null,
        details: JSON.stringify(input.details ?? {}),
        status: "PROSPECTION",
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(propertyUserLinks).values({
        id: crypto.randomUUID(),
        orgId: input.orgId,
        propertyId: id,
        userId: ownerUserId,
        role: "OWNER",
        createdAt: now,
      });
    });

    const created = await db.query.properties.findFirst({
      where: and(eq(properties.id, id), eq(properties.orgId, input.orgId)),
    });

    if (!created) {
      throw new HttpError(500, "PROPERTY_CREATE_FAILED", "Création du bien impossible");
    }

    return toPropertyResponse(created);
  },

  async getById(input: { orgId: string; id: string }) {
    const property = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.id), eq(properties.orgId, input.orgId)),
    });

    if (!property) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    return toPropertyResponse(property);
  },

  async patchById(input: {
    orgId: string;
    id: string;
    data: {
      title?: string;
      city?: string;
      postalCode?: string;
      address?: string;
      price?: number;
      details?: PropertyDetailsInput;
    };
  }) {
    const existing = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.id), eq(properties.orgId, input.orgId)),
    });

    if (!existing) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    const mergedDetails =
      input.data.details === undefined
        ? parseDetails(existing.details)
        : {
            ...parseDetails(existing.details),
            ...input.data.details,
          };

    await db
      .update(properties)
      .set({
        title: input.data.title ?? existing.title,
        city: input.data.city ?? existing.city,
        postalCode: input.data.postalCode ?? existing.postalCode,
        address: input.data.address ?? existing.address,
        price:
          input.data.price === undefined ? existing.price : Math.round(input.data.price),
        details: JSON.stringify(mergedDetails),
        updatedAt: new Date(),
      })
      .where(and(eq(properties.id, input.id), eq(properties.orgId, input.orgId)));

    const updated = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.id), eq(properties.orgId, input.orgId)),
    });

    if (!updated) {
      throw new HttpError(500, "PROPERTY_PATCH_FAILED", "Mise à jour impossible");
    }

    return toPropertyResponse(updated);
  },

  async updateStatus(input: {
    orgId: string;
    id: string;
    status: string;
  }) {
    const existing = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.id), eq(properties.orgId, input.orgId)),
    });

    if (!existing) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    const now = new Date();
    await db
      .update(properties)
      .set({
        status: input.status,
        updatedAt: now,
      })
      .where(and(eq(properties.id, input.id), eq(properties.orgId, input.orgId)));

    await db.insert(propertyTimelineEvents).values({
      id: crypto.randomUUID(),
      propertyId: existing.id,
      orgId: input.orgId,
      eventType: "PROPERTY_STATUS_CHANGED",
      payload: JSON.stringify({
        from: existing.status,
        to: input.status,
      }),
      createdAt: now,
    });

    const updated = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.id), eq(properties.orgId, input.orgId)),
    });

    if (!updated) {
      throw new HttpError(500, "PROPERTY_PATCH_FAILED", "Mise à jour impossible");
    }

    return toPropertyResponse(updated);
  },

  async addParticipant(input: {
    orgId: string;
    propertyId: string;
    contactId: string;
    role: string;
  }) {
    const property = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.propertyId), eq(properties.orgId, input.orgId)),
    });

    if (!property) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    const createdAt = new Date();
    const participantId = crypto.randomUUID();

    await db.insert(propertyParties).values({
      id: participantId,
      propertyId: input.propertyId,
      orgId: input.orgId,
      contactId: input.contactId,
      role: input.role,
      createdAt,
    });

    return {
      id: participantId,
      propertyId: input.propertyId,
      contactId: input.contactId,
      role: input.role,
      createdAt: createdAt.toISOString(),
    };
  },
};
