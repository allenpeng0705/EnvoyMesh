/**
 * Capacitor SQLite adapter implementing the MobileDatabase interface.
 *
 * Wraps @capacitor-community/sqlite to provide real SQLite storage on
 * iOS and Android. Only usable within the Capacitor runtime context.
 */
import type { MobileDatabase } from "@envoymesh/mobile-storage";
import { mobileStorageSchema } from "@envoymesh/mobile-storage";

export class CapacitorSqliteDatabase implements MobileDatabase {
  private _dbName = "envoymesh.db";
  private _open = false;

  async open(): Promise<void> {
    if (this._open) return;
    const { CapacitorSQLite } = await import("@capacitor-community/sqlite");
    await CapacitorSQLite.createConnection(this._dbName, false, "no-encryption", 1);
    await CapacitorSQLite.open({ database: this._dbName });
    this._open = true;
  }

  async close(): Promise<void> {
    if (!this._open) return;
    const { CapacitorSQLite } = await import("@capacitor-community/sqlite");
    await CapacitorSQLite.close({ database: this._dbName });
    this._open = false;
  }

  async query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
    await this._ensureOpen();
    const { CapacitorSQLite } = await import("@capacitor-community/sqlite");
    const result = await CapacitorSQLite.query({
      statement: sql,
      values: params ?? [],
    });
    return (result.values as Record<string, unknown>[]) ?? [];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    await this._ensureOpen();
    const { CapacitorSQLite } = await import("@capacitor-community/sqlite");
    await CapacitorSQLite.execute({
      statements: sql,
      values: params ?? [],
    });
  }

  /** Run all schema migration statements. */
  async initializeSchema(): Promise<void> {
    for (const stmt of mobileStorageSchema()) {
      await this.execute(stmt);
    }
  }

  private async _ensureOpen(): Promise<void> {
    if (!this._open) await this.open();
  }
}
