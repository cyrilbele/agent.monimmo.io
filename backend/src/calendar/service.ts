import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "../db/client";
import { calendarEvents, properties, propertyUserLinks, users } from "../db/schema";
import { HttpError } from "../http/errors";

type ManualCalendarPayload = {
  kind: "MANUAL_APPOINTMENT";
  propertyId: string;
  clientUserId: string | null;
  addressOverride: string | null;
  comment: string | null;
};

const MANUAL_PROVIDER = "MANUAL";
const MANUAL_PAYLOAD_KIND = "MANUAL_APPOINTMENT";

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const toPropertyAddress = (input: {
  address: string | null;
  postalCode: string;
  city: string;
}): string | null => {
  const parts = [
    normalizeOptionalString(input.address),
    normalizeOptionalString(`${input.postalCode} ${input.city}`),
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    return null;
  }

  return parts.join(", ");
};

const parseManualPayload = (rawPayload: string | null): ManualCalendarPayload | null => {
  if (!rawPayload) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(rawPayload);
    if (!isRecord(parsed)) {
      return null;
    }

    const kind = parsed.kind;
    const propertyId = parsed.propertyId;

    if (kind !== MANUAL_PAYLOAD_KIND || typeof propertyId !== "string" || !propertyId.trim()) {
      return null;
    }

    return {
      kind: MANUAL_PAYLOAD_KIND,
      propertyId: propertyId.trim(),
      clientUserId: normalizeOptionalString(parsed.clientUserId),
      addressOverride: normalizeOptionalString(parsed.addressOverride),
      comment: normalizeOptionalString(parsed.comment),
    };
  } catch {
    return null;
  }
};

const assertPropertyExistsInOrg = async (input: { orgId: string; propertyId: string }) => {
  const property = await db.query.properties.findFirst({
    where: and(eq(properties.id, input.propertyId), eq(properties.orgId, input.orgId)),
  });

  if (!property) {
    throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
  }

  return property;
};

const assertClientExistsInOrg = async (input: { orgId: string; clientUserId: string }) => {
  const user = await db.query.users.findFirst({
    where: and(eq(users.id, input.clientUserId), eq(users.orgId, input.orgId)),
  });

  if (!user) {
    throw new HttpError(404, "USER_NOT_FOUND", "Client introuvable");
  }

  if (user.accountType !== "CLIENT") {
    throw new HttpError(
      400,
      "PROSPECT_MUST_BE_CLIENT",
      "Le prospect doit etre un utilisateur de type client",
    );
  }

  return user;
};

const ensureClientLinkedToPropertyAsProspect = async (input: {
  orgId: string;
  propertyId: string;
  clientUserId: string;
}) => {
  const existingLink = await db.query.propertyUserLinks.findFirst({
    where: and(
      eq(propertyUserLinks.orgId, input.orgId),
      eq(propertyUserLinks.propertyId, input.propertyId),
      eq(propertyUserLinks.userId, input.clientUserId),
    ),
  });

  if (!existingLink) {
    await db.insert(propertyUserLinks).values({
      id: crypto.randomUUID(),
      orgId: input.orgId,
      propertyId: input.propertyId,
      userId: input.clientUserId,
      role: "PROSPECT",
      createdAt: new Date(),
    });
    return;
  }

  if (existingLink.role === "OWNER" || existingLink.role === "PROSPECT" || existingLink.role === "ACHETEUR") {
    return;
  }

  await db
    .update(propertyUserLinks)
    .set({ role: "PROSPECT" })
    .where(eq(propertyUserLinks.id, existingLink.id));
};

export const calendarService = {
  async listManualAppointments(input: {
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

    const filters = [
      eq(calendarEvents.orgId, input.orgId),
      eq(calendarEvents.provider, MANUAL_PROVIDER),
    ];

    if (fromDate) {
      filters.push(gt(calendarEvents.endsAt, fromDate));
    }

    if (toDate) {
      filters.push(lt(calendarEvents.startsAt, toDate));
    }

    const rows = await db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        startsAt: calendarEvents.startsAt,
        endsAt: calendarEvents.endsAt,
        payload: calendarEvents.payload,
        createdAt: calendarEvents.createdAt,
        updatedAt: calendarEvents.updatedAt,
      })
      .from(calendarEvents)
      .where(and(...filters))
      .orderBy(calendarEvents.startsAt);

    const rowsWithPayload = rows
      .map((row) => ({
        row,
        payload: parseManualPayload(row.payload),
      }))
      .filter(
        (item): item is { row: (typeof rows)[number]; payload: ManualCalendarPayload } =>
          item.payload !== null,
      );

    const propertyIds = Array.from(
      new Set(rowsWithPayload.map((item) => item.payload.propertyId)),
    );

    const propertyRows =
      propertyIds.length > 0
        ? await db
            .select({
              id: properties.id,
              title: properties.title,
              address: properties.address,
              postalCode: properties.postalCode,
              city: properties.city,
            })
            .from(properties)
            .where(and(eq(properties.orgId, input.orgId), inArray(properties.id, propertyIds)))
        : [];

    const propertyById = new Map(propertyRows.map((property) => [property.id, property]));
    const clientIds = Array.from(
      new Set(
        rowsWithPayload
          .map((item) => item.payload.clientUserId)
          .filter((clientUserId): clientUserId is string => Boolean(clientUserId)),
      ),
    );

    const clientRows =
      clientIds.length > 0
        ? await db
            .select({
              id: users.id,
              firstName: users.firstName,
              lastName: users.lastName,
            })
            .from(users)
            .where(and(eq(users.orgId, input.orgId), inArray(users.id, clientIds)))
        : [];
    const clientById = new Map(clientRows.map((client) => [client.id, client]));

    return {
      items: rowsWithPayload.map((item) => {
        const property = propertyById.get(item.payload.propertyId);
        const client = item.payload.clientUserId
          ? clientById.get(item.payload.clientUserId)
          : undefined;
        const resolvedAddress =
          item.payload.addressOverride ??
          (property
            ? toPropertyAddress({
                address: property.address,
                postalCode: property.postalCode,
                city: property.city,
              })
            : null);

        return {
          id: item.row.id,
          title: item.row.title,
          propertyId: item.payload.propertyId,
          propertyTitle: property?.title ?? "Bien introuvable",
          clientUserId: item.payload.clientUserId,
          clientFirstName: client?.firstName ?? null,
          clientLastName: client?.lastName ?? null,
          address: resolvedAddress,
          comment: item.payload.comment,
          startsAt: item.row.startsAt.toISOString(),
          endsAt: item.row.endsAt.toISOString(),
          createdAt: item.row.createdAt.toISOString(),
          updatedAt: item.row.updatedAt.toISOString(),
        };
      }),
    };
  },

  async createManualAppointment(input: {
    orgId: string;
    title: string;
    propertyId: string;
    clientUserId?: string | null;
    startsAt: string;
    endsAt: string;
    address?: string | null;
    comment?: string | null;
  }) {
    const property = await assertPropertyExistsInOrg({
      orgId: input.orgId,
      propertyId: input.propertyId,
    });

    const title = normalizeOptionalString(input.title);
    if (!title) {
      throw new HttpError(400, "INVALID_APPOINTMENT_TITLE", "Le titre du rendez-vous est requis");
    }

    const startsAt = parseIsoDateTime(
      input.startsAt,
      "INVALID_APPOINTMENT_STARTS_AT",
      "La date de debut du rendez-vous est invalide",
    );
    const endsAt = parseIsoDateTime(
      input.endsAt,
      "INVALID_APPOINTMENT_ENDS_AT",
      "La date de fin du rendez-vous est invalide",
    );

    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new HttpError(
        400,
        "INVALID_APPOINTMENT_TIME_RANGE",
        "La date de fin du rendez-vous doit etre apres la date de debut",
      );
    }

    const addressOverride = normalizeOptionalString(input.address);
    const comment = normalizeOptionalString(input.comment);
    const clientUserId = normalizeOptionalString(input.clientUserId);
    const client = clientUserId
      ? await assertClientExistsInOrg({
          orgId: input.orgId,
          clientUserId,
        })
      : null;

    if (client) {
      await ensureClientLinkedToPropertyAsProspect({
        orgId: input.orgId,
        propertyId: property.id,
        clientUserId: client.id,
      });
    }

    const payload: ManualCalendarPayload = {
      kind: MANUAL_PAYLOAD_KIND,
      propertyId: property.id,
      clientUserId: client?.id ?? null,
      addressOverride,
      comment,
    };

    const now = new Date();
    const id = crypto.randomUUID();

    await db.insert(calendarEvents).values({
      id,
      orgId: input.orgId,
      provider: MANUAL_PROVIDER,
      externalId: `manual_${crypto.randomUUID()}`,
      title,
      startsAt,
      endsAt,
      payload: JSON.stringify(payload),
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      title,
      propertyId: property.id,
      propertyTitle: property.title,
      clientUserId: client?.id ?? null,
      clientFirstName: client?.firstName ?? null,
      clientLastName: client?.lastName ?? null,
      address:
        addressOverride ??
        toPropertyAddress({
          address: property.address,
          postalCode: property.postalCode,
          city: property.city,
        }),
      comment,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  },
};
