import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { businessLinks, properties, users } from "../db/schema";
import { HttpError } from "../http/errors";
import {
  trackObjectChangesSafe,
  type ObjectChangeMode,
} from "../object-data/change-log";
import { getSearchEngine } from "../search/factory";

type UserRow = typeof users.$inferSelect;
const searchEngine = getSearchEngine();

type AccountType = "AGENT" | "CLIENT" | "NOTAIRE";

type UserBusinessData = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  personalNotes: string | null;
  accountType: AccountType;
};

type LinkedProperty = {
  propertyId: string;
  title: string;
  city: string;
  postalCode: string;
  status: string;
  relationRole: string;
  source: "BUSINESS_LINK";
};

type ListUsersInput = {
  orgId: string;
  limit: number;
  cursor?: string;
  query?: string;
  accountType?: AccountType;
};

type CreateUserInput = {
  orgId: string;
  changeMode?: ObjectChangeMode;
  data: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    personalNotes?: string | null;
    accountType: AccountType;
  };
};

type PatchUserInput = {
  orgId: string;
  id: string;
  changeMode?: ObjectChangeMode;
  data: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    personalNotes?: string | null;
    accountType?: AccountType;
  };
};

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

const normalizeNullableEmail = (
  value: string | null | undefined,
): string | null | undefined => {
  const normalized = normalizeOptionalString(value);
  if (normalized === undefined) {
    return undefined;
  }

  if (normalized === null) {
    return null;
  }

  return normalized.toLowerCase();
};

const resolveRoleFromAccountType = (accountType: AccountType): string => {
  switch (accountType) {
    case "AGENT":
      return "AGENT";
    case "NOTAIRE":
      return "NOTAIRE";
    default:
      return "OWNER";
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const parseUserData = (raw: string | null): Record<string, unknown> => {
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

const resolveAccountType = (value: unknown, fallback: AccountType): AccountType => {
  if (value === "AGENT" || value === "CLIENT" || value === "NOTAIRE") {
    return value;
  }

  return fallback;
};

const resolveBusinessDataFromRow = (row: UserRow): UserBusinessData => {
  const parsed = parseUserData(row.data);
  const fallbackAccountType = resolveAccountType(row.accountType, "CLIENT");

  const firstName =
    normalizeOptionalString(
      typeof parsed.firstName === "string" ? parsed.firstName : row.firstName,
    ) ?? "";
  const lastName =
    normalizeOptionalString(typeof parsed.lastName === "string" ? parsed.lastName : row.lastName) ??
    "";

  return {
    firstName,
    lastName,
    email: normalizeNullableEmail(
      typeof parsed.email === "string" || parsed.email === null ? parsed.email : row.email,
    ) ?? null,
    phone:
      normalizeOptionalString(
        typeof parsed.phone === "string" || parsed.phone === null ? parsed.phone : row.phone,
      ) ?? null,
    address:
      normalizeOptionalString(
        typeof parsed.address === "string" || parsed.address === null
          ? parsed.address
          : row.address,
      ) ?? null,
    postalCode:
      normalizeOptionalString(
        typeof parsed.postalCode === "string" || parsed.postalCode === null
          ? parsed.postalCode
          : row.postalCode,
      ) ?? null,
    city:
      normalizeOptionalString(
        typeof parsed.city === "string" || parsed.city === null ? parsed.city : row.city,
      ) ?? null,
    personalNotes:
      normalizeOptionalString(
        typeof parsed.personalNotes === "string" || parsed.personalNotes === null
          ? parsed.personalNotes
          : row.personalNotes,
      ) ?? null,
    accountType: resolveAccountType(parsed.accountType, fallbackAccountType),
  };
};

const serializeBusinessData = (data: UserBusinessData): string =>
  JSON.stringify({
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
    address: data.address,
    postalCode: data.postalCode,
    city: data.city,
    personalNotes: data.personalNotes,
    accountType: data.accountType,
  });

const generateRandomPassword = (): string => {
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(randomBytes).toString("base64url");
};

const toAccountUserResponse = (row: UserRow) => {
  const businessData = resolveBusinessDataFromRow(row);

  return {
    id: row.id,
    email: businessData.email,
    firstName: businessData.firstName,
    lastName: businessData.lastName,
    orgId: row.orgId,
    accountType: businessData.accountType,
    role: row.role,
    phone: businessData.phone,
    address: businessData.address,
    postalCode: businessData.postalCode,
    city: businessData.city,
    personalNotes: businessData.personalNotes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
};

const isTrackableValue = (value: unknown): boolean => {
  if (value === null || typeof value === "undefined") {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return true;
};

const updateUserSearchDocumentSafe = async (user: UserRow): Promise<void> => {
  try {
    await searchEngine.upsertUserDocument(user);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Search][users] impossible de synchroniser le document utilisateur ${user.id}: ${message}`);
  }
};

const listLinkedPropertiesForUsers = async (
  orgId: string,
  userIds: readonly string[],
): Promise<Map<string, LinkedProperty[]>> => {
  if (userIds.length === 0) {
    return new Map();
  }

  const directLinks = await db
    .select({
      userId: businessLinks.objectId2,
      propertyId: properties.id,
      title: properties.title,
      city: properties.city,
      postalCode: properties.postalCode,
      status: properties.status,
      relationRole: sql<string>`coalesce(json_extract(${businessLinks.params}, '$.relationRole'), 'PROSPECT')`,
      source: sql<"BUSINESS_LINK">`'BUSINESS_LINK'`,
    })
    .from(businessLinks)
    .innerJoin(
      properties,
      and(eq(businessLinks.objectId1, properties.id), eq(properties.orgId, orgId)),
    )
    .where(
      and(
        eq(businessLinks.orgId, orgId),
        eq(businessLinks.typeLien, "bien_user"),
        inArray(businessLinks.objectId2, userIds),
      ),
    );

  const grouped = new Map<string, Map<string, LinkedProperty>>();

  for (const link of directLinks) {
    const userMap = grouped.get(link.userId) ?? new Map<string, LinkedProperty>();
    const current = userMap.get(link.propertyId);

    if (!current || current.relationRole !== "OWNER") {
      userMap.set(link.propertyId, {
        propertyId: link.propertyId,
        title: link.title,
        city: link.city,
        postalCode: link.postalCode,
        status: link.status,
        relationRole: link.relationRole,
        source: link.source,
      });
    }

    grouped.set(link.userId, userMap);
  }

  const output = new Map<string, LinkedProperty[]>();

  for (const [userId, linksMap] of grouped.entries()) {
    output.set(
      userId,
      [...linksMap.values()].sort((a, b) => a.title.localeCompare(b.title, "fr")),
    );
  }

  return output;
};

export const usersService = {
  async list(input: ListUsersInput) {
    const cursorValue = parseCursor(input.cursor);
    const clauses = [eq(users.orgId, input.orgId)];

    if (input.accountType) {
      clauses.push(eq(users.accountType, input.accountType));
    }

    const normalizedQuery = input.query?.trim();
    if (normalizedQuery) {
      const likeValue = `%${normalizedQuery.toLowerCase()}%`;
      const lexicalClause = or(
        sql`lower(coalesce(json_extract(${users.data}, '$.firstName'), ${users.firstName}, '')) like ${likeValue}`,
        sql`lower(coalesce(json_extract(${users.data}, '$.lastName'), ${users.lastName}, '')) like ${likeValue}`,
        sql`lower(coalesce(json_extract(${users.data}, '$.email'), ${users.email}, '')) like ${likeValue}`,
        sql`lower(coalesce(json_extract(${users.data}, '$.phone'), ${users.phone}, '')) like ${likeValue}`,
      )!;

      const searchMatchedIds = await searchEngine.searchUserIds({
        query: normalizedQuery,
        limit: input.limit * 5,
        orgId: input.orgId,
      });
      if (searchMatchedIds && searchMatchedIds.length > 0) {
        clauses.push(or(inArray(users.id, searchMatchedIds), lexicalClause)!);
      } else {
        clauses.push(lexicalClause);
      }
    }

    if (cursorValue) {
      clauses.push(lt(users.createdAt, new Date(cursorValue)));
    }

    const whereClause = clauses.length === 1 ? clauses[0]! : and(...clauses)!;

    const rows = await db
      .select()
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const sliced = hasMore ? rows.slice(0, input.limit) : rows;
    const lastItem = sliced.at(-1);
    const linkedByUserId = await listLinkedPropertiesForUsers(
      input.orgId,
      sliced.map((item) => item.id),
    );

    return {
      items: sliced.map((item) => ({
        ...toAccountUserResponse(item),
        linkedProperties: linkedByUserId.get(item.id) ?? [],
      })),
      nextCursor: hasMore && lastItem ? String(lastItem.createdAt.getTime()) : null,
    };
  },

  async create(input: CreateUserInput) {
    const now = new Date();
    const businessData: UserBusinessData = {
      firstName: normalizeOptionalString(input.data.firstName) ?? "",
      lastName: normalizeOptionalString(input.data.lastName) ?? "",
      email: normalizeNullableEmail(input.data.email) ?? null,
      phone: normalizeOptionalString(input.data.phone) ?? null,
      address: normalizeOptionalString(input.data.address) ?? null,
      postalCode: normalizeOptionalString(input.data.postalCode) ?? null,
      city: normalizeOptionalString(input.data.city) ?? null,
      personalNotes: normalizeOptionalString(input.data.personalNotes) ?? null,
      accountType: input.data.accountType,
    };

    if (!businessData.email && !businessData.phone) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Au moins un email ou un telephone est obligatoire",
      );
    }

    if (businessData.email) {
      const existing = await db.query.users.findFirst({
        where: eq(users.email, businessData.email),
      });

      if (existing) {
        if (existing.orgId !== input.orgId) {
          throw new HttpError(
            409,
            "EMAIL_ALREADY_USED",
            "Cet email est deja utilise dans une autre organisation",
          );
        }

        throw new HttpError(409, "EMAIL_ALREADY_USED", "Cet email est deja utilise");
      }
    }

    const id = crypto.randomUUID();
    const passwordHash = await Bun.password.hash(generateRandomPassword());

    await db.insert(users).values({
      id,
      orgId: input.orgId,
      firstName: businessData.firstName,
      lastName: businessData.lastName,
      email: businessData.email,
      phone: businessData.phone,
      address: businessData.address,
      postalCode: businessData.postalCode,
      city: businessData.city,
      personalNotes: businessData.personalNotes,
      accountType: businessData.accountType,
      data: serializeBusinessData(businessData),
      role: resolveRoleFromAccountType(businessData.accountType),
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    const created = await db.query.users.findFirst({
      where: and(eq(users.id, id), eq(users.orgId, input.orgId)),
    });
    if (created) {
      await updateUserSearchDocumentSafe(created);
    }

    const createdUser = await this.getById({
      orgId: input.orgId,
      id,
    });

    await trackObjectChangesSafe({
      orgId: input.orgId,
      objectType: "user",
      objectId: createdUser.id,
      mode: input.changeMode ?? "USER",
      changes: [
        { paramName: "firstName", paramValue: createdUser.firstName },
        { paramName: "lastName", paramValue: createdUser.lastName },
        { paramName: "email", paramValue: createdUser.email },
        { paramName: "phone", paramValue: createdUser.phone },
        { paramName: "address", paramValue: createdUser.address },
        { paramName: "postalCode", paramValue: createdUser.postalCode },
        { paramName: "city", paramValue: createdUser.city },
        { paramName: "personalNotes", paramValue: createdUser.personalNotes },
        { paramName: "accountType", paramValue: createdUser.accountType },
      ].filter((change) => isTrackableValue(change.paramValue)),
      modifiedAt: now,
    });

    return createdUser;
  },

  async getById(input: { orgId: string; id: string }) {
    const user = await db.query.users.findFirst({
      where: and(eq(users.id, input.id), eq(users.orgId, input.orgId)),
    });

    if (!user) {
      throw new HttpError(404, "USER_NOT_FOUND", "Utilisateur introuvable");
    }

    const linkedByUserId = await listLinkedPropertiesForUsers(input.orgId, [input.id]);

    return {
      ...toAccountUserResponse(user),
      linkedProperties: linkedByUserId.get(input.id) ?? [],
    };
  },

  async patchById(input: PatchUserInput) {
    const existing = await db.query.users.findFirst({
      where: and(eq(users.id, input.id), eq(users.orgId, input.orgId)),
    });

    if (!existing) {
      throw new HttpError(404, "USER_NOT_FOUND", "Utilisateur introuvable");
    }

    const existingData = resolveBusinessDataFromRow(existing);
    const normalizedEmail = normalizeNullableEmail(input.data.email);
    const nextEmail = normalizedEmail === undefined ? existingData.email : normalizedEmail;

    if (normalizedEmail !== undefined && normalizedEmail !== existingData.email) {
      if (nextEmail) {
        const userWithSameEmail = await db.query.users.findFirst({
          where: eq(users.email, nextEmail),
        });

        if (userWithSameEmail && userWithSameEmail.id !== existing.id) {
          throw new HttpError(409, "EMAIL_ALREADY_USED", "Cet email est deja utilise");
        }
      }
    }

    const normalizedPhone = normalizeOptionalString(input.data.phone);
    const nextPhone = normalizedPhone === undefined ? existingData.phone : normalizedPhone;

    if (!nextEmail && !nextPhone) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Au moins un email ou un telephone est obligatoire",
      );
    }

    const nextBusinessData: UserBusinessData = {
      firstName:
        input.data.firstName === undefined
          ? existingData.firstName
          : normalizeOptionalString(input.data.firstName) ?? "",
      lastName:
        input.data.lastName === undefined
          ? existingData.lastName
          : normalizeOptionalString(input.data.lastName) ?? "",
      email: nextEmail,
      phone: nextPhone,
      address:
        input.data.address === undefined
          ? existingData.address
          : normalizeOptionalString(input.data.address) ?? null,
      postalCode:
        input.data.postalCode === undefined
          ? existingData.postalCode
          : normalizeOptionalString(input.data.postalCode) ?? null,
      city:
        input.data.city === undefined
          ? existingData.city
          : normalizeOptionalString(input.data.city) ?? null,
      personalNotes:
        input.data.personalNotes === undefined
          ? existingData.personalNotes
          : normalizeOptionalString(input.data.personalNotes) ?? null,
      accountType: input.data.accountType ?? existingData.accountType,
    };

    await db
      .update(users)
      .set({
        firstName: nextBusinessData.firstName,
        lastName: nextBusinessData.lastName,
        email: nextBusinessData.email,
        phone: nextBusinessData.phone,
        address: nextBusinessData.address,
        postalCode: nextBusinessData.postalCode,
        city: nextBusinessData.city,
        personalNotes: nextBusinessData.personalNotes,
        accountType: nextBusinessData.accountType,
        data: serializeBusinessData(nextBusinessData),
        role: resolveRoleFromAccountType(nextBusinessData.accountType),
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, input.id), eq(users.orgId, input.orgId)));

    const updated = await db.query.users.findFirst({
      where: and(eq(users.id, input.id), eq(users.orgId, input.orgId)),
    });
    if (updated) {
      await updateUserSearchDocumentSafe(updated);
    }

    const patchedUser = await this.getById({
      orgId: input.orgId,
      id: input.id,
    });

    const changes: Array<{ paramName: string; paramValue: unknown }> = [];
    if (input.data.firstName !== undefined) {
      changes.push({ paramName: "firstName", paramValue: patchedUser.firstName });
    }
    if (input.data.lastName !== undefined) {
      changes.push({ paramName: "lastName", paramValue: patchedUser.lastName });
    }
    if (input.data.email !== undefined) {
      changes.push({ paramName: "email", paramValue: patchedUser.email });
    }
    if (input.data.phone !== undefined) {
      changes.push({ paramName: "phone", paramValue: patchedUser.phone });
    }
    if (input.data.address !== undefined) {
      changes.push({ paramName: "address", paramValue: patchedUser.address });
    }
    if (input.data.postalCode !== undefined) {
      changes.push({ paramName: "postalCode", paramValue: patchedUser.postalCode });
    }
    if (input.data.city !== undefined) {
      changes.push({ paramName: "city", paramValue: patchedUser.city });
    }
    if (input.data.personalNotes !== undefined) {
      changes.push({ paramName: "personalNotes", paramValue: patchedUser.personalNotes });
    }
    if (input.data.accountType !== undefined) {
      changes.push({ paramName: "accountType", paramValue: patchedUser.accountType });
    }

    await trackObjectChangesSafe({
      orgId: input.orgId,
      objectType: "user",
      objectId: patchedUser.id,
      mode: input.changeMode ?? "USER",
      changes: changes.filter((change) => isTrackableValue(change.paramValue)),
    });

    return patchedUser;
  },
};
