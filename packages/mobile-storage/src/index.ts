/**
 * Mobile SQLite-backed persistence layer.
 *
 * Replaces @envoymesh/local-store for the Capacitor mobile environment.
 * Uses `@capacitor-community/sqlite` for native SQLite access on iOS/Android.
 *
 * Tables:
 *   peer_directory  — known peers and their multiaddrs
 *   trust_store     — bond records / trust tiers
 *   session_tokens  — persistent pairing session tokens
 *   audit_journal   — append-only audit events
 *   config          — key-value node configuration
 *   identity_state  — persisted identity state (shared/standalone)
 *
 * On Web (during dev), falls back to in-memory Maps.
 */

import type { BondRecord } from "@envoymesh/api";
import type { SessionTokenRecord } from "./session-token-types.js";

// ---------------------------------------------------------------------------
// Types (re-exported for consumers)
// ---------------------------------------------------------------------------

export type { SessionTokenRecord };

export interface PeerDirectoryEntry {
  ownerId: string;
  multiaddrs: string[];
  lastSeen: string;
}

export interface ConfigEntry {
  key: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Database interface
// ---------------------------------------------------------------------------

export interface MobileDatabase {
  /** Open / initialise the database */
  open(): Promise<void>;
  /** Close the database connection */
  close(): Promise<void>;
  /** Run a SQL query and return rows */
  query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  /** Execute a write SQL statement */
  execute(sql: string, params?: unknown[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Secure storage interface (iOS Keychain / Android EncryptedSharedPreferences)
// ---------------------------------------------------------------------------

export interface SecureStorage {
  /** Store a string value under a key. */
  set(key: string, value: string): Promise<void>;
  /** Retrieve a string value. Returns undefined if the key does not exist. */
  get(key: string): Promise<string | undefined>;
  /** Remove a key. */
  remove(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Peer directory
// ---------------------------------------------------------------------------

export interface MobilePeerDirectory {
  get(ownerId: string): Promise<PeerDirectoryEntry | undefined>;
  set(entry: PeerDirectoryEntry): Promise<void>;
  delete(ownerId: string): Promise<void>;
  list(): Promise<PeerDirectoryEntry[]>;
}

export function createMobilePeerDirectory(db: MobileDatabase): MobilePeerDirectory {
  return {
    async get(ownerId) {
      const rows = await db.query("SELECT * FROM peer_directory WHERE ownerId = ?", [ownerId]);
      if (rows.length === 0) return undefined;
      const r = rows[0] as Record<string, unknown>;
      return {
        ownerId: String(r.ownerId ?? ""),
        multiaddrs: JSON.parse(String(r.multiaddrs ?? "[]")),
        lastSeen: String(r.lastSeen ?? ""),
      };
    },
    async set(entry) {
      await db.execute(
        "INSERT OR REPLACE INTO peer_directory (ownerId, multiaddrs, lastSeen) VALUES (?, ?, ?)",
        [entry.ownerId, JSON.stringify(entry.multiaddrs), entry.lastSeen],
      );
    },
    async delete(ownerId) {
      await db.execute("DELETE FROM peer_directory WHERE ownerId = ?", [ownerId]);
    },
    async list() {
      const rows = await db.query("SELECT * FROM peer_directory") as Record<string, unknown>[];
      return rows.map((r) => ({
        ownerId: String(r.ownerId ?? ""),
        multiaddrs: JSON.parse(String(r.multiaddrs ?? "[]")),
        lastSeen: String(r.lastSeen ?? ""),
      }));
    },
  };
}

// ---------------------------------------------------------------------------
// Trust store (bonds)
// ---------------------------------------------------------------------------

export interface MobileTrustStore {
  get(peerOwnerId: string): Promise<BondRecord | undefined>;
  set(record: BondRecord): Promise<void>;
  delete(peerOwnerId: string): Promise<void>;
  list(): Promise<BondRecord[]>;
}

export function createMobileTrustStore(db: MobileDatabase): MobileTrustStore {
  return {
    async get(peerOwnerId) {
      const rows = await db.query("SELECT * FROM trust_store WHERE peerOwnerId = ?", [peerOwnerId]);
      if (rows.length === 0) return undefined;
      const r = rows[0] as Record<string, unknown>;
      return {
        peerOwnerId: String(r.peerOwnerId ?? ""),
        displayName: r.displayName != null ? String(r.displayName) : undefined,
        libp2pPeerId: r.libp2pPeerId != null ? String(r.libp2pPeerId) : undefined,
        level: String(r.level ?? "public") as BondRecord["level"],
        createdAt: String(r.createdAt ?? ""),
        note: r.note != null ? String(r.note) : undefined,
      };
    },
    async set(record) {
      await db.execute(
        `INSERT OR REPLACE INTO trust_store (peerOwnerId, displayName, libp2pPeerId, level, createdAt, note)
         VALUES (?, ?, ?, ?, ?, ?)` as string,
        [record.peerOwnerId, record.displayName ?? null, record.libp2pPeerId ?? null,
         record.level, record.createdAt, record.note ?? null],
      );
    },
    async delete(peerOwnerId) {
      await db.execute("DELETE FROM trust_store WHERE peerOwnerId = ?", [peerOwnerId]);
    },
    async list() {
      const rows = await db.query("SELECT * FROM trust_store") as Record<string, unknown>[];
      return rows.map((r) => ({
        peerOwnerId: String(r.peerOwnerId ?? ""),
        displayName: r.displayName != null ? String(r.displayName) : undefined,
        libp2pPeerId: r.libp2pPeerId != null ? String(r.libp2pPeerId) : undefined,
        level: String(r.level ?? "public") as BondRecord["level"],
        createdAt: String(r.createdAt ?? ""),
        note: r.note != null ? String(r.note) : undefined,
      }));
    },
  };
}

// ---------------------------------------------------------------------------
// Session token store
// ---------------------------------------------------------------------------

export interface MobileSessionTokenStore {
  listTokens(): Promise<SessionTokenRecord[]>;
  getTokenByValue(token: string): Promise<SessionTokenRecord | undefined>;
  setToken(record: SessionTokenRecord): Promise<void>;
  removeTokensForOwner(ownerId: string): Promise<void>;
}

export function createMobileSessionTokenStore(db: MobileDatabase): MobileSessionTokenStore {
  return {
    async listTokens() {
      const rows = await db.query("SELECT * FROM session_tokens") as Record<string, unknown>[];
      return rows.map(_rowToSessionToken);
    },
    async getTokenByValue(token) {
      if (!token) return undefined;
      const rows = await db.query("SELECT * FROM session_tokens WHERE token = ?", [token]);
      if (rows.length === 0) return undefined;
      return _rowToSessionToken(rows[0] as Record<string, unknown>);
    },
    async setToken(record) {
      // Remove existing token for same owner (one token per owner)
      await db.execute("DELETE FROM session_tokens WHERE ownerId = ?", [record.ownerId]);
      await db.execute(
        `INSERT INTO session_tokens (token, ownerId, deviceId, displayName, createdAt, lastUsedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [record.token, record.ownerId, record.deviceId,
         record.displayName ?? null, record.createdAt, record.lastUsedAt],
      );
    },
    async removeTokensForOwner(ownerId) {
      await db.execute("DELETE FROM session_tokens WHERE ownerId = ?", [ownerId]);
    },
  };
}

function _rowToSessionToken(row: Record<string, unknown>): SessionTokenRecord {
  return {
    token: String(row.token ?? ""),
    ownerId: String(row.ownerId ?? ""),
    deviceId: String(row.deviceId ?? ""),
    displayName: row.displayName != null ? String(row.displayName) : undefined,
    createdAt: String(row.createdAt ?? ""),
    lastUsedAt: String(row.lastUsedAt ?? ""),
  };
}

// ---------------------------------------------------------------------------
// Schema initialisation
// ---------------------------------------------------------------------------

export function mobileStorageSchema(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS peer_directory (
      ownerId TEXT PRIMARY KEY,
      multiaddrs TEXT NOT NULL,
      lastSeen TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS trust_store (
      peerOwnerId TEXT PRIMARY KEY,
      displayName TEXT,
      libp2pPeerId TEXT,
      level TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      note TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS session_tokens (
      token TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      deviceId TEXT NOT NULL,
      displayName TEXT,
      createdAt TEXT NOT NULL,
      lastUsedAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS identity_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      sharedIdentity INTEGER NOT NULL DEFAULT 0,
      ownerId TEXT,
      ownerPublicKeyPem TEXT,
      deviceId TEXT,
      devicePublicKeyPem TEXT,
      agentPeerId TEXT,
      agentPublicKeyPem TEXT,
      homeNodePeerId TEXT,
      relayUrls TEXT NOT NULL DEFAULT '[]',
      agentPeerId_home TEXT,
      agentPubKey_home TEXT,
      deviceCertificateJson TEXT,
      sessionToken TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS chat_messages (
      messageId TEXT PRIMARY KEY,
      threadPeerOwnerId TEXT NOT NULL,
      senderOwnerId TEXT,
      senderDisplayName TEXT,
      recipientOwnerId TEXT,
      recipientDisplayName TEXT,
      textContent TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      signature TEXT NOT NULL,
      deliveryReceipt TEXT DEFAULT 'sent'
    )`,
    `CREATE INDEX IF NOT EXISTS idx_chat_thread ON chat_messages(threadPeerOwnerId, timestamp DESC)`,
  ];
}

// ---------------------------------------------------------------------------
// Chat log store (Phase 11 — SQLite-backed chat history)
// ---------------------------------------------------------------------------

export interface ChatLogEntry {
  messageId: string;
  sender: {
    ownerId?: string;
    displayName: string;
  };
  recipient: {
    ownerId?: string;
    displayName?: string;
  };
  content: {
    text: string;
  };
  metadata: {
    timestamp: string;
    deliveryReceipt?: "sent" | "delivered" | "read";
  };
  signature: string;
}

export interface MobileChatLogStore {
  /** Append a chat message to the thread for a given peer. */
  append(threadPeerOwnerId: string, entry: ChatLogEntry): Promise<void>;
  /** List most recent messages in a thread, ascending by timestamp. */
  listThread(threadPeerOwnerId: string, limit?: number): Promise<ChatLogEntry[]>;
}

function _rowToChatLogEntry(row: Record<string, unknown>): ChatLogEntry {
  return {
    messageId: String(row.messageId ?? ""),
    sender: {
      ownerId: row.senderOwnerId != null ? String(row.senderOwnerId) : undefined,
      displayName: String(row.senderDisplayName ?? ""),
    },
    recipient: {
      ownerId: row.recipientOwnerId != null ? String(row.recipientOwnerId) : undefined,
      displayName: row.recipientDisplayName != null ? String(row.recipientDisplayName) : undefined,
    },
    content: { text: String(row.textContent ?? "") },
    metadata: {
      timestamp: String(row.timestamp ?? ""),
      deliveryReceipt: (row.deliveryReceipt as ChatLogEntry["metadata"]["deliveryReceipt"]) ?? "sent",
    },
    signature: String(row.signature ?? ""),
  };
}

export function createMobileChatLogStore(db: MobileDatabase): MobileChatLogStore {
  return {
    async append(threadPeerOwnerId, entry) {
      await db.execute(
        `INSERT OR REPLACE INTO chat_messages
         (messageId, threadPeerOwnerId, senderOwnerId, senderDisplayName,
          recipientOwnerId, recipientDisplayName, textContent, timestamp, signature, deliveryReceipt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.messageId,
          threadPeerOwnerId,
          entry.sender.ownerId ?? null,
          entry.sender.displayName,
          entry.recipient.ownerId ?? null,
          entry.recipient.displayName ?? null,
          entry.content.text,
          entry.metadata.timestamp,
          entry.signature,
          entry.metadata.deliveryReceipt ?? "sent",
        ],
      );
    },

    async listThread(threadPeerOwnerId, limit = 800) {
      const rows = await db.query(
        `SELECT * FROM chat_messages WHERE threadPeerOwnerId = ?
         ORDER BY timestamp ASC LIMIT ?`,
        [threadPeerOwnerId, Math.max(1, Math.min(limit, 5000))],
      ) as Record<string, unknown>[];
      return rows.map(_rowToChatLogEntry);
    },
  };
}

// ---------------------------------------------------------------------------
// Identity state persistence (Phase 11 — shared/standalone identity)
// ---------------------------------------------------------------------------

export interface PersistedIdentityState {
  sharedIdentity: boolean;
  ownerId: string;
  ownerPublicKeyPem: string;
  deviceId: string;
  devicePublicKeyPem: string;
  agentPeerId: string;
  agentPublicKeyPem: string;
  homeNodePeerId?: string;
  relayUrls: string[];
  /** Home node's agent peer ID (for messaging the AI agent) */
  homeAgentPeerId?: string;
  /** Home node's agent public key PEM */
  homeAgentPubKey?: string;
  /** Owner-signed device certificate (JSON) */
  deviceCertificateJson?: string;
  /** Session token for reconnecting without re-pairing */
  sessionToken?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MobileIdentityStateStore {
  save(state: PersistedIdentityState): Promise<void>;
  load(): Promise<PersistedIdentityState | undefined>;
  clear(): Promise<void>;
}

export function createMobileIdentityStateStore(db: MobileDatabase): MobileIdentityStateStore {
  return {
    async save(state) {
      await db.execute(
        `INSERT OR REPLACE INTO identity_state
         (id, sharedIdentity, ownerId, ownerPublicKeyPem, deviceId, devicePublicKeyPem,
          agentPeerId, agentPublicKeyPem, homeNodePeerId, relayUrls,
          agentPeerId_home, agentPubKey_home, deviceCertificateJson, sessionToken,
          createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          1,
          state.sharedIdentity ? 1 : 0,
          state.ownerId,
          state.ownerPublicKeyPem,
          state.deviceId,
          state.devicePublicKeyPem,
          state.agentPeerId,
          state.agentPublicKeyPem,
          state.homeNodePeerId ?? null,
          JSON.stringify(state.relayUrls),
          state.homeAgentPeerId ?? null,
          state.homeAgentPubKey ?? null,
          state.deviceCertificateJson ?? null,
          state.sessionToken ?? null,
          state.createdAt,
          state.updatedAt,
        ],
      );
    },
    async load() {
      const rows = await db.query("SELECT * FROM identity_state WHERE id = 1");
      if (rows.length === 0) return undefined;
      return _rowToIdentityState(rows[0] as Record<string, unknown>);
    },
    async clear() {
      await db.execute("DELETE FROM identity_state WHERE id = 1");
    },
  };
}

function _rowToIdentityState(row: Record<string, unknown>): PersistedIdentityState {
  return {
    sharedIdentity: (row.sharedIdentity as number) === 1,
    ownerId: String(row.ownerId ?? ""),
    ownerPublicKeyPem: String(row.ownerPublicKeyPem ?? ""),
    deviceId: String(row.deviceId ?? ""),
    devicePublicKeyPem: String(row.devicePublicKeyPem ?? ""),
    agentPeerId: String(row.agentPeerId ?? ""),
    agentPublicKeyPem: String(row.agentPublicKeyPem ?? ""),
    homeNodePeerId: row.homeNodePeerId != null ? String(row.homeNodePeerId) : undefined,
    relayUrls: JSON.parse(String(row.relayUrls ?? "[]")),
    homeAgentPeerId: row.agentPeerId_home != null ? String(row.agentPeerId_home) : undefined,
    homeAgentPubKey: row.agentPubKey_home != null ? String(row.agentPubKey_home) : undefined,
    deviceCertificateJson: row.deviceCertificateJson != null ? String(row.deviceCertificateJson) : undefined,
    sessionToken: row.sessionToken != null ? String(row.sessionToken) : undefined,
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}
