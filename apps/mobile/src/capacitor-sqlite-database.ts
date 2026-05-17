/**
 * Capacitor SQLite adapter implementing the MobileDatabase interface.
 *
 * Wraps @capacitor-community/sqlite to provide real SQLite storage on
 * iOS and Android via the SQLiteConnection / SQLiteDBConnection API.
 * All Capacitor imports are dynamic — only resolved at runtime on-device.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MobileDatabase } from "@envoymesh/mobile-storage";
import { mobileStorageSchema } from "@envoymesh/mobile-storage";

/** Convert raw SQLite rows (array-of-arrays on iOS, array-of-objects elsewhere)
 *  into a uniform Record<string, unknown>[]. */
function _rowsToObjects(values: unknown[]): Record<string, unknown>[] {
  if (values.length === 0) return [];
  // iOS returns column names as the first row
  if (Array.isArray(values[0]) && typeof (values[0] as unknown[])[0] === "string") {
    const cols = values[0] as string[];
    return values.slice(1).map((row) => {
      const obj: Record<string, unknown> = {};
      const arr = row as unknown[];
      for (let i = 0; i < cols.length; i++) {
        obj[cols[i]] = arr[i] ?? null;
      }
      return obj;
    });
  }
  return values as Record<string, unknown>[];
}

export class CapacitorSqliteDatabase implements MobileDatabase {
  private _dbName = "envoymesh.db";
  /** SQLiteDBConnection instance (dynamic import — only on device) */
  private _conn: any = null;
  /** SQLiteConnection instance */
  private _sqliteConn: any = null;

  async open(): Promise<void> {
    if (this._conn) return;
    const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
    this._sqliteConn = new SQLiteConnection(CapacitorSQLite);
    this._conn = await this._sqliteConn.createConnection(
      this._dbName, false, "no-encryption", 1, false,
    );
    await this._conn.open();
  }

  async close(): Promise<void> {
    if (!this._conn) return;
    await this._conn.close();
    if (this._sqliteConn) {
      await this._sqliteConn.closeConnection(this._dbName, false);
    }
    this._conn = null;
  }

  async query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
    await this._ensureOpen();
    const result = await this._conn.query(sql, params ?? []);
    return _rowsToObjects(result.values ?? []);
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    await this._ensureOpen();
    if (params && params.length > 0) {
      await this._conn.run(sql, params);
    } else {
      await this._conn.execute(sql);
    }
  }

  /** Run all schema migration statements. */
  async initializeSchema(): Promise<void> {
    for (const stmt of mobileStorageSchema()) {
      await this._conn.execute(stmt);
    }
  }

  private async _ensureOpen(): Promise<void> {
    if (!this._conn) await this.open();
  }
}
