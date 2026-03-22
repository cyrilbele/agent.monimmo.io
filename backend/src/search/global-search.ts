import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { files, properties, propertyVisits, users, vocals } from "../db/schema";

export type GlobalSearchItemType = "PROPERTY" | "USER" | "VOCAL" | "VISIT";

export type GlobalSearchItem = {
  type: GlobalSearchItemType;
  id: string;
  label: string;
  subtitle: string;
  route: string;
};

type GlobalSearchRankedItem = GlobalSearchItem & {
  createdAtMs: number;
};

const normalizeSearchQuery = (value: string): string => value.trim().toLowerCase();

const toLikePattern = (value: string): string =>
  `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

const toTimestamp = (value: Date): number => value.getTime();

const toUserLabel = (input: {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}): string => {
  const fullName = `${input.firstName} ${input.lastName}`.trim();
  if (fullName) {
    return fullName;
  }

  return input.email?.trim() || input.phone?.trim() || "Contact";
};

const toUserSubtitle = (input: {
  email: string | null;
  phone: string | null;
  city: string | null;
}): string => {
  const primary = input.email?.trim() || input.phone?.trim() || "Contact";
  const city = input.city?.trim();

  if (!city) {
    return primary;
  }

  return `${primary} · ${city}`;
};

const toVisitSubtitle = (input: {
  startsAt: Date;
  prospectFirstName: string | null;
  prospectLastName: string | null;
}): string => {
  const fullName = `${input.prospectFirstName ?? ""} ${input.prospectLastName ?? ""}`.trim();
  const date = input.startsAt.toISOString().slice(0, 16).replace("T", " ");

  if (!fullName) {
    return date;
  }

  return `${fullName} · ${date}`;
};

export const globalSearchService = {
  async search(input: {
    orgId: string;
    query: string;
    limit: number;
  }): Promise<{ items: GlobalSearchItem[] }> {
    const normalized = normalizeSearchQuery(input.query);
    if (normalized.length < 2) {
      return { items: [] };
    }

    const pattern = toLikePattern(normalized);
    const perTypeLimit = Math.max(3, Math.ceil(input.limit / 4));

    const [propertyRows, userRows, vocalRows, visitRows] = await Promise.all([
      db
        .select({
          id: properties.id,
          title: properties.title,
          city: properties.city,
          postalCode: properties.postalCode,
          address: properties.address,
          createdAt: properties.createdAt,
        })
        .from(properties)
        .where(
          and(
            eq(properties.orgId, input.orgId),
            or(
              like(sql`lower(${properties.title})`, pattern),
              like(sql`lower(${properties.city})`, pattern),
              like(sql`lower(${properties.postalCode})`, pattern),
              like(sql`lower(coalesce(${properties.address}, ''))`, pattern),
            ),
          ),
        )
        .orderBy(desc(properties.createdAt))
        .limit(perTypeLimit),
      db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
          city: users.city,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(
          and(
            eq(users.orgId, input.orgId),
            or(
              like(sql`lower(${users.firstName})`, pattern),
              like(sql`lower(${users.lastName})`, pattern),
              like(sql`lower(coalesce(${users.email}, ''))`, pattern),
              like(sql`lower(coalesce(${users.phone}, ''))`, pattern),
              like(sql`lower(coalesce(${users.city}, ''))`, pattern),
            ),
          ),
        )
        .orderBy(desc(users.createdAt))
        .limit(perTypeLimit),
      db
        .select({
          id: vocals.id,
          transcript: vocals.transcript,
          summary: vocals.summary,
          createdAt: vocals.createdAt,
          fileName: files.fileName,
          propertyTitle: properties.title,
        })
        .from(vocals)
        .leftJoin(files, and(eq(files.id, vocals.fileId), eq(files.orgId, input.orgId)))
        .leftJoin(
          properties,
          and(eq(properties.id, vocals.propertyId), eq(properties.orgId, input.orgId)),
        )
        .where(
          and(
            eq(vocals.orgId, input.orgId),
            or(
              like(sql`lower(coalesce(${vocals.transcript}, ''))`, pattern),
              like(sql`lower(coalesce(${vocals.summary}, ''))`, pattern),
              like(sql`lower(coalesce(${files.fileName}, ''))`, pattern),
              like(sql`lower(coalesce(${properties.title}, ''))`, pattern),
            ),
          ),
        )
        .orderBy(desc(vocals.createdAt))
        .limit(perTypeLimit),
      db
        .select({
          id: propertyVisits.id,
          createdAt: propertyVisits.createdAt,
          startsAt: propertyVisits.startsAt,
          propertyTitle: properties.title,
          prospectFirstName: users.firstName,
          prospectLastName: users.lastName,
        })
        .from(propertyVisits)
        .innerJoin(
          properties,
          and(
            eq(propertyVisits.propertyId, properties.id),
            eq(properties.orgId, input.orgId),
          ),
        )
        .leftJoin(
          users,
          and(eq(propertyVisits.prospectUserId, users.id), eq(users.orgId, input.orgId)),
        )
        .where(
          and(
            eq(propertyVisits.orgId, input.orgId),
            or(
              like(sql`lower(${properties.title})`, pattern),
              like(sql`lower(coalesce(${users.firstName}, ''))`, pattern),
              like(sql`lower(coalesce(${users.lastName}, ''))`, pattern),
              like(sql`lower(coalesce(${users.email}, ''))`, pattern),
            ),
          ),
        )
        .orderBy(desc(propertyVisits.createdAt))
        .limit(perTypeLimit),
    ]);

    const ranked: GlobalSearchRankedItem[] = [
      ...propertyRows.map((row) => ({
        type: "PROPERTY" as const,
        id: row.id,
        label: row.title,
        subtitle: `${row.postalCode} ${row.city}${row.address ? ` · ${row.address}` : ""}`.trim(),
        route: `/app/bien/${encodeURIComponent(row.id)}`,
        createdAtMs: toTimestamp(row.createdAt),
      })),
      ...userRows.map((row) => ({
        type: "USER" as const,
        id: row.id,
        label: toUserLabel(row),
        subtitle: toUserSubtitle(row),
        route: `/app/utilisateurs/${encodeURIComponent(row.id)}`,
        createdAtMs: toTimestamp(row.createdAt),
      })),
      ...vocalRows.map((row) => ({
        type: "VOCAL" as const,
        id: row.id,
        label: row.propertyTitle?.trim() ? `Vocal · ${row.propertyTitle}` : "Vocal",
        subtitle: row.summary?.trim() || row.transcript?.trim() || row.fileName || "Vocal",
        route: `/app/vocaux/${encodeURIComponent(row.id)}`,
        createdAtMs: toTimestamp(row.createdAt),
      })),
      ...visitRows.map((row) => ({
        type: "VISIT" as const,
        id: row.id,
        label: `Visite · ${row.propertyTitle}`,
        subtitle: toVisitSubtitle(row),
        route: `/app/rdv/${encodeURIComponent(row.id)}`,
        createdAtMs: toTimestamp(row.createdAt),
      })),
    ]
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, input.limit);

    return {
      items: ranked.map(({ createdAtMs: _createdAtMs, ...item }) => item),
    };
  },
};
