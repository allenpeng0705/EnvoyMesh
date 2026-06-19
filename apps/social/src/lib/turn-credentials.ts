/**
 * Phase 42H — structured TURN credential editor helpers.
 *
 * These pure functions back the Settings → Network → TURN servers UI.
 * They keep the editor logic out of React so it can be unit-tested
 * without rendering.
 */

export interface IceServerEntry {
  urls: string;
  username?: string;
  credential?: string;
}

export interface TurnDraft {
  id: string;
  urls: string;
  username: string;
  credential: string;
  ttlSeconds: number;
}

let _turnIdCounter = 0;
export function makeTurnId(): string {
  _turnIdCounter += 1;
  return `turn-${Date.now().toString(36)}-${_turnIdCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function isTurnUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith("turn:") || trimmed.startsWith("turns:");
}

export function isTurnEntry(entry: IceServerEntry): boolean {
  return isTurnUrl(entry.urls);
}

/**
 * Pull only TURN entries out of the home's `iceServers` list. STUN-only
 * entries are owned by the JSON editor and stay untouched. `ttlSeconds`
 * is a local-only field (default 3600 = 1h) — the wire format doesn't
 * carry it yet.
 */
export function extractTurnServers(
  iceServers: IceServerEntry[] | undefined,
): TurnDraft[] {
  if (!Array.isArray(iceServers)) return [];
  return iceServers.filter(isTurnEntry).map((entry) => ({
    id: makeTurnId(),
    urls: entry.urls,
    username: entry.username ?? "",
    credential: entry.credential ?? "",
    ttlSeconds: 3600,
  }));
}

/**
 * Replace the TURN entries inside `iceServers` with the user's draft.
 * STUN-only entries are preserved. Empty draft rows are dropped.
 */
export function mergeTurnServers(
  iceServers: IceServerEntry[] | undefined,
  draft: TurnDraft[],
): IceServerEntry[] {
  const stunOnly = Array.isArray(iceServers)
    ? iceServers.filter((entry) => !isTurnEntry(entry))
    : [];
  const turnEntries = draft
    .filter((row) => row.urls.trim().length > 0)
    .map((row) => {
      const entry: IceServerEntry = { urls: row.urls.trim() };
      if (row.username.trim()) entry.username = row.username.trim();
      if (row.credential.trim()) entry.credential = row.credential.trim();
      return entry;
    });
  return [...stunOnly, ...turnEntries];
}

export interface TurnValidationError {
  rowId?: string;
  code: "invalidUrl" | "invalidTtl";
  message: string;
}

/**
 * Validate the draft before saving. Returns the first error found, or
 * null when every non-empty row passes.
 */
export function validateTurnDraft(
  draft: TurnDraft[],
  messages: { invalidUrl: string; invalidTtl: string },
): TurnValidationError | null {
  for (const row of draft) {
    if (!row.urls.trim()) continue;
    if (!isTurnUrl(row.urls)) {
      return { rowId: row.id, code: "invalidUrl", message: messages.invalidUrl };
    }
    if (!Number.isFinite(row.ttlSeconds) || row.ttlSeconds < 0) {
      return { rowId: row.id, code: "invalidTtl", message: messages.invalidTtl };
    }
  }
  return null;
}