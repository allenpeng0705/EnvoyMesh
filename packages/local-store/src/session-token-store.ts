import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const SESSION_TOKENS_FILE = "session-tokens.json";

/**
 * A persistent session token issued to a paired mobile device.
 * After the initial QR scan + pairDevice RPC, the mobile app stores this
 * token locally and uses it for future reconnections — no QR re-scan needed.
 */
export interface SessionTokenRecord {
  /** The session token value (UUID). */
  token: string;
  /** The home owner identity (e.g. "envoy:owner:abc123"). */
  ownerId: string;
  /** The requester's device identity (e.g. "envoy:device:xyz"). */
  deviceId: string;
  /**
   * Family Network (Phase 51) — which local profile this device is locked to.
   * Missing on legacy tokens; readers should treat as the owner profile id.
   */
  profileId?: string;
  /** Platform hint ("ios" | "android" | "flutter" | …). */
  platform?: string;
  /** Human label for management UI ("Companion" / "Phone" etc.). */
  displayName?: string;
  /** ISO 8601 — when the token was created. */
  createdAt: string;
  /** ISO 8601 — updated on every successful token validation (touch). */
  lastUsedAt: string;
}

interface SessionTokensFile {
  version: "0.1";
  records: SessionTokenRecord[];
}

export interface SessionTokenStore {
  /** List all session tokens (for management UI). */
  listTokens(): Promise<SessionTokenRecord[]>;
  /** Look up a token by its value. Returns undefined if not found. */
  getTokenByValue(token: string): Promise<SessionTokenRecord | undefined>;
  /**
   * Upsert a token record by deviceId.
   * Replaces any existing record for the same deviceId.
   */
  setToken(record: SessionTokenRecord): Promise<void>;
  /** Remove the session token for a specific device. */
  removeTokenByDeviceId(deviceId: string): Promise<void>;
  /** Remove all tokens for a given ownerId (e.g. when bond is revoked). */
  removeTokensForOwner(ownerId: string): Promise<void>;
  /** Phase 51 — remove all tokens locked to a family profile id. */
  removeTokensForProfile(profileId: string): Promise<number>;
}

export function createSessionTokenStore(profileDir: string): SessionTokenStore {
  const filePath = join(profileDir, SESSION_TOKENS_FILE);

  // Serial mutex to prevent interleaved read-modify-write operations.
  // Multiple concurrent calls to setToken / removeTokensForOwner / validatePairingToken
  // must not overwrite each other's changes.
  let mutex: Promise<SessionTokenRecord[]> = readRecords();

  async function readRecords(): Promise<SessionTokenRecord[]> {
    try {
      const raw = await readFile(filePath, "utf8");
      if (!raw.trim()) {
        return [];
      }
      const data = JSON.parse(raw) as SessionTokensFile;
      const records = Array.isArray(data?.records) ? data.records : [];
      return records.map(normalizeSessionRecord);
    } catch (error) {
      if (isMissingFileError(error)) {
        return [];
      }
      // Corrupted JSON or unreadable file — warn and start fresh.
      // The next write will overwrite the corrupted file with valid data.
      console.warn(
        `[session-token-store] failed to read ${basename(filePath)}, starting fresh: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  async function writeRecords(records: SessionTokenRecord[]): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    const data: SessionTokensFile = { version: "0.1", records };
    const content = JSON.stringify(data, null, 2) + "\n";
    // Verify it round-trips before writing
    JSON.parse(content);
    const tmpPath = `${filePath}.tmp.${Date.now()}.${randomUUID().slice(0, 8)}`;
    await writeFile(tmpPath, content, { mode: 0o600 });
    await rename(tmpPath, filePath);
  }

  /**
   * Serialise a read-modify-write operation so concurrent callers cannot
   * interleave and lose records.
   */
  function serialised<T>(fn: (records: SessionTokenRecord[]) => Promise<{ records: SessionTokenRecord[]; result: T }>): Promise<T> {
    const prev = mutex;
    let resolveOuter: (value: T) => void;
    let rejectOuter: (reason?: unknown) => void;
    const outerPromise = new Promise<T>((resolve, reject) => {
      resolveOuter = resolve;
      rejectOuter = reject;
    });

    mutex = prev.then(async (records) => {
      try {
        const { records: updated, result } = await fn(records);
        await writeRecords(updated);
        resolveOuter(result);
        return updated;
      } catch (error) {
        // Read current state on failure so the mutex chain stays consistent
        rejectOuter(error);
        try {
          return await readRecords();
        } catch {
          return [];
        }
      }
    });

    // Swallow unhandled rejections on the mutex chain itself
    mutex.catch(() => {});

    return outerPromise;
  }

  return {
    async listTokens(): Promise<SessionTokenRecord[]> {
      // Read-only — can bypass the mutex for responsiveness
      try {
        return await readRecords();
      } catch {
        return [];
      }
    },

    async getTokenByValue(token: string): Promise<SessionTokenRecord | undefined> {
      // Read-only — can bypass the mutex
      if (!token) {
        return undefined;
      }
      try {
        const records = await readRecords();
        return records.find((r) => r.token === token);
      } catch {
        return undefined;
      }
    },

    async setToken(record: SessionTokenRecord): Promise<void> {
      await serialised<void>(async (records) => {
        const idx = records.findIndex((r) => r.deviceId === record.deviceId);
        if (idx >= 0) {
          records[idx] = record;
        } else {
          records.push(record);
        }
        return { records, result: undefined };
      });
    },

    async removeTokenByDeviceId(deviceId: string): Promise<void> {
      await serialised<void>(async (records) => {
        const filtered = records.filter((r) => r.deviceId !== deviceId);
        return { records: filtered, result: undefined };
      });
    },

    async removeTokensForOwner(ownerId: string): Promise<void> {
      await serialised<void>(async (records) => {
        const filtered = records.filter((r) => r.ownerId !== ownerId);
        return { records: filtered, result: undefined };
      });
    },

    async removeTokensForProfile(profileId: string): Promise<number> {
      const pid = profileId.trim();
      if (!pid) return 0;
      return serialised<number>(async (records) => {
        const filtered = records.filter((r) => r.profileId !== pid);
        return { records: filtered, result: records.length - filtered.length };
      });
    },
  };
}

function normalizeSessionRecord(raw: SessionTokenRecord): SessionTokenRecord {
  return {
    ...raw,
    profileId: typeof raw.profileId === "string" && raw.profileId.trim()
      ? raw.profileId.trim()
      : undefined,
    platform: typeof raw.platform === "string" && raw.platform.trim()
      ? raw.platform.trim()
      : undefined,
  };
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "ENOENT"
  );
}
