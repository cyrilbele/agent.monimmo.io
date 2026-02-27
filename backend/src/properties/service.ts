import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "../db/client";
import {
  properties,
  propertyParties,
  propertyTimelineEvents,
  propertyUserLinks,
  propertyVisits,
  users,
} from "../db/schema";
import { HttpError } from "../http/errors";
import { findCoordinatesForAddress, type PropertyCoordinates } from "./geocoding";
import { getPropertyRisks, type PropertyRisksResponse } from "./georisques";

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const numeric = Number(trimmed.replace(",", "."));
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
};

const getLocationDetails = (details: PropertyDetailsInput): Record<string, unknown> => {
  const rawLocation = details.location;
  if (!isRecord(rawLocation)) {
    return {};
  }

  return rawLocation;
};

const applyCoordinatesToDetails = (
  details: PropertyDetailsInput,
  coordinates: PropertyCoordinates | null,
): PropertyDetailsInput => {
  const location = getLocationDetails(details);

  return {
    ...details,
    location: {
      ...location,
      gpsLat: coordinates?.latitude ?? null,
      gpsLng: coordinates?.longitude ?? null,
    },
  };
};

const withGeocodedCoordinates = async (input: {
  details: PropertyDetailsInput;
  address: string;
  postalCode: string;
  city: string;
}): Promise<PropertyDetailsInput> => {
  const coordinates = await findCoordinatesForAddress({
    address: input.address,
    postalCode: input.postalCode,
    city: input.city,
  });

  return applyCoordinatesToDetails(input.details, coordinates);
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

const parseIsoDateTime = (
  rawValue: string,
  errorCode: string,
  errorMessage: string,
): Date => {
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, errorCode, errorMessage);
  }

  return parsed;
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

    const detailsWithCoordinates = await withGeocodedCoordinates({
      details: input.details ?? {},
      address: input.address,
      postalCode: input.postalCode,
      city: input.city,
    });

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
        details: JSON.stringify(detailsWithCoordinates),
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

    const nextAddress = input.data.address ?? existing.address ?? "";
    const nextPostalCode = input.data.postalCode ?? existing.postalCode;
    const nextCity = input.data.city ?? existing.city;
    const shouldRefreshCoordinates =
      (input.data.address !== undefined && input.data.address !== existing.address) ||
      (input.data.postalCode !== undefined && input.data.postalCode !== existing.postalCode) ||
      (input.data.city !== undefined && input.data.city !== existing.city);

    const detailsWithCoordinates = shouldRefreshCoordinates
      ? await withGeocodedCoordinates({
          details: mergedDetails,
          address: nextAddress,
          postalCode: nextPostalCode,
          city: nextCity,
        })
      : mergedDetails;

    await db
      .update(properties)
      .set({
        title: input.data.title ?? existing.title,
        city: input.data.city ?? existing.city,
        postalCode: input.data.postalCode ?? existing.postalCode,
        address: input.data.address ?? existing.address,
        price:
          input.data.price === undefined ? existing.price : Math.round(input.data.price),
        details: JSON.stringify(detailsWithCoordinates),
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

  async listVisits(input: {
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
        id: propertyVisits.id,
        propertyId: propertyVisits.propertyId,
        propertyTitle: properties.title,
        prospectUserId: propertyVisits.prospectUserId,
        prospectFirstName: users.firstName,
        prospectLastName: users.lastName,
        prospectEmail: users.email,
        prospectPhone: users.phone,
        startsAt: propertyVisits.startsAt,
        endsAt: propertyVisits.endsAt,
        createdAt: propertyVisits.createdAt,
        updatedAt: propertyVisits.updatedAt,
      })
      .from(propertyVisits)
      .innerJoin(
        properties,
        and(
          eq(propertyVisits.propertyId, properties.id),
          eq(properties.orgId, input.orgId),
        ),
      )
      .innerJoin(
        users,
        and(
          eq(propertyVisits.prospectUserId, users.id),
          eq(users.orgId, input.orgId),
        ),
      )
      .where(
        and(
          eq(propertyVisits.orgId, input.orgId),
          eq(propertyVisits.propertyId, input.propertyId),
        ),
      )
      .orderBy(desc(propertyVisits.startsAt));

    return {
      items: rows.map((row) => ({
        id: row.id,
        propertyId: row.propertyId,
        propertyTitle: row.propertyTitle,
        prospectUserId: row.prospectUserId,
        prospectFirstName: row.prospectFirstName,
        prospectLastName: row.prospectLastName,
        prospectEmail: row.prospectEmail,
        prospectPhone: row.prospectPhone,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  },

  async addVisit(input: {
    orgId: string;
    propertyId: string;
    prospectUserId: string;
    startsAt: string;
    endsAt: string;
  }) {
    const startsAt = parseIsoDateTime(
      input.startsAt,
      "INVALID_VISIT_START",
      "La date de debut de visite est invalide",
    );
    const endsAt = parseIsoDateTime(
      input.endsAt,
      "INVALID_VISIT_END",
      "La date de fin de visite est invalide",
    );

    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new HttpError(
        400,
        "INVALID_VISIT_TIME_RANGE",
        "L'heure de fin doit etre apres l'heure de debut",
      );
    }

    const property = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.propertyId), eq(properties.orgId, input.orgId)),
    });

    if (!property) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    const prospect = await db.query.users.findFirst({
      where: and(eq(users.id, input.prospectUserId), eq(users.orgId, input.orgId)),
    });

    if (!prospect) {
      throw new HttpError(404, "USER_NOT_FOUND", "Prospect introuvable");
    }

    if (prospect.accountType !== "CLIENT") {
      throw new HttpError(
        400,
        "PROSPECT_MUST_BE_CLIENT",
        "Le prospect doit etre un utilisateur de type client",
      );
    }

    const existingLink = await db.query.propertyUserLinks.findFirst({
      where: and(
        eq(propertyUserLinks.orgId, input.orgId),
        eq(propertyUserLinks.propertyId, input.propertyId),
        eq(propertyUserLinks.userId, input.prospectUserId),
      ),
    });

    if (existingLink?.role === "OWNER") {
      throw new HttpError(
        400,
        "PROSPECT_ALREADY_OWNER",
        "Ce client est deja proprietaire de ce bien",
      );
    }

    const now = new Date();

    if (!existingLink) {
      await db.insert(propertyUserLinks).values({
        id: crypto.randomUUID(),
        orgId: input.orgId,
        propertyId: input.propertyId,
        userId: input.prospectUserId,
        role: "PROSPECT",
        createdAt: now,
      });
    } else if (existingLink.role !== "PROSPECT" && existingLink.role !== "ACHETEUR") {
      await db
        .update(propertyUserLinks)
        .set({ role: "PROSPECT" })
        .where(eq(propertyUserLinks.id, existingLink.id));
    }

    const visitId = crypto.randomUUID();

    await db.insert(propertyVisits).values({
      id: visitId,
      orgId: input.orgId,
      propertyId: input.propertyId,
      prospectUserId: input.prospectUserId,
      startsAt,
      endsAt,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(propertyTimelineEvents).values({
      id: crypto.randomUUID(),
      propertyId: input.propertyId,
      orgId: input.orgId,
      eventType: "VISIT_SCHEDULED",
      payload: JSON.stringify({
        visitId,
        prospectUserId: input.prospectUserId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      }),
      createdAt: now,
    });

    return {
      id: visitId,
      propertyId: input.propertyId,
      propertyTitle: property.title,
      prospectUserId: prospect.id,
      prospectFirstName: prospect.firstName,
      prospectLastName: prospect.lastName,
      prospectEmail: prospect.email,
      prospectPhone: prospect.phone,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  },

  async listCalendarVisits(input: {
    orgId: string;
    from?: string;
    to?: string;
  }) {
    const fromDate = input.from
      ? parseIsoDateTime(input.from, "INVALID_CALENDAR_FROM", "La borne de debut est invalide")
      : null;
    const toDate = input.to
      ? parseIsoDateTime(input.to, "INVALID_CALENDAR_TO", "La borne de fin est invalide")
      : null;

    const filters = [eq(propertyVisits.orgId, input.orgId)];

    if (fromDate) {
      filters.push(gt(propertyVisits.endsAt, fromDate));
    }

    if (toDate) {
      filters.push(lt(propertyVisits.startsAt, toDate));
    }

    const rows = await db
      .select({
        id: propertyVisits.id,
        propertyId: propertyVisits.propertyId,
        propertyTitle: properties.title,
        prospectUserId: propertyVisits.prospectUserId,
        prospectFirstName: users.firstName,
        prospectLastName: users.lastName,
        prospectEmail: users.email,
        prospectPhone: users.phone,
        startsAt: propertyVisits.startsAt,
        endsAt: propertyVisits.endsAt,
        createdAt: propertyVisits.createdAt,
        updatedAt: propertyVisits.updatedAt,
      })
      .from(propertyVisits)
      .innerJoin(
        properties,
        and(eq(propertyVisits.propertyId, properties.id), eq(properties.orgId, input.orgId)),
      )
      .innerJoin(
        users,
        and(eq(propertyVisits.prospectUserId, users.id), eq(users.orgId, input.orgId)),
      )
      .where(and(...filters))
      .orderBy(propertyVisits.startsAt);

    return {
      items: rows.map((row) => ({
        id: row.id,
        propertyId: row.propertyId,
        propertyTitle: row.propertyTitle,
        prospectUserId: row.prospectUserId,
        prospectFirstName: row.prospectFirstName,
        prospectLastName: row.prospectLastName,
        prospectEmail: row.prospectEmail,
        prospectPhone: row.prospectPhone,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
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

  async getRisks(input: { orgId: string; propertyId: string }): Promise<PropertyRisksResponse> {
    const property = await db.query.properties.findFirst({
      where: and(eq(properties.id, input.propertyId), eq(properties.orgId, input.orgId)),
    });

    if (!property) {
      throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
    }

    const details = parseDetails(property.details);
    const locationDetails = (() => {
      const raw = details.location;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {} as Record<string, unknown>;
      }

      return raw as Record<string, unknown>;
    })();

    return getPropertyRisks({
      propertyId: property.id,
      location: {
        address: property.address,
        postalCode: property.postalCode,
        city: property.city,
        latitude: toFiniteNumber(locationDetails.gpsLat),
        longitude: toFiniteNumber(locationDetails.gpsLng),
      },
    });
  },
};
