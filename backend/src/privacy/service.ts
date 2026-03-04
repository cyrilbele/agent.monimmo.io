import { rm } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { refreshTokenStore } from "../auth/refresh-token-store";
import { db } from "../db/client";
import {
  aiCallLogs,
  calendarEvents,
  files,
  gdprAuditEvents,
  integrations,
  marketDvfQueryCache,
  messageFileLinks,
  messages,
  organizations,
  privacyExports,
  properties,
  propertyTimelineEvents,
  businessLinks,
  propertyVisits,
  reviewQueueItems,
  users,
  vocals,
} from "../db/schema";
import { HttpError } from "../http/errors";
import { propertyQmdDocsDirectoryForOrg } from "../properties/qmd-search";
import { getStorageProvider } from "../storage";
import { userQmdDocsDirectoryForOrg } from "../users/qmd-search";

type PrivacyExportStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
type GdprAuditStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

const EXPORT_RETENTION_DAYS = 7;
const activeExportJobs = new Set<string>();
const activeEraseJobs = new Set<string>();

const toIso = (value: Date | null): string | null => (value ? value.toISOString() : null);

const safeJsonParse = (raw: string | null): unknown => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const createAuditEvent = async (input: {
  orgId: string;
  actorUserId?: string | null;
  action: string;
  status: GdprAuditStatus;
  details?: Record<string, unknown>;
}): Promise<string> => {
  const id = crypto.randomUUID();
  await db.insert(gdprAuditEvents).values({
    id,
    orgId: input.orgId,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    status: input.status,
    details: input.details ? JSON.stringify(input.details) : null,
    createdAt: new Date(),
  });
  return id;
};

const updateAuditEventStatus = async (input: {
  id: string;
  orgId: string;
  status: GdprAuditStatus;
  details?: Record<string, unknown>;
}): Promise<void> => {
  await db
    .update(gdprAuditEvents)
    .set({
      status: input.status,
      details: input.details ? JSON.stringify(input.details) : null,
    })
    .where(and(eq(gdprAuditEvents.id, input.id), eq(gdprAuditEvents.orgId, input.orgId)));
};

const buildExportPayload = async (orgId: string): Promise<Record<string, unknown>> => {
  const [
    orgRow,
    userRows,
    propertyRows,
    businessLinkRows,
    visitRows,
    timelineRows,
    fileRows,
    messageRows,
    messageFileLinkRows,
    vocalRows,
    reviewRows,
    aiLogRows,
    integrationRows,
    calendarRows,
    cacheRows,
  ] = await Promise.all([
    db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    }),
    db.select().from(users).where(eq(users.orgId, orgId)),
    db.select().from(properties).where(eq(properties.orgId, orgId)),
    db.select().from(businessLinks).where(eq(businessLinks.orgId, orgId)),
    db.select().from(propertyVisits).where(eq(propertyVisits.orgId, orgId)),
    db.select().from(propertyTimelineEvents).where(eq(propertyTimelineEvents.orgId, orgId)),
    db.select().from(files).where(eq(files.orgId, orgId)),
    db.select().from(messages).where(eq(messages.orgId, orgId)),
    db.select().from(messageFileLinks).where(eq(messageFileLinks.orgId, orgId)),
    db.select().from(vocals).where(eq(vocals.orgId, orgId)),
    db.select().from(reviewQueueItems).where(eq(reviewQueueItems.orgId, orgId)),
    db.select().from(aiCallLogs).where(eq(aiCallLogs.orgId, orgId)),
    db.select().from(integrations).where(eq(integrations.orgId, orgId)),
    db.select().from(calendarEvents).where(eq(calendarEvents.orgId, orgId)),
    db.select().from(marketDvfQueryCache).where(eq(marketDvfQueryCache.orgId, orgId)),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    orgId,
    organization: orgRow ?? null,
    users: userRows,
    properties: propertyRows,
    businessLinks: businessLinkRows,
    propertyVisits: visitRows,
    propertyTimelineEvents: timelineRows,
    files: fileRows,
    messages: messageRows,
    messageFileLinks: messageFileLinkRows,
    vocals: vocalRows,
    reviewQueueItems: reviewRows,
    aiCallLogs: aiLogRows,
    integrations: integrationRows,
    calendarEvents: calendarRows,
    marketDvfQueryCache: cacheRows,
  };
};

const executeExportJob = async (input: {
  exportId: string;
  orgId: string;
  auditId: string;
}): Promise<void> => {
  if (activeExportJobs.has(input.exportId)) {
    return;
  }

  activeExportJobs.add(input.exportId);
  try {
    const startedAt = new Date();
    await db
      .update(privacyExports)
      .set({
        status: "RUNNING",
        startedAt,
      })
      .where(and(eq(privacyExports.id, input.exportId), eq(privacyExports.orgId, input.orgId)));
    await updateAuditEventStatus({
      id: input.auditId,
      orgId: input.orgId,
      status: "RUNNING",
      details: { exportId: input.exportId },
    });

    const payload = await buildExportPayload(input.orgId);
    const completedAt = new Date();

    await db
      .update(privacyExports)
      .set({
        status: "COMPLETED",
        resultJson: JSON.stringify(payload),
        completedAt,
        errorMessage: null,
      })
      .where(and(eq(privacyExports.id, input.exportId), eq(privacyExports.orgId, input.orgId)));

    await updateAuditEventStatus({
      id: input.auditId,
      orgId: input.orgId,
      status: "COMPLETED",
      details: { exportId: input.exportId, completedAt: completedAt.toISOString() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(privacyExports)
      .set({
        status: "FAILED",
        errorMessage: message.slice(0, 2000),
        completedAt: new Date(),
      })
      .where(and(eq(privacyExports.id, input.exportId), eq(privacyExports.orgId, input.orgId)));
    await updateAuditEventStatus({
      id: input.auditId,
      orgId: input.orgId,
      status: "FAILED",
      details: { exportId: input.exportId, error: message },
    });
  } finally {
    activeExportJobs.delete(input.exportId);
  }
};

const safeDeleteDirectory = async (directoryPath: string): Promise<void> => {
  try {
    await rm(directoryPath, { recursive: true, force: true });
  } catch {
    // no-op: ce nettoyage est best effort
  }
};

const executeEraseJob = async (input: {
  orgId: string;
  auditId: string;
}): Promise<void> => {
  if (activeEraseJobs.has(input.orgId)) {
    return;
  }

  activeEraseJobs.add(input.orgId);
  try {
    await updateAuditEventStatus({
      id: input.auditId,
      orgId: input.orgId,
      status: "RUNNING",
      details: { orgId: input.orgId },
    });

    const usersInOrg = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.orgId, input.orgId));
    for (const user of usersInOrg) {
      refreshTokenStore.revokeAllForUser(user.id);
    }

    const filesInOrg = await db
      .select({
        id: files.id,
        key: files.storageKey,
      })
      .from(files)
      .where(eq(files.orgId, input.orgId));
    const storageProvider = getStorageProvider();

    let storageDeleted = 0;
    for (const file of filesInOrg) {
      try {
        await storageProvider.deleteObject(file.key);
        storageDeleted += 1;
      } catch {
        // best effort, l'effacement SQL reste prioritaire
      }
    }

    await safeDeleteDirectory(userQmdDocsDirectoryForOrg(input.orgId));
    await safeDeleteDirectory(propertyQmdDocsDirectoryForOrg(input.orgId));

    await db.transaction(async (tx) => {
      await tx.delete(messageFileLinks).where(eq(messageFileLinks.orgId, input.orgId));
      await tx.delete(propertyVisits).where(eq(propertyVisits.orgId, input.orgId));
      await tx.delete(businessLinks).where(eq(businessLinks.orgId, input.orgId));
      await tx.delete(propertyTimelineEvents).where(eq(propertyTimelineEvents.orgId, input.orgId));
      await tx.delete(reviewQueueItems).where(eq(reviewQueueItems.orgId, input.orgId));
      await tx.delete(vocals).where(eq(vocals.orgId, input.orgId));
      await tx.delete(messages).where(eq(messages.orgId, input.orgId));
      await tx.delete(files).where(eq(files.orgId, input.orgId));
      await tx.delete(aiCallLogs).where(eq(aiCallLogs.orgId, input.orgId));
      await tx.delete(integrations).where(eq(integrations.orgId, input.orgId));
      await tx.delete(calendarEvents).where(eq(calendarEvents.orgId, input.orgId));
      await tx.delete(marketDvfQueryCache).where(eq(marketDvfQueryCache.orgId, input.orgId));
      await tx.delete(privacyExports).where(eq(privacyExports.orgId, input.orgId));
      await tx.delete(users).where(eq(users.orgId, input.orgId));
      await tx.delete(properties).where(eq(properties.orgId, input.orgId));
    });

    await updateAuditEventStatus({
      id: input.auditId,
      orgId: input.orgId,
      status: "COMPLETED",
      details: {
        orgId: input.orgId,
        deletedStorageObjects: storageDeleted,
        completedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateAuditEventStatus({
      id: input.auditId,
      orgId: input.orgId,
      status: "FAILED",
      details: { orgId: input.orgId, error: message },
    });
  } finally {
    activeEraseJobs.delete(input.orgId);
  }
};

const toPrivacyExportResponse = (row: typeof privacyExports.$inferSelect) => ({
  id: row.id,
  status: row.status as PrivacyExportStatus,
  requestedAt: row.requestedAt.toISOString(),
  startedAt: toIso(row.startedAt),
  completedAt: toIso(row.completedAt),
  expiresAt: row.expiresAt.toISOString(),
  errorMessage: row.errorMessage,
  data: safeJsonParse(row.resultJson),
});

export const privacyService = {
  async requestExport(input: { orgId: string; requestedByUserId: string }) {
    const existingOrg = await db.query.organizations.findFirst({
      where: eq(organizations.id, input.orgId),
    });
    if (!existingOrg) {
      throw new HttpError(404, "ORG_NOT_FOUND", "Organisation introuvable");
    }

    const now = new Date();
    const id = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    await db.insert(privacyExports).values({
      id,
      orgId: input.orgId,
      requestedByUserId: input.requestedByUserId,
      status: "PENDING",
      resultJson: null,
      errorMessage: null,
      requestedAt: now,
      startedAt: null,
      completedAt: null,
      expiresAt,
    });

    const auditId = await createAuditEvent({
      orgId: input.orgId,
      actorUserId: input.requestedByUserId,
      action: "PRIVACY_EXPORT_REQUEST",
      status: "PENDING",
      details: { exportId: id },
    });

    queueMicrotask(() => {
      void executeExportJob({
        exportId: id,
        orgId: input.orgId,
        auditId,
      });
    });

    const created = await db.query.privacyExports.findFirst({
      where: and(eq(privacyExports.id, id), eq(privacyExports.orgId, input.orgId)),
    });
    if (!created) {
      throw new HttpError(500, "PRIVACY_EXPORT_CREATE_FAILED", "Creation export impossible");
    }

    return toPrivacyExportResponse(created);
  },

  async getExportById(input: { orgId: string; id: string }) {
    const row = await db.query.privacyExports.findFirst({
      where: and(eq(privacyExports.id, input.id), eq(privacyExports.orgId, input.orgId)),
    });

    if (!row) {
      throw new HttpError(404, "PRIVACY_EXPORT_NOT_FOUND", "Export introuvable");
    }

    return toPrivacyExportResponse(row);
  },

  async requestErase(input: { orgId: string; requestedByUserId: string }) {
    const auditId = await createAuditEvent({
      orgId: input.orgId,
      actorUserId: input.requestedByUserId,
      action: "PRIVACY_ERASE_REQUEST",
      status: "PENDING",
      details: { orgId: input.orgId },
    });

    queueMicrotask(() => {
      void executeEraseJob({
        orgId: input.orgId,
        auditId,
      });
    });

    return {
      requestId: auditId,
      status: "PENDING" as const,
      requestedAt: new Date().toISOString(),
    };
  },
};
