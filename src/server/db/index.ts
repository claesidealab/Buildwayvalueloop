/**
 * Database connection.
 *
 * - DATABASE_URL set: real Postgres via node-postgres (production, staging).
 * - Not set: embedded Postgres (PGlite) stored in PGLITE_DIR, default ./.data/pglite,
 *   so development needs no database server.
 * - Tests pass { memory: true } for a fresh in-memory database.
 *
 * Migrations in /drizzle run on first connection.
 */
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

export async function createDb(opts: { url?: string; dataDir?: string; memory?: boolean } = {}): Promise<DB> {
  if (opts.url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const db = drizzle(new Pool({ connectionString: opts.url }), { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db as unknown as DB;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  let client;
  if (opts.memory) client = new PGlite();
  else {
    const dir = opts.dataDir ?? process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
    // PGlite creates the data folder but not its parents.
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.dirname(dir), { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}

const g = globalThis as unknown as { __bwDb?: Promise<DB> };

/** Shared connection for the running app (survives dev hot reloads). */
export function getDb(): Promise<DB> {
  if (!g.__bwDb) {
    // Forget a failed connection so the next request tries again.
    g.__bwDb = createDb({ url: process.env.DATABASE_URL }).catch((e) => { g.__bwDb = undefined; throw e; });
  }
  return g.__bwDb;
}

export { schema };
