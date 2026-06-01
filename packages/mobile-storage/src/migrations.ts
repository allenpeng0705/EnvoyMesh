/**
 * Versioned migrations for the mobile SQLite storage.
 *
 * The first call to {@link runMobileStorageMigrations} creates a `migrations`
 * table (id, version INT, sql TEXT, applied_at TEXT) and records every
 * statement in {@link MOBILE_STORAGE_MIGRATIONS} that has a version strictly
 * greater than the value persisted in SQLite's `PRAGMA user_version`.
 *
 * Each migration runs in its own statement and is recorded on success.
 * Failed migrations stop the loop and surface the error so the caller can
 * fall back to wiping the database — SQLite has no rollback across
 * statements in a single transaction for `ALTER TABLE`, so partial-upgrade
 * is unlikely but a single-statement transaction is still safer.
 */

import type { MobileDatabase } from "./index.js";

export interface MobileStorageMigration {
  version: number;
  description: string;
  /** SQL statement(s) to run for this migration. */
  sql: string;
}

/**
 * Ordered migrations; each is applied once when the persisted user_version
 * is strictly less than the migration's version.
 */
export const MOBILE_STORAGE_MIGRATIONS: readonly MobileStorageMigration[] = [
  {
    version: 1,
    description: "Add libp2pPeerId to peer_directory",
    sql: "ALTER TABLE peer_directory ADD COLUMN libp2pPeerId TEXT",
  },
  {
    version: 2,
    description: "Add attachmentsJson to chat_messages",
    sql: "ALTER TABLE chat_messages ADD COLUMN attachmentsJson TEXT",
  },
  {
    version: 3,
    description: "Add groupDeliveryJson to chat_messages",
    sql: "ALTER TABLE chat_messages ADD COLUMN groupDeliveryJson TEXT",
  },
  {
    version: 4,
    description: "Add agentName_home to identity_state",
    sql: "ALTER TABLE identity_state ADD COLUMN agentName_home TEXT",
  },
];

/**
 * Apply any pending migrations to the given database. Idempotent: a database
 * already at the latest version is a no-op.
 */
export async function runMobileStorageMigrations(db: MobileDatabase): Promise<void> {
  // Bootstrap the migrations table on first run.
  await db.execute(
    `CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )`,
  );

  const appliedRows = (await db.query("SELECT MAX(version) as v FROM migrations")) as Array<{
    v: number | null;
  }>;
  const appliedVersion = appliedRows[0]?.v ?? 0;

  for (const migration of MOBILE_STORAGE_MIGRATIONS) {
    if (migration.version <= appliedVersion) continue;

    // Each migration is its own statement; SQLite cannot ALTER TABLE
    // inside a multi-statement transaction reliably, so we apply one at
    // a time and record success.
    try {
      await db.execute(migration.sql);
    } catch (err) {
      throw new Error(
        `mobile-storage migration v${migration.version} (${migration.description}) failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    await db.execute(
      "INSERT INTO migrations (version, applied_at) VALUES (?, ?)",
      [migration.version, new Date().toISOString()],
    );
  }

  // Best-effort: keep PRAGMA user_version in sync so external tools
  // (sqlite3 CLI, DBA inspection) can see the schema version.
  const latest = MOBILE_STORAGE_MIGRATIONS[MOBILE_STORAGE_MIGRATIONS.length - 1]?.version ?? 0;
  if (latest > appliedVersion) {
    try {
      await db.execute(`PRAGMA user_version = ${latest}`);
    } catch {
      /* PRAGMA may not be supported by all Capacitor SQLite builds; non-fatal */
    }
  }
}
