import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "../db/client";
import { calendarEvents, properties, users } from "../db/schema";
import { HttpError } from "../http/errors";
import {
  trackObjectChangesSafe,
  type ObjectChangeMode,
} from "../object-data/change-log";

type ManualCalendarPayload = {
  kind: "MANUAL_APPOINTMENT";
  propertyId: string;
  userId: string | null;
  addressOverride: string | null;
  comment: string | null;
};

type ManualCalendarData = {
  title: string;
  propertyId: string;
  userId: string | null;
  startsAt: string;
  endsAt: string;
  address: string | null;
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

const parseJsonRecord = (raw: string | null): Record<string, unknown> => {
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const toIsoDateTimeString = (value: unknown): string | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const asDate = new Date(value);
    return Number.isNaN(asDate.getTime()) ? null : asDate.toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) {
      const asNumberDate = new Date(asNumber);
      if (!Number.isNaN(asNumberDate.getTime())) {
        return asNumberDate.toISOString();
      }
    }

    const asDate = new Date(trimmed);
    return Number.isNaN(asDate.getTime()) ? null : asDate.toISOString();
  }

  return null;
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
      userId: normalizeOptionalString(parsed.userId),
      addressOverride: normalizeOptionalString(parsed.addressOverride),
      comment: normalizeOptionalString(parsed.comment),
    };
  } catch {
    return null;
  }
};

const parseManualData = (input: {
  rawData: string | null;
  rawPayload: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date;
}): ManualCalendarData | null => {
  const data = parseJsonRecord(input.rawData);
  const payload = parseManualPayload(input.rawPayload);
  const propertyId =
    normalizeOptionalString(data.propertyId) ??
    payload?.propertyId ??
    null;

  if (!propertyId) {
    return null;
  }

  return {
    title: normalizeOptionalString(data.title) ?? normalizeOptionalString(input.title) ?? "Rendez-vous",
    propertyId,
    userId:
      normalizeOptionalString(data.userId) ?? payload?.userId ?? null,
    startsAt: toIsoDateTimeString(data.startsAt) ?? input.startsAt.toISOString(),
    endsAt: toIsoDateTimeString(data.endsAt) ?? input.endsAt.toISOString(),
    address:
      normalizeOptionalString(data.address) ??
      payload?.addressOverride ??
      null,
    comment:
      normalizeOptionalString(data.comment) ??
      payload?.comment ??
      null,
  };
};

const serializeManualData = (data: ManualCalendarData): string =>
  JSON.stringify({
    title: data.title,
    propertyId: data.propertyId,
    userId: data.userId,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    address: data.address,
    comment: data.comment,
  });

const assertPropertyExistsInOrg = async (input: { orgId: string; propertyId: string }) => {
  const property = await db.query.properties.findFirst({
    where: and(eq(properties.id, input.propertyId), eq(properties.orgId, input.orgId)),
  });

  if (!property) {
    throw new HttpError(404, "PROPERTY_NOT_FOUND", "Bien introuvable");
  }

  return property;
};

const assertUserExistsInOrg = async (input: { orgId: string; userId: string }) => {
  const user = await db.query.users.findFirst({
    where: and(eq(users.id, input.userId), eq(users.orgId, input.orgId)),
  });

  if (!user) {
    throw new HttpError(404, "USER_NOT_FOUND", "Utilisateur introuvable");
  }

  if (user.accountType !== "CLIENT") {
    throw new HttpError(
      400,
      "USER_MUST_BE_VALID",
      "Le participant doit etre un utilisateur valide",
    );
  }

  return user;
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
        data: calendarEvents.data,
        createdAt: calendarEvents.createdAt,
        updatedAt: calendarEvents.updatedAt,
      })
      .from(calendarEvents)
      .where(and(...filters))
      .orderBy(calendarEvents.startsAt);

    const rowsWithData = rows
      .map((row) => ({
        row,
        data: parseManualData({
          rawData: row.data,
          rawPayload: row.payload,
          title: row.title,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
        }),
      }))
      .filter(
        (item): item is { row: (typeof rows)[number]; data: ManualCalendarData } =>
          item.data !== null,
      );

    const propertyIds = Array.from(
      new Set(rowsWithData.map((item) => item.data.propertyId)),
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
    const userIds = Array.from(
      new Set(
        rowsWithData
          .map((item) => item.data.userId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );

    const userRows =
      userIds.length > 0
      ? await db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            data: users.data,
          })
          .from(users)
          .where(and(eq(users.orgId, input.orgId), inArray(users.id, userIds)))
        : [];
    const userById = new Map(
      userRows.map((client) => {
        const clientData = parseJsonRecord(client.data);
        return [
          client.id,
          {
            firstName:
              normalizeOptionalString(clientData.firstName) ??
              normalizeOptionalString(client.firstName) ??
              null,
            lastName:
              normalizeOptionalString(clientData.lastName) ??
              normalizeOptionalString(client.lastName) ??
              null,
          },
        ] as const;
      }),
    );

    return {
      items: rowsWithData.map((item) => {
        const property = propertyById.get(item.data.propertyId);
        const linkedUser = item.data.userId
          ? userById.get(item.data.userId)
          : undefined;
        const resolvedAddress =
          item.data.address ??
          (property
            ? toPropertyAddress({
                address: property.address,
                postalCode: property.postalCode,
                city: property.city,
              })
            : null);

        return {
          id: item.row.id,
          title: item.data.title,
          propertyId: item.data.propertyId,
          propertyTitle: property?.title ?? "Bien introuvable",
          userId: item.data.userId,
          userFirstName: linkedUser?.firstName ?? null,
          userLastName: linkedUser?.lastName ?? null,
          address: resolvedAddress,
          comment: item.data.comment,
          startsAt: item.data.startsAt,
          endsAt: item.data.endsAt,
          createdAt: item.row.createdAt.toISOString(),
          updatedAt: item.row.updatedAt.toISOString(),
        };
      }),
    };
  },

  async getManualAppointmentById(input: {
    orgId: string;
    id: string;
  }) {
    const row = await db.query.calendarEvents.findFirst({
      where: and(
        eq(calendarEvents.id, input.id),
        eq(calendarEvents.orgId, input.orgId),
        eq(calendarEvents.provider, MANUAL_PROVIDER),
      ),
    });

    if (!row) {
      throw new HttpError(404, "CALENDAR_APPOINTMENT_NOT_FOUND", "Rendez-vous introuvable");
    }

    const listed = await this.listManualAppointments({
      orgId: input.orgId,
      from: new Date(row.startsAt.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      to: new Date(row.endsAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const found = listed.items.find((item) => item.id === input.id);
    if (!found) {
      throw new HttpError(404, "CALENDAR_APPOINTMENT_NOT_FOUND", "Rendez-vous introuvable");
    }

    return found;
  },

  async patchManualAppointmentComment(input: {
    orgId: string;
    id: string;
    comment?: string | null;
    changeMode?: ObjectChangeMode;
  }) {
    const row = await db.query.calendarEvents.findFirst({
      where: and(
        eq(calendarEvents.id, input.id),
        eq(calendarEvents.orgId, input.orgId),
        eq(calendarEvents.provider, MANUAL_PROVIDER),
      ),
    });

    if (!row) {
      throw new HttpError(404, "CALENDAR_APPOINTMENT_NOT_FOUND", "Rendez-vous introuvable");
    }

    const parsedData = parseManualData({
      rawData: row.data,
      rawPayload: row.payload,
      title: row.title,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    });
    if (!parsedData) {
      throw new HttpError(
        400,
        "INVALID_CALENDAR_APPOINTMENT_DATA",
        "Données rendez-vous invalides",
      );
    }

    const nextData: ManualCalendarData = {
      ...parsedData,
      comment: normalizeOptionalString(input.comment),
    };
    const nextPayload: ManualCalendarPayload = {
      kind: MANUAL_PAYLOAD_KIND,
      propertyId: nextData.propertyId,
      userId: nextData.userId,
      addressOverride: nextData.address,
      comment: nextData.comment,
    };

    const modifiedAt = new Date();
    await db
      .update(calendarEvents)
      .set({
        title: nextData.title,
        startsAt: new Date(nextData.startsAt),
        endsAt: new Date(nextData.endsAt),
        payload: JSON.stringify(nextPayload),
        data: serializeManualData(nextData),
        updatedAt: modifiedAt,
      })
      .where(and(eq(calendarEvents.id, input.id), eq(calendarEvents.orgId, input.orgId)));

    const updated = await this.getManualAppointmentById({
      orgId: input.orgId,
      id: input.id,
    });

    await trackObjectChangesSafe({
      orgId: input.orgId,
      objectType: "rdv",
      objectId: updated.id,
      mode: input.changeMode ?? "USER",
      changes: [
        {
          paramName: "comment",
          paramValue: updated.comment,
        },
      ],
      modifiedAt,
    });

    return updated;
  },

  async createManualAppointment(input: {
    orgId: string;
    title: string;
    propertyId: string;
    userId?: string | null;
    startsAt: string;
    endsAt: string;
    address?: string | null;
    comment?: string | null;
    changeMode?: ObjectChangeMode;
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
    const userId = normalizeOptionalString(input.userId);
    const linkedUser = userId
      ? await assertUserExistsInOrg({
          orgId: input.orgId,
          userId,
        })
      : null;

    const payload: ManualCalendarPayload = {
      kind: MANUAL_PAYLOAD_KIND,
      propertyId: property.id,
      userId: linkedUser?.id ?? null,
      addressOverride,
      comment,
    };
    const data: ManualCalendarData = {
      title,
      propertyId: property.id,
      userId: linkedUser?.id ?? null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      address: addressOverride,
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
      data: serializeManualData(data),
      createdAt: now,
      updatedAt: now,
    });

    const created = {
      id,
      title,
      propertyId: property.id,
      propertyTitle: property.title,
      userId: linkedUser?.id ?? null,
      userFirstName: linkedUser?.firstName ?? null,
      userLastName: linkedUser?.lastName ?? null,
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

    await trackObjectChangesSafe({
      orgId: input.orgId,
      objectType: "rdv",
      objectId: created.id,
      mode: input.changeMode ?? "USER",
      changes: [
        { paramName: "title", paramValue: created.title },
        { paramName: "propertyId", paramValue: created.propertyId },
        { paramName: "userId", paramValue: created.userId },
        { paramName: "startsAt", paramValue: created.startsAt },
        { paramName: "endsAt", paramValue: created.endsAt },
        { paramName: "address", paramValue: created.address },
        { paramName: "comment", paramValue: created.comment },
      ].filter((change) => change.paramValue !== null && change.paramValue !== undefined && change.paramValue !== ""),
      modifiedAt: now,
    });

    return created;
  },
};
