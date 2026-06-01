/**
 * Mobile app bootstrap — wires Capacitor-native backends into MobileNode.
 *
 * Flow:
 * 1. Open SQLite database + run schema migrations
 * 2. Create Capacitor-backed vault and secure storage
 * 3. Create MobileNode with injected dependencies
 * 4. Try to restore from persisted identity (no QR re-scan needed)
 * 5. Fall back to standalone init (shows onboarding UI)
 * 6. Start the node (connect relays)
 *
 * If SQLite contains identity metadata but SecureStorage/keychain restore fails,
 * we **do not** create a second standalone identity (avoids split-brain state).
 */
import { MobileNode } from "@envoymesh/mobile-node";
import { CapacitorFilesystemVault } from "@envoymesh/mobile-vault";
import { CapacitorSqliteDatabase } from "./capacitor-sqlite-database.js";
import { CapacitorSecureStorage } from "./capacitor-secure-storage.js";

export interface MobileAppConfig {
  /** Relay WebSocket URLs to connect to. */
  relayUrls: string[];
  /** Profile directory path (for Capacitor Filesystem). */
  profileDir: string;
}

export async function bootstrapMobileApp(config: MobileAppConfig): Promise<MobileNode> {
  // 1. Initialize SQLite
  const db = new CapacitorSqliteDatabase();
  await db.open();
  await db.initializeSchema();

  // 2. Create Capacitor-backed services
  const vault = new CapacitorFilesystemVault();
  const secureStorage = new CapacitorSecureStorage();

  // 3. Create MobileNode with injected dependencies
  const node = new MobileNode({
    profileDir: config.profileDir,
    relayUrls: config.relayUrls,
    database: db,
    vault,
    secureStorage,
  });

  try {
    await node.restoreFromSecureStorage();
    await node.startNode();
    return node;
  } catch (err) {
    const persisted = await node.loadPersistedIdentity();
    if (persisted) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Identity metadata is present in SQLite but restore failed (${msg}). ` +
        `Clear app data or fix SecureStorage, then relaunch — a new identity will not be created automatically.`,
      );
    }
  }

  await node.initNode(config.profileDir);
  await node.startNode();
  return node;
}
