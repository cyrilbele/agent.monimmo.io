import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db } from "./client";

const ensureDbFolder = () => {
  const databaseUrl = process.env.DATABASE_URL ?? "data/app.db";
  const folder = dirname(databaseUrl);
  if (folder !== ".") {
    mkdirSync(folder, { recursive: true });
  }
};

export const runMigrations = () => {
  ensureDbFolder();
  migrate(db, { migrationsFolder: "drizzle" });
  console.info("Migrations appliquées avec succès.");
};

if (import.meta.main) {
  runMigrations();
}
