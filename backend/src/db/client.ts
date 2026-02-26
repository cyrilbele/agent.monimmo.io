import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL ?? "data/app.db";
const folder = dirname(databaseUrl);

if (folder !== ".") {
  mkdirSync(folder, { recursive: true });
}

const sqlite = new Database(databaseUrl, { create: true });
export const db = drizzle(sqlite, { schema });
