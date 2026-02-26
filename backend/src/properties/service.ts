import { and, desc, eq, inArray, lt } from "drizzle-orm";
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
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
};

type ProspectContactInput = OwnerContactInput;

type PropertyDetailsInput = Record<string, unknown>;

const generateRandomPassword = (): string => {
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(randomBytes).toString("base64url");
};

const normalizeOptionalString = (value: string | null | undefined): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const resolveRoleFromAccountType = (accountType: "AGENT" | "CLIENT" | "NOTAIRE"): string => {
  switch (accountType) {
    case "AGENT":
      return "AGENT";
    case "NOTAIRE":
      return "NOTAIRE";
    default:
      return "OWNER";
  }
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
    owner?: OwnerContactInput;
    ownerUserId?: string;
    details?: PropertyDetailsInput;
  }) {
    const now = new Date();
    const id = crypto.randomUUID();

    if (!input.owner && !input.ownerUserId) {
      throw new HttpError(
        400,
        "INVALID_OWNER_SELECTION",
        "Un proprietaire existant ou un nouveau proprietaire est requis",
      );
    }

    await db.transaction(async (tx) => {
      let ownerUserId: string;

      if (input.ownerUserId) {
        const existingUser = await tx.query.users.findFirst({
          where: and(eq(users.id, input.ownerUserId), eq(users.orgId, input.orgId)),
        });

        if (!existingUser) {
          throw new HttpError(404, "USER_NOT_FOUND", "Utilisateur proprietaire introuvable");
        }

        if (existingUser.accountType !== "CLIENT") {
          throw new HttpError(
            400,
            "OWNER_MUST_BE_CLIENT",
            "Le proprietaire doit etre un utilisateur de type client",
          );
        }

        ownerUserId = existingUser.id;
      } else {
        const owner = input.owner!;
        const normalizedOwnerEmail = owner.email.trim().toLowerCase();
        const normalizedOwnerPhone = owner.phone.trim();

        const existingOwner = await tx.query.users.findFirst({
          where: eq(users.email, normalizedOwnerEmail),
        });

        if (existingOwner) {
          if (existingOwner.orgId !== input.orgId) {
            throw new HttpError(
              409,
              "OWNER_EMAIL_ALREADY_USED",
              "Cet email proprietaire est deja utilise par une autre organisation",
            );
          }

          if (existingOwner.accountType !== "CLIENT") {
            throw new HttpError(
              400,
              "OWNER_MUST_BE_CLIENT",
              "Le proprietaire doit etre un utilisateur de type client",
            );
          }

          ownerUserId = existingOwner.id;
          await tx
            .update(users)
            .set({
              firstName: owner.firstName,
              lastName: owner.lastName,
              phone: normalizedOwnerPhone,
              address: normalizeOptionalString(owner.address) ?? null,
              postalCode: normalizeOptionalString(owner.postalCode) ?? null,
              city: normalizeOptionalString(owner.city) ?? null,
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
            firstName: owner.firstName,
            lastName: owner.lastName,
            phone: normalizedOwnerPhone,
            address: normalizeOptionalString(owner.address) ?? null,
            postalCode: normalizeOptionalString(owner.postalCode) ?? null,
            city: normalizeOptionalString(owner.city) ?? null,
            accountType: "CLIENT",
            role: resolveRoleFromAccountType("CLIENT"),
            passwordHash,
            createdAt: now,
            updatedAt: now,
          });
        }
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

  async listProspects(input: {
    orgId: string;
    propertyId: string;
  }) {
    const property = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.propertyId), eq(properties.orgId, input.orgId)),
    });

    if (!property) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    const rows = await db
      .select({
        id: propertyUserLinks.id,
        propertyId: propertyUserLinks.propertyId,
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        address: users.address,
        postalCode: users.postalCode,
        city: users.city,
        relationRole: propertyUserLinks.role,
        createdAt: propertyUserLinks.createdAt,
      })
      .from(propertyUserLinks)
      .innerJoin(
        users,
        and(eq(propertyUserLinks.userId, users.id), eq(users.orgId, input.orgId)),
      )
      .where(
        and(
          eq(propertyUserLinks.orgId, input.orgId),
          eq(propertyUserLinks.propertyId, input.propertyId),
          inArray(propertyUserLinks.role, ["PROSPECT", "ACHETEUR"]),
        ),
      )
      .orderBy(desc(propertyUserLinks.createdAt));

    return {
      items: rows.map((item) => ({
        id: item.id,
        propertyId: item.propertyId,
        userId: item.userId,
        firstName: item.firstName,
        lastName: item.lastName,
        email: item.email,
        phone: item.phone,
        address: item.address,
        postalCode: item.postalCode,
        city: item.city,
        relationRole: item.relationRole,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  },

  async addProspect(input: {
    orgId: string;
    propertyId: string;
    userId?: string;
    newClient?: ProspectContactInput;
  }) {
    const property = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.propertyId), eq(properties.orgId, input.orgId)),
    });

    if (!property) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    if (!input.userId && !input.newClient) {
      throw new HttpError(
        400,
        "INVALID_PROSPECT_SELECTION",
        "Un client existant ou un nouveau client est requis",
      );
    }

    const now = new Date();
    let userId = input.userId ?? "";
    let client = userId
      ? await db.query.users.findFirst({
          where: and(eq(users.id, userId), eq(users.orgId, input.orgId)),
        })
      : null;

    if (input.userId) {
      if (!client) {
        throw new HttpError(404, "USER_NOT_FOUND", "Client introuvable");
      }

      if (client.accountType !== "CLIENT") {
        throw new HttpError(
          400,
          "PROSPECT_MUST_BE_CLIENT",
          "Le prospect doit etre un utilisateur de type client",
        );
      }
    } else if (input.newClient) {
      const normalizedEmail = input.newClient.email.trim().toLowerCase();
      const existingByEmail = await db.query.users.findFirst({
        where: eq(users.email, normalizedEmail),
      });

      if (existingByEmail) {
        if (existingByEmail.orgId !== input.orgId) {
          throw new HttpError(
            409,
            "EMAIL_ALREADY_USED",
            "Cet email est deja utilise par une autre organisation",
          );
        }

        if (existingByEmail.accountType !== "CLIENT") {
          throw new HttpError(
            400,
            "PROSPECT_MUST_BE_CLIENT",
            "Le prospect doit etre un utilisateur de type client",
          );
        }

        userId = existingByEmail.id;
        await db
          .update(users)
          .set({
            firstName: input.newClient.firstName,
            lastName: input.newClient.lastName,
            phone: input.newClient.phone.trim(),
            address: normalizeOptionalString(input.newClient.address) ?? null,
            postalCode: normalizeOptionalString(input.newClient.postalCode) ?? null,
            city: normalizeOptionalString(input.newClient.city) ?? null,
            updatedAt: now,
          })
          .where(and(eq(users.id, userId), eq(users.orgId, input.orgId)));

        client = await db.query.users.findFirst({
          where: and(eq(users.id, userId), eq(users.orgId, input.orgId)),
        });
      } else {
        userId = crypto.randomUUID();
        const passwordHash = await Bun.password.hash(generateRandomPassword());

        await db.insert(users).values({
          id: userId,
          orgId: input.orgId,
          firstName: input.newClient.firstName,
          lastName: input.newClient.lastName,
          email: normalizedEmail,
          phone: input.newClient.phone.trim(),
          address: normalizeOptionalString(input.newClient.address) ?? null,
          postalCode: normalizeOptionalString(input.newClient.postalCode) ?? null,
          city: normalizeOptionalString(input.newClient.city) ?? null,
          accountType: "CLIENT",
          role: resolveRoleFromAccountType("CLIENT"),
          passwordHash,
          createdAt: now,
          updatedAt: now,
        });

        client = await db.query.users.findFirst({
          where: and(eq(users.id, userId), eq(users.orgId, input.orgId)),
        });
      }
    }

    if (!client) {
      throw new HttpError(500, "PROSPECT_CREATE_FAILED", "Impossible de recuperer le client");
    }

    const existingLink = await db.query.propertyUserLinks.findFirst({
      where: and(
        eq(propertyUserLinks.propertyId, input.propertyId),
        eq(propertyUserLinks.userId, userId),
        eq(propertyUserLinks.orgId, input.orgId),
      ),
    });

    let linkId = existingLink?.id ?? "";
    if (existingLink) {
      if (existingLink.role === "OWNER") {
        throw new HttpError(
          409,
          "PROSPECT_ALREADY_OWNER",
          "Ce client est deja proprietaire de ce bien",
        );
      }

      if (existingLink.role !== "PROSPECT") {
        await db
          .update(propertyUserLinks)
          .set({ role: "PROSPECT" })
          .where(eq(propertyUserLinks.id, existingLink.id));
      }
    } else {
      linkId = crypto.randomUUID();
      await db.insert(propertyUserLinks).values({
        id: linkId,
        orgId: input.orgId,
        propertyId: input.propertyId,
        userId,
        role: "PROSPECT",
        createdAt: now,
      });
    }

    return {
      id: linkId || existingLink?.id || "",
      propertyId: input.propertyId,
      userId: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone,
      address: client.address,
      postalCode: client.postalCode,
      city: client.city,
      relationRole: "PROSPECT",
      createdAt: (existingLink?.createdAt ?? now).toISOString(),
    };
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
