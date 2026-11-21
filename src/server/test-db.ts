/**
 * Fresh database per test.
 * - Default: in-memory PGlite.
 * - TEST_DATABASE_URL set: a real Postgres. Its schemas are dropped and migrated again for every test,
 *   so point it at a database used only for tests, and run with --no-file-parallelism (`npm run test:pg`).
 */
import { createDb, type DB } from "./db";

let previous: { end: () => Promise<void> } | null = null;

export async function createTestDb(): Promise<DB> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return createDb({ memory: true });

  if (previous) { await previous.end(); previous = null; }
  const { Client } = await import("pg");
  const admin = new Client({ connectionString: url });
  await admin.connect();
  await admin.query("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  // Enum types live in public and are dropped with it.
  await admin.end();

  const db = await createDb({ url });
  previous = (db as unknown as { $client: { end: () => Promise<void> } }).$client;
  return db;
}
