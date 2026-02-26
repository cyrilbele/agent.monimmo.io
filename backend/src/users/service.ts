import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { properties, propertyParties, propertyUserLinks, users } from "../db/schema";
import { HttpError } from "../http/errors";

type UserRow = typeof users.$inferSelect;

type AccountType = "AGENT" | "CLIENT" | "NOTAIRE";

type LinkedProperty = {
  propertyId: string;
  title: string;
  city: string;
  postalCode: string;
  status: string;
  relationRole: string;
  source: "USER_LINK" | "PARTY_LINK";
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
  data: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    accountType: AccountType;
  };
};

type PatchUserInput = {
  orgId: string;
  id: string;
  data: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
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

const generateRandomPassword = (): string => {
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(randomBytes).toString("base64url");
};

const toAccountUserResponse = (row: UserRow) => ({
  id: row.id,
  email: row.email,
  firstName: row.firstName,
  lastName: row.lastName,
  orgId: row.orgId,
  accountType: row.accountType as AccountType,
  role: row.role,
  phone: row.phone,
  address: row.address,
  postalCode: row.postalCode,
  city: row.city,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const listLinkedPropertiesForUsers = async (
  orgId: string,
  userIds: readonly string[],
): Promise<Map<string, LinkedProperty[]>> => {
  if (userIds.length === 0) {
    return new Map();
  }

  const [directLinks, partyLinks] = await Promise.all([
    db
      .select({
        userId: propertyUserLinks.userId,
        propertyId: properties.id,
        title: properties.title,
        city: properties.city,
        postalCode: properties.postalCode,
        status: properties.status,
        relationRole: propertyUserLinks.role,
        source: sql<"USER_LINK">`'USER_LINK'`,
      })
      .from(propertyUserLinks)
      .innerJoin(
        properties,
        and(
          eq(propertyUserLinks.propertyId, properties.id),
          eq(properties.orgId, orgId),
        ),
      )
      .where(
        and(eq(propertyUserLinks.orgId, orgId), inArray(propertyUserLinks.userId, userIds)),
      ),
    db
      .select({
        userId: propertyParties.contactId,
        propertyId: properties.id,
        title: properties.title,
        city: properties.city,
        postalCode: properties.postalCode,
        status: properties.status,
        relationRole: propertyParties.role,
        source: sql<"PARTY_LINK">`'PARTY_LINK'`,
      })
      .from(propertyParties)
      .innerJoin(
        properties,
        and(eq(propertyParties.propertyId, properties.id), eq(properties.orgId, orgId)),
      )
      .where(
        and(eq(propertyParties.orgId, orgId), inArray(propertyParties.contactId, userIds)),
      ),
  ]);

  const grouped = new Map<string, Map<string, LinkedProperty>>();

  for (const link of [...directLinks, ...partyLinks]) {
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

    const normalizedQuery = input.query?.trim().toLowerCase();
    if (normalizedQuery) {
      const likeValue = `%${normalizedQuery}%`;
      clauses.push(
        or(
          sql`lower(${users.firstName}) like ${likeValue}`,
          sql`lower(${users.lastName}) like ${likeValue}`,
          sql`lower(coalesce(${users.email}, '')) like ${likeValue}`,
          sql`lower(coalesce(${users.phone}, '')) like ${likeValue}`,
        )!,
      );
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
    const normalizedEmail = normalizeNullableEmail(input.data.email) ?? null;
    const normalizedPhone = normalizeOptionalString(input.data.phone) ?? null;

    if (!normalizedEmail && !normalizedPhone) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Au moins un email ou un telephone est obligatoire",
      );
    }

    if (normalizedEmail) {
      const existing = await db.query.users.findFirst({
        where: eq(users.email, normalizedEmail),
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
      firstName: normalizeOptionalString(input.data.firstName) ?? "",
      lastName: normalizeOptionalString(input.data.lastName) ?? "",
      email: normalizedEmail,
      phone: normalizedPhone,
      address: normalizeOptionalString(input.data.address) ?? null,
      postalCode: normalizeOptionalString(input.data.postalCode) ?? null,
      city: normalizeOptionalString(input.data.city) ?? null,
      accountType: input.data.accountType,
      role: resolveRoleFromAccountType(input.data.accountType),
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    return this.getById({
      orgId: input.orgId,
      id,
    });
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

    const normalizedEmail = normalizeNullableEmail(input.data.email);

    if (normalizedEmail !== undefined && normalizedEmail !== existing.email) {
      if (normalizedEmail) {
        const userWithSameEmail = await db.query.users.findFirst({
          where: eq(users.email, normalizedEmail),
        });

        if (userWithSameEmail && userWithSameEmail.id !== existing.id) {
          throw new HttpError(409, "EMAIL_ALREADY_USED", "Cet email est deja utilise");
        }
      }
    }

    const normalizedPhone = normalizeOptionalString(input.data.phone);
    const normalizedAddress = normalizeOptionalString(input.data.address);
    const normalizedPostalCode = normalizeOptionalString(input.data.postalCode);
    const normalizedCity = normalizeOptionalString(input.data.city);
    const nextAccountType = input.data.accountType ?? (existing.accountType as AccountType);
    const nextEmail = normalizedEmail === undefined ? existing.email : normalizedEmail;
    const nextPhone = normalizedPhone === undefined ? existing.phone : normalizedPhone;

    if (!nextEmail && !nextPhone) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Au moins un email ou un telephone est obligatoire",
      );
    }

    await db
      .update(users)
      .set({
        firstName:
          input.data.firstName === undefined
            ? existing.firstName
            : normalizeOptionalString(input.data.firstName) ?? "",
        lastName:
          input.data.lastName === undefined
            ? existing.lastName
            : normalizeOptionalString(input.data.lastName) ?? "",
        email: nextEmail,
        phone: nextPhone,
        address: normalizedAddress === undefined ? existing.address : normalizedAddress,
        postalCode:
          normalizedPostalCode === undefined ? existing.postalCode : normalizedPostalCode,
        city: normalizedCity === undefined ? existing.city : normalizedCity,
        accountType: nextAccountType,
        role:
          input.data.accountType === undefined
            ? existing.role
            : resolveRoleFromAccountType(nextAccountType),
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, input.id), eq(users.orgId, input.orgId)));

    return this.getById({
      orgId: input.orgId,
      id: input.id,
    });
  },
};
