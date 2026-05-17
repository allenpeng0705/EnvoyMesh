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
 */
import { MobileNode } from "@envoymesh/mobile-node";
import { CapacitorSqliteDatabase } from "./capacitor-sqlite-database.js";
import { CapacitorFilesystemVault } from "./capacitor-filesystem-vault.js";
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

  // 4. Try to restore from persisted identity
  try {
    await node.restoreFromSecureStorage();
    // Identity restored — start the node
    await node.startNode();
    return node;
  } catch {
    // No persisted identity — fall through to standalone init
  }

  // 5. Fresh init (standalone — UI should show onboarding / QR scan)
  await node.initNode(config.profileDir);
  await node.startNode();
  return node;
}
