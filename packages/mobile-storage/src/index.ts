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
  /** Known transport peer id (libp2p / device id) for routing envelopes when bonded or discovered. */
  libp2pPeerId?: string;
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
        libp2pPeerId: r.libp2pPeerId != null ? String(r.libp2pPeerId) : undefined,
      };
    },
    async set(entry) {
      await db.execute(
        `INSERT OR REPLACE INTO peer_directory (ownerId, multiaddrs, lastSeen, libp2pPeerId)
         VALUES (?, ?, ?, ?)` as string,
        [
          entry.ownerId,
          JSON.stringify(entry.multiaddrs),
          entry.lastSeen,
          entry.libp2pPeerId ?? null,
        ],
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
        libp2pPeerId: r.libp2pPeerId != null ? String(r.libp2pPeerId) : undefined,
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
  removeTokenByDeviceId(deviceId: string): Promise<void>;
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
      await db.execute("DELETE FROM session_tokens WHERE deviceId = ?", [record.deviceId]);
      await db.execute(
        `INSERT INTO session_tokens (token, ownerId, deviceId, displayName, createdAt, lastUsedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [record.token, record.ownerId, record.deviceId,
         record.displayName ?? null, record.createdAt, record.lastUsedAt],
      );
    },
    async removeTokenByDeviceId(deviceId) {
      await db.execute("DELETE FROM session_tokens WHERE deviceId = ?", [deviceId]);
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
      lastSeen TEXT NOT NULL,
      libp2pPeerId TEXT
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
      agentName_home TEXT,
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

/**
 * Idempotent migrations for existing SQLite databases (new columns, etc.).
 * Safe to call after {@link mobileStorageSchema} on upgrade.
 */
export async function migrateMobileStorageSchema(db: MobileDatabase): Promise<void> {
  try {
    await db.execute("ALTER TABLE peer_directory ADD COLUMN libp2pPeerId TEXT");
  } catch {
    /* column already exists */
  }
  try {
    await db.execute("ALTER TABLE chat_messages ADD COLUMN attachmentsJson TEXT");
  } catch {
    /* column already exists */
  }
  try {
    await db.execute("ALTER TABLE identity_state ADD COLUMN agentName_home TEXT");
  } catch {
    /* column already exists */
  }
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
    attachments?: Array<{
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      sensitivity: "public" | "friends" | "private";
      vaultRelativePath?: string;
    }>;
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
  deleteMessage(threadPeerOwnerId: string, messageId: string): Promise<boolean>;
  clearThread(threadPeerOwnerId: string): Promise<number>;
}

function _parseAttachmentsJson(raw: unknown): ChatLogEntry["content"]["attachments"] {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function _rowToChatLogEntry(row: Record<string, unknown>): ChatLogEntry {
  const attachments = _parseAttachmentsJson(row.attachmentsJson);
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
    content: {
      text: String(row.textContent ?? ""),
      ...(attachments ? { attachments } : {}),
    },
    metadata: {
      timestamp: String(row.timestamp ?? ""),
      deliveryReceipt: _normalizeDeliveryReceipt(row.deliveryReceipt),
    },
    signature: String(row.signature ?? ""),
  };
}

const _deliveryReceiptValues = new Set(["sent", "delivered", "read"]);
function _normalizeDeliveryReceipt(v: unknown): "sent" | "delivered" | "read" {
  if (typeof v === "string" && _deliveryReceiptValues.has(v)) {
    return v as "sent" | "delivered" | "read";
  }
  return "sent";
}

export function createMobileChatLogStore(db: MobileDatabase): MobileChatLogStore {
  return {
    async append(threadPeerOwnerId, entry) {
      await db.execute(
        `INSERT OR REPLACE INTO chat_messages
         (messageId, threadPeerOwnerId, senderOwnerId, senderDisplayName,
          recipientOwnerId, recipientDisplayName, textContent, timestamp, signature, deliveryReceipt, attachmentsJson)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          entry.content.attachments?.length
            ? JSON.stringify(entry.content.attachments)
            : null,
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

    async deleteMessage(threadPeerOwnerId, messageId) {
      const thread = threadPeerOwnerId.trim();
      const id = messageId.trim();
      if (!thread || !id) return false;
      const before = await db.query(
        `SELECT messageId FROM chat_messages WHERE threadPeerOwnerId = ? AND messageId = ? LIMIT 1`,
        [thread, id],
      ) as Record<string, unknown>[];
      if (before.length === 0) return false;
      await db.execute(
        `DELETE FROM chat_messages WHERE threadPeerOwnerId = ? AND messageId = ?`,
        [thread, id],
      );
      return true;
    },

    async clearThread(threadPeerOwnerId) {
      const thread = threadPeerOwnerId.trim();
      if (!thread) return 0;
      const rows = await db.query(
        `SELECT messageId FROM chat_messages WHERE threadPeerOwnerId = ?`,
        [thread],
      ) as Record<string, unknown>[];
      if (rows.length === 0) return 0;
      await db.execute(`DELETE FROM chat_messages WHERE threadPeerOwnerId = ?`, [thread]);
      return rows.length;
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
  /** Home bridge agent display name (from bridge-config.json) */
  homeAgentName?: string;
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
          createdAt, updatedAt, agentName_home)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          state.homeAgentName ?? null,
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
    sharedIdentity: Number(row.sharedIdentity) === 1,
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
    homeAgentName: row.agentName_home != null ? String(row.agentName_home) : undefined,
    deviceCertificateJson: row.deviceCertificateJson != null ? String(row.deviceCertificateJson) : undefined,
    sessionToken: row.sessionToken != null ? String(row.sessionToken) : undefined,
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

// ---------------------------------------------------------------------------
// In-memory database (dev/testing fallback)
// ---------------------------------------------------------------------------

/**
 * In-memory MobileDatabase for testing and development.
 * Supports INSERT/REPLACE, SELECT with WHERE/ORDER BY/LIMIT, and DELETE.
 */
export function createInMemoryDb(): MobileDatabase {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();

  function ensureTable(name: string): Map<string, Record<string, unknown>> {
    let t = tables.get(name);
    if (!t) {
      t = new Map();
      tables.set(name, t);
    }
    return t;
  }

  function parseColumns(sql: string): string[] {
    const m = sql.match(/\(([^)]+)\)/);
    if (!m) return [];
    return m[1].split(",").map((c) => c.trim());
  }

  return {
    async open() {},
    async close() {},
    async query(_sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> {
      const fromMatch = _sql.match(/FROM\s+(\w+)/i);
      const tableName = fromMatch?.[1] ?? "unknown";
      const t = ensureTable(tableName);
      let rows = [...t.values()];

      // WHERE filtering
      const whereMatch = _sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
      if (whereMatch && _params?.[0] !== undefined) {
        const col = whereMatch[1];
        const val = String(_params[0]);
        rows = rows.filter((r) => String(r[col] ?? "") === val);
      }

      // ORDER BY (single column, optional DESC/ASC)
      const orderMatch = _sql.match(/ORDER BY\s+(\w+)(?:\s+(DESC|ASC))?/i);
      if (orderMatch) {
        const col = orderMatch[1];
        const desc = orderMatch[2]?.toUpperCase() === "DESC";
        rows.sort((a, b) => {
          const av = String(a[col] ?? "");
          const bv = String(b[col] ?? "");
          return desc ? bv.localeCompare(av) : av.localeCompare(bv);
        });
      }

      // LIMIT (hardcoded number)
      const limitMatch = _sql.match(/LIMIT\s+(\d+)/i);
      if (limitMatch) {
        rows = rows.slice(0, parseInt(limitMatch[1], 10));
      }

      // LIMIT with ? placeholder — use the last numeric param
      const limitParamMatch = _sql.match(/LIMIT\s+\?/i);
      if (limitParamMatch) {
        const limitVal = _params?.[_params.length - 1];
        if (typeof limitVal === "number") {
          rows = rows.slice(0, limitVal);
        }
      }

      return rows;
    },
    async execute(sql: string, params?: unknown[]): Promise<void> {
      const upper = sql.toUpperCase();
      const intoMatch = sql.match(/INTO\s+(\w+)/i);
      const fromMatch = sql.match(/FROM\s+(\w+)/i);

      if (upper.includes("INSERT") || upper.includes("REPLACE")) {
        if (!intoMatch || !params) return;
        const tableName = intoMatch[1];
        const t = ensureTable(tableName);
        const cols = parseColumns(sql);
        const row: Record<string, unknown> = {};
        for (let i = 0; i < cols.length; i++) {
          row[cols[i]] = params[i] ?? null;
        }
        t.set(String(params[0] ?? "row"), row);
      } else if (upper.includes("DELETE")) {
        if (!fromMatch) return;
        const tableName = fromMatch[1];
        const t = ensureTable(tableName);

        const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
        if (whereMatch && params?.[0] !== undefined) {
          const col = whereMatch[1];
          const val = String(params[0]);
          for (const [key, row] of t) {
            if (String(row[col] ?? "") === val) t.delete(key);
          }
        } else {
          t.clear();
        }
      }
    },
  };
}
