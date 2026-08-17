/**
 * Company invite store — Phase 35A (Fleet Onboarding A: Company invite link).
 *
 * Persists long-lived invite tokens minted by the home node's "Company invites"
 * section. Each invite carries the data the joining node needs to call
 * `pairDevice` (wsUrl, ownerId, agent info) plus lifecycle state (created,
 * consumed, revoked, expired). Writes are atomic rename; concurrent edits go
 * through a single write chain so we never lose a state transition.
 *
 * Lifetime is bounded by `expiresAt`. Tokens are opaque base64url; this store
 * is the only source of truth for "is this invite valid right now?".
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const COMPANY_INVITES_FILE = "company-invites.json";

/**
 * Persisted record for a single company invite. The token is the bearer secret
 * the joining side presents in `pairDevice.pairingToken`; the home node's
 * `validatePairingToken` resolves it by calling `findInviteByToken`.
 */
export interface CompanyInviteRecord {
  /** Server-assigned id (also used in the `envoy://invite` URI as `id`). */
  inviteId: string;
  /** 32-byte random bearer token, base64url-encoded. Opaque to callers. */
  token: string;
  ownerId: string;
  ownerPublicKey?: string;
  agentPeerId?: string;
  agentName?: string;
  wsUrl: string;
  lanWsUrl?: string;
  relayWsUrl?: string;
  /**
   * Extra Envoy relay WebSocket bases for fallback (mirrors
   * `PairingPayload.relayWsUrls`). Serialized into the invite URI as
   * comma-joined `rels` so mobile has regional relay fallback without
   * relying only on the primary `relayWsUrl`.
   */
  relayWsUrls?: string[];
  homeNodePeerId?: string;
  /**
   * Phase 51 — `"family"` for family-member pairing; omit/`"company"` for fleet.
   */
  kind?: "company" | "family";
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. After this point, the token is rejected. */
  expiresAt: string;
  /** ISO 8601, set when consumed. */
  usedAt?: string;
  usedByDeviceId?: string;
  /** ISO 8601, set when an admin revokes the invite. */
  revokedAt?: string;
  /** Free-text label shown in the UI table. */
  note?: string;
}

interface CompanyInvitesFile {
  version: "0.1";
  invites: CompanyInviteRecord[];
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export interface LocalCompanyInviteStore {
  /** Persist (insert or update) a single invite record by `inviteId`. */
  saveInvite(record: CompanyInviteRecord): Promise<void>;
  /** Get an invite by id. */
  getInvite(inviteId: string): Promise<CompanyInviteRecord | undefined>;
  /** Get an invite by its bearer token. */
  findByToken(token: string): Promise<CompanyInviteRecord | undefined>;
  /** List all invites (active + historical). */
  listInvites(): Promise<CompanyInviteRecord[]>;
}

export function createLocalCompanyInviteStore(profileDir: string): LocalCompanyInviteStore {
  const filePath = join(profileDir, COMPANY_INVITES_FILE);
  let writeChain: Promise<void> = Promise.resolve();

  async function loadFile(): Promise<CompanyInvitesFile> {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as CompanyInvitesFile;
      if (parsed.version !== "0.1" || !Array.isArray(parsed.invites)) {
        return { version: "0.1", invites: [] };
      }
      return parsed;
    } catch (error) {
      if (isMissingFileError(error)) return { version: "0.1", invites: [] };
      throw error;
    }
  }

  async function writeFileAtomic(data: CompanyInvitesFile): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await rename(tmp, filePath);
  }

  function enqueueWrite(task: () => Promise<void>): Promise<void> {
    const done = writeChain.then(task);
    writeChain = done.then(
      () => {},
      () => {},
    );
    return done;
  }

  return {
    async saveInvite(record) {
      await enqueueWrite(async () => {
        const file = await loadFile();
        const idx = file.invites.findIndex((r) => r.inviteId === record.inviteId);
        if (idx >= 0) {
          file.invites[idx] = record;
        } else {
          file.invites.push(record);
        }
        await writeFileAtomic(file);
      });
    },

    async getInvite(inviteId) {
      const file = await loadFile();
      return file.invites.find((r) => r.inviteId === inviteId);
    },

    async findByToken(token) {
      const trimmed = token.trim();
      if (!trimmed) return undefined;
      const file = await loadFile();
      return file.invites.find((r) => r.token === trimmed);
    },

    async listInvites() {
      const file = await loadFile();
      return file.invites.slice();
    },
  };
}
