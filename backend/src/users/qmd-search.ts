import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { properties, propertyParties, propertyUserLinks, users } from "../db/schema";
import {
  ensureQmdRuntimeDirectories,
  QMD_WORKSPACE_ROOT_DIR,
  runQmdCommand,
  withQmdGlobalLock,
} from "../qmd/command";

type UserRow = typeof users.$inferSelect;

type LinkedProperty = {
  propertyId: string;
  title: string;
  city: string;
  postalCode: string;
  status: string;
  relationRole: string;
  source: "USER_LINK" | "PARTY_LINK";
};

type FlatEntry = {
  key: string;
  value: string;
};

type QmdOrgState = {
  collectionReady: boolean;
  fullSyncDone: boolean;
  indexDirty: boolean;
};

const QMD_DOCS_BASE_DIRECTORY = resolve(QMD_WORKSPACE_ROOT_DIR, "data/qmd/users");
const QMD_COLLECTION_NAME_PREFIX = "monimmo-users";
const QMD_MAX_RESULTS = 500;

const qmdStateByOrgId = new Map<string, QmdOrgState>();

const getQmdState = (orgId: string): QmdOrgState => {
  const current = qmdStateByOrgId.get(orgId);
  if (current) {
    return current;
  }

  const initialized: QmdOrgState = {
    collectionReady: false,
    fullSyncDone: false,
    indexDirty: true,
  };
  qmdStateByOrgId.set(orgId, initialized);
  return initialized;
};

const toOrgScopeToken = (orgId: string): string =>
  createHash("sha256").update(orgId).digest("hex");

const toOrgDirectoryName = (orgId: string): string => `org-${toOrgScopeToken(orgId)}`;

export const userQmdDocsDirectoryForOrg = (orgId: string): string =>
  resolve(QMD_DOCS_BASE_DIRECTORY, toOrgDirectoryName(orgId));

export const userQmdCollectionNameForOrg = (orgId: string): string =>
  `${QMD_COLLECTION_NAME_PREFIX}-${toOrgScopeToken(orgId)}`;

const ensureQmdDirectories = (orgId: string): void => {
  mkdirSync(userQmdDocsDirectoryForOrg(orgId), { recursive: true });
  ensureQmdRuntimeDirectories();
};

const normalizeStringValue = (value: string): string => {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact || "non renseigne";
};

const formatFlatValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "non renseigne";
  }

  if (typeof value === "string") {
    return normalizeStringValue(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "non renseigne";
  }

  if (typeof value === "boolean") {
    return value ? "oui" : "non";
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "non renseigne" : value.toISOString();
  }

  return normalizeStringValue(String(value));
};

const flattenValue = (value: unknown, keyPath: string, entries: FlatEntry[]): void => {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      entries.push({ key: keyPath, value: "[]" });
      return;
    }

    const allScalars = value.every(
      (item) =>
        item === null ||
        item === undefined ||
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean" ||
        item instanceof Date,
    );
    if (allScalars) {
      entries.push({
        key: keyPath,
        value: value.map((item) => formatFlatValue(item)).join(" | "),
      });
      return;
    }

    value.forEach((item, index) => {
      flattenValue(item, `${keyPath}[${index}]`, entries);
    });
    return;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const recordEntries = Object.entries(record);
    if (recordEntries.length === 0) {
      entries.push({ key: keyPath, value: "{}" });
      return;
    }

    for (const [childKey, childValue] of recordEntries) {
      const nextKeyPath = keyPath ? `${keyPath}.${childKey}` : childKey;
      flattenValue(childValue, nextKeyPath, entries);
    }
    return;
  }

  entries.push({
    key: keyPath,
    value: formatFlatValue(value),
  });
};

const toDocumentFileName = (userId: string): string => {
  const encodedId = Buffer.from(userId, "utf8").toString("hex");
  return `user-${encodedId}.md`;
};

const fromDocumentFileName = (fileName: string): string | null => {
  if (!fileName.startsWith("user-") || !fileName.endsWith(".md")) {
    return null;
  }

  const encodedId = fileName.slice("user-".length, -".md".length);
  if (encodedId.length === 0 || encodedId.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(encodedId)) {
    return null;
  }

  try {
    return Buffer.from(encodedId, "hex").toString("utf8");
  } catch {
    return null;
  }
};

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
          eq(propertyUserLinks.orgId, properties.orgId),
        ),
      )
      .where(and(eq(propertyUserLinks.orgId, orgId), inArray(propertyUserLinks.userId, userIds))),
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
        and(eq(propertyParties.propertyId, properties.id), eq(propertyParties.orgId, properties.orgId)),
      )
      .where(and(eq(propertyParties.orgId, orgId), inArray(propertyParties.contactId, userIds))),
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

const ensureQmdCollection = async (orgId: string): Promise<boolean> => {
  const state = getQmdState(orgId);
  if (state.collectionReady) {
    return true;
  }

  ensureQmdDirectories(orgId);

  const collectionName = userQmdCollectionNameForOrg(orgId);
  const docsDirectory = userQmdDocsDirectoryForOrg(orgId);

  const showResult = await runQmdCommand(["collection", "show", collectionName], {
    allowFailure: true,
  });
  if (showResult.exitCode === 0) {
    state.collectionReady = true;
    return true;
  }

  const addResult = await runQmdCommand(
    [
      "collection",
      "add",
      docsDirectory,
      "--name",
      collectionName,
      "--mask",
      "**/*.md",
    ],
    { allowFailure: true },
  );
  if (addResult.exitCode === 0) {
    state.collectionReady = true;
    state.indexDirty = true;
    return true;
  }

  const alreadyExists =
    addResult.stderr.includes("already exists") ||
    addResult.stdout.includes("already exists");
  if (alreadyExists) {
    state.collectionReady = true;
    return true;
  }

  return false;
};

const writeUserDocumentFile = (user: UserRow, linkedProperties: LinkedProperty[]): string => {
  ensureQmdDirectories(user.orgId);
  const fileName = toDocumentFileName(user.id);
  const filePath = resolve(userQmdDocsDirectoryForOrg(user.orgId), fileName);
  writeFileSync(filePath, buildUserQmdDocument(user, linkedProperties), "utf8");
  return fileName;
};

const syncAllUserDocuments = async (orgId: string): Promise<void> => {
  const state = getQmdState(orgId);
  if (state.fullSyncDone) {
    return;
  }

  const rows = await db.select().from(users).where(eq(users.orgId, orgId));
  const linkedByUserId = await listLinkedPropertiesForUsers(
    orgId,
    rows.map((row) => row.id),
  );
  const expectedFileNames = new Set<string>();

  for (const row of rows) {
    expectedFileNames.add(writeUserDocumentFile(row, linkedByUserId.get(row.id) ?? []));
  }

  const docsDirectory = userQmdDocsDirectoryForOrg(orgId);
  for (const fileName of readdirSync(docsDirectory)) {
    if (!fileName.endsWith(".md")) {
      continue;
    }

    if (!expectedFileNames.has(fileName)) {
      unlinkSync(resolve(docsDirectory, fileName));
    }
  }

  state.fullSyncDone = true;
  state.indexDirty = true;
};

const refreshQmdIndexIfNeeded = async (orgId: string): Promise<boolean> => {
  const state = getQmdState(orgId);
  if (!state.indexDirty) {
    return true;
  }

  const updateResult = await runQmdCommand(["update"], { allowFailure: true });
  if (updateResult.exitCode !== 0) {
    return false;
  }

  state.indexDirty = false;
  return true;
};

export const extractUserIdsFromQmdSearchResult = (jsonOutput: string, orgId: string): string[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonOutput);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const collectionName = userQmdCollectionNameForOrg(orgId);
  const prefix = `qmd://${collectionName}/`;
  const ids = new Set<string>();

  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const file = (item as { file?: unknown }).file;
    if (typeof file !== "string" || !file.startsWith(prefix)) {
      continue;
    }

    const relativePath = file.slice(prefix.length);
    const fileName = basename(relativePath);
    const userId = fromDocumentFileName(fileName);
    if (!userId) {
      continue;
    }

    ids.add(userId);
  }

  return [...ids];
};

export const buildUserQmdDocument = (
  user: UserRow,
  linkedProperties: LinkedProperty[],
): string => {
  const fullName = `${user.firstName} ${user.lastName}`.trim() || "Sans nom";
  const flattenedEntries: FlatEntry[] = [];
  const flatSource: Record<string, unknown> = {
    id: user.id,
    orgId: user.orgId,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName,
    email: user.email,
    phone: user.phone,
    address: user.address,
    postalCode: user.postalCode,
    city: user.city,
    personalNotes: user.personalNotes,
    accountType: user.accountType,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    linkedProperties,
  };

  for (const [key, value] of Object.entries(flatSource)) {
    flattenValue(value, key, flattenedEntries);
  }

  const lines: string[] = [
    `# Utilisateur - ${fullName}`,
    "",
    "## Resume",
    `- Nom complet: ${normalizeStringValue(fullName)}`,
    `- Type de compte: ${normalizeStringValue(String(user.accountType))}`,
    `- Email: ${formatFlatValue(user.email)}`,
    `- Telephone: ${formatFlatValue(user.phone)}`,
    `- Ville: ${formatFlatValue(user.city)}`,
    "",
    "## Parametres de l'utilisateur (cle / valeur)",
  ];

  for (const entry of flattenedEntries) {
    lines.push(`- \`${entry.key}\`: ${entry.value}`);
  }

  lines.push("");
  return lines.join("\n");
};

export const upsertUserQmdDocument = async (user: UserRow): Promise<void> =>
  withQmdGlobalLock(async () => {
    const collectionAvailable = await ensureQmdCollection(user.orgId);
    if (!collectionAvailable) {
      return;
    }

    const linkedByUserId = await listLinkedPropertiesForUsers(user.orgId, [user.id]);
    writeUserDocumentFile(user, linkedByUserId.get(user.id) ?? []);
    const state = getQmdState(user.orgId);
    state.indexDirty = true;
  });

export const searchUserIdsWithQmd = async (
  query: string,
  limit: number,
  orgId: string,
): Promise<string[] | null> =>
  withQmdGlobalLock(async () => {
    const collectionAvailable = await ensureQmdCollection(orgId);
    if (!collectionAvailable) {
      return null;
    }

    await syncAllUserDocuments(orgId);
    const indexReady = await refreshQmdIndexIfNeeded(orgId);
    if (!indexReady) {
      return null;
    }

    const collectionName = userQmdCollectionNameForOrg(orgId);
    const searchResult = await runQmdCommand(
      [
        "search",
        query,
        "--json",
        "-n",
        String(Math.max(1, Math.min(QMD_MAX_RESULTS, limit))),
        "-c",
        collectionName,
      ],
      { allowFailure: true },
    );
    if (searchResult.exitCode !== 0) {
      return null;
    }

    return extractUserIdsFromQmdSearchResult(searchResult.stdout, orgId);
  });
