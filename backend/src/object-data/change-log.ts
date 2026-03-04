import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { objectChanges } from "../db/schema";
import type { ObjectType } from "./structure";

export const OBJECT_CHANGE_MODES = ["USER", "AI"] as const;
export type ObjectChangeMode = (typeof OBJECT_CHANGE_MODES)[number];

export type ObjectChangeRow = {
  id: string;
  objectType: ObjectType;
  objectId: string;
  paramName: string;
  paramValue: string;
  mode: ObjectChangeMode;
  modifiedAt: string;
};

const MAX_PARAM_VALUE_LENGTH = 10_000;

const serializeParamValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || typeof value === "undefined") {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const truncate = (value: string): string =>
  value.length <= MAX_PARAM_VALUE_LENGTH ? value : `${value.slice(0, MAX_PARAM_VALUE_LENGTH)}…`;

const toObjectChangeRow = (row: typeof objectChanges.$inferSelect): ObjectChangeRow => ({
  id: row.id,
  objectType: row.objectType as ObjectType,
  objectId: row.objectId,
  paramName: row.paramName,
  paramValue: row.paramValue,
  mode: row.mode as ObjectChangeMode,
  modifiedAt: row.createdAt.toISOString(),
});

export const objectChangeLogService = {
  async list(input: {
    orgId: string;
    objectType: ObjectType;
    objectId: string;
    limit?: number;
  }): Promise<{ items: ObjectChangeRow[] }> {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(input.limit ?? 200)));
    const rows = await db
      .select()
      .from(objectChanges)
      .where(
        and(
          eq(objectChanges.orgId, input.orgId),
          eq(objectChanges.objectType, input.objectType),
          eq(objectChanges.objectId, input.objectId),
        ),
      )
      .orderBy(desc(objectChanges.createdAt), desc(objectChanges.id))
      .limit(safeLimit);

    return {
      items: rows.map(toObjectChangeRow),
    };
  },

  async appendChanges(input: {
    orgId: string;
    objectType: ObjectType;
    objectId: string;
    mode: ObjectChangeMode;
    changes: Array<{ paramName: string; paramValue: unknown }>;
    modifiedAt?: Date;
  }): Promise<void> {
    const createdAt = input.modifiedAt ?? new Date();
    const rows = input.changes
      .map((change) => ({
        paramName: change.paramName.trim(),
        paramValue: truncate(serializeParamValue(change.paramValue)),
      }))
      .filter((change) => change.paramName.length > 0)
      .map((change) => ({
        id: crypto.randomUUID(),
        orgId: input.orgId,
        objectType: input.objectType,
        objectId: input.objectId,
        paramName: change.paramName,
        paramValue: change.paramValue,
        mode: input.mode,
        createdAt,
      }));

    if (rows.length === 0) {
      return;
    }

    await db.insert(objectChanges).values(rows);
  },
};

export const trackObjectChangesSafe = async (input: {
  orgId: string;
  objectType: ObjectType;
  objectId: string;
  mode: ObjectChangeMode;
  changes: Array<{ paramName: string; paramValue: unknown }>;
  modifiedAt?: Date;
}): Promise<void> => {
  try {
    await objectChangeLogService.appendChanges(input);
  } catch (error) {
    console.warn("[OBJECT_CHANGES] track failed", error);
  }
};
