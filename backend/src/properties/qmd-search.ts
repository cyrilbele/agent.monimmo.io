import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { properties } from "../db/schema";
import {
  ensureQmdRuntimeDirectories,
  QMD_WORKSPACE_ROOT_DIR,
  runQmdCommand,
  withQmdGlobalLock,
} from "../qmd/command";

type PropertyRow = typeof properties.$inferSelect;

type FlatEntry = {
  key: string;
  value: string;
};

type QmdOrgState = {
  collectionReady: boolean;
  fullSyncDone: boolean;
  indexDirty: boolean;
};

const QMD_DOCS_BASE_DIRECTORY = resolve(QMD_WORKSPACE_ROOT_DIR, "data/qmd/properties");
const QMD_COLLECTION_NAME_PREFIX = "monimmo-properties";
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

export const propertyQmdDocsDirectoryForOrg = (orgId: string): string =>
  resolve(QMD_DOCS_BASE_DIRECTORY, toOrgDirectoryName(orgId));

export const propertyQmdCollectionNameForOrg = (orgId: string): string =>
  `${QMD_COLLECTION_NAME_PREFIX}-${toOrgScopeToken(orgId)}`;

const ensureQmdDirectories = (orgId: string): void => {
  mkdirSync(propertyQmdDocsDirectoryForOrg(orgId), { recursive: true });
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

const flattenValue = (
  value: unknown,
  keyPath: string,
  entries: FlatEntry[],
): void => {
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

const parseJsonRecord = (raw: string): Record<string, unknown> => {
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

const parseJsonStringArray = (raw: string): string[] => {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
};

const toDocumentFileName = (propertyId: string): string => {
  const encodedId = Buffer.from(propertyId, "utf8").toString("hex");
  return `property-${encodedId}.md`;
};

const fromDocumentFileName = (fileName: string): string | null => {
  if (!fileName.startsWith("property-") || !fileName.endsWith(".md")) {
    return null;
  }

  const encodedId = fileName.slice("property-".length, -".md".length);
  if (encodedId.length === 0 || encodedId.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(encodedId)) {
    return null;
  }

  try {
    return Buffer.from(encodedId, "hex").toString("utf8");
  } catch {
    return null;
  }
};

const ensureQmdCollection = async (orgId: string): Promise<boolean> => {
  const state = getQmdState(orgId);
  if (state.collectionReady) {
    return true;
  }

  ensureQmdDirectories(orgId);

  const collectionName = propertyQmdCollectionNameForOrg(orgId);
  const docsDirectory = propertyQmdDocsDirectoryForOrg(orgId);

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

const writePropertyDocumentFile = (property: PropertyRow): string => {
  ensureQmdDirectories(property.orgId);
  const fileName = toDocumentFileName(property.id);
  const filePath = resolve(propertyQmdDocsDirectoryForOrg(property.orgId), fileName);
  writeFileSync(filePath, buildPropertyQmdDocument(property), "utf8");
  return fileName;
};

const syncAllPropertyDocuments = async (orgId: string): Promise<void> => {
  const state = getQmdState(orgId);
  if (state.fullSyncDone) {
    return;
  }

  const rows = await db.select().from(properties).where(eq(properties.orgId, orgId));
  const expectedFileNames = new Set<string>();

  for (const row of rows) {
    expectedFileNames.add(writePropertyDocumentFile(row));
  }

  const docsDirectory = propertyQmdDocsDirectoryForOrg(orgId);
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

export const extractPropertyIdsFromQmdSearchResult = (
  jsonOutput: string,
  orgId: string,
): string[] => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonOutput);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const collectionName = propertyQmdCollectionNameForOrg(orgId);
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
    const propertyId = fromDocumentFileName(fileName);
    if (!propertyId) {
      continue;
    }

    ids.add(propertyId);
  }

  return [...ids];
};

export const buildPropertyQmdDocument = (property: PropertyRow): string => {
  const details = parseJsonRecord(property.details);
  const hiddenExpectedDocumentKeys = parseJsonStringArray(property.hiddenExpectedDocumentKeys);

  const flattenedEntries: FlatEntry[] = [];
  const flatSource: Record<string, unknown> = {
    id: property.id,
    orgId: property.orgId,
    title: property.title,
    city: property.city,
    postalCode: property.postalCode,
    address: property.address,
    price: property.price,
    status: property.status,
    createdAt: property.createdAt,
    updatedAt: property.updatedAt,
    hiddenExpectedDocumentKeys,
    details,
  };

  for (const [key, value] of Object.entries(flatSource)) {
    flattenValue(value, key, flattenedEntries);
  }

  const lines: string[] = [
    `# Bien - ${property.title || "sans titre"}`,
    "",
    "## Resume",
    `- Titre: ${normalizeStringValue(property.title)}`,
    `- Ville: ${normalizeStringValue(property.city)}`,
    `- Code postal: ${normalizeStringValue(property.postalCode)}`,
    `- Adresse: ${formatFlatValue(property.address)}`,
    `- Prix: ${formatFlatValue(property.price)}`,
    `- Statut: ${normalizeStringValue(property.status)}`,
    "",
    "## Parametres du bien (cle / valeur)",
  ];

  for (const entry of flattenedEntries) {
    lines.push(`- \`${entry.key}\`: ${entry.value}`);
  }

  lines.push("");
  return lines.join("\n");
};

export const upsertPropertyQmdDocument = async (
  property: PropertyRow,
): Promise<void> =>
  withQmdGlobalLock(async () => {
    const collectionAvailable = await ensureQmdCollection(property.orgId);
    if (!collectionAvailable) {
      return;
    }

    writePropertyDocumentFile(property);
    const state = getQmdState(property.orgId);
    state.indexDirty = true;
  });

export const searchPropertyIdsWithQmd = async (
  query: string,
  limit: number,
  orgId: string,
): Promise<string[] | null> =>
  withQmdGlobalLock(async () => {
    const collectionAvailable = await ensureQmdCollection(orgId);
    if (!collectionAvailable) {
      return null;
    }

    await syncAllPropertyDocuments(orgId);
    const indexReady = await refreshQmdIndexIfNeeded(orgId);
    if (!indexReady) {
      return null;
    }

    const collectionName = propertyQmdCollectionNameForOrg(orgId);
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

    return extractPropertyIdsFromQmdSearchResult(searchResult.stdout, orgId);
  });
