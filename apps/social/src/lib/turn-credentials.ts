/**
 * Phase 42H — structured TURN credential editor helpers.
 *
 * These pure functions back the Settings → Network → TURN servers UI.
 * They keep the editor logic out of React so it can be unit-tested
 * without rendering.
 *
 * Decision (Phase 42 plan §5.2 / Decision #3): TURN is user-configured,
 * NOT EnvoyMesh-minted. The `username` + `credential` fields are
 * long-lived secrets the user pastes from their TURN provider. The
 * earlier `ttlSeconds` placeholder was a stub for an ephemeral-credential
 * minting path that was explicitly dropped; removed here.
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
 * Phase 42H — recommended TURN provider URL templates. The editor
 * presents these as presets; selecting one pre-fills the URL row so
 * the user only has to paste the provider's username/credential.
 *
 * `{host}` / `{port}` are placeholders the user replaces.
 */
export interface TurnPreset {
  id: "twilio" | "cloudflare" | "coturn";
  label: string;
  /** The URL template — the user may need to edit transport or port. */
  urls: string;
}

export const TURN_PRESETS: readonly TurnPreset[] = [
  {
    id: "twilio",
    label: "Twilio Network Traversal",
    urls: "turn:global.turn.twilio.com:3478?transport=udp",
  },
  {
    id: "cloudflare",
    label: "Cloudflare Calls",
    urls: "turn:turn.cloudflare.com:3478?transport=udp",
  },
  {
    id: "coturn",
    label: "Self-hosted coturn",
    urls: "turn:{your-server}:3478?transport=udp",
  },
];

export function presetById(id: string): TurnPreset | undefined {
  return TURN_PRESETS.find((p) => p.id === id);
}

/**
 * Pull only TURN entries out of the home's `iceServers` list. STUN-only
 * entries are owned by the JSON editor and stay untouched.
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
  }));
}

/**
 * Replace the TURN entries inside `iceServers` with the user's draft.
 * STUN-only entries are preserved. Empty draft rows are dropped.
 * Rows failing the TURN-shape validation (non-`turn:` URL or missing
 * credentials) are dropped too — `validateTurnDraft` should have been
 * run first and surfaced the issue to the user, so reaching here with
 * invalid rows indicates a programmer error.
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
    .filter((row) => {
      if (!isTurnUrl(row.urls)) return false;
      // Drop rows with missing credentials — a TURN URL with no auth
      // will be rejected by every WebRTC stack.
      if (!row.username.trim() || !row.credential.trim()) return false;
      return true;
    })
    .map((row) => {
      const entry: IceServerEntry = {
        urls: row.urls.trim(),
        username: row.username.trim(),
        credential: row.credential.trim(),
      };
      return entry;
    });
  return [...stunOnly, ...turnEntries];
}

export interface TurnValidationError {
  rowId?: string;
  code: "invalidUrl" | "missingCredentials";
  message: string;
}

/**
 * Validate the draft before saving. Returns the first error found, or
 * null when every non-empty row passes.
 *
 * Rules:
 *   - URL must start with `turn:` (or `turns:`).
 *   - TURN entries MUST have both username and credential, otherwise
 *     the entry is useless (every WebRTC stack rejects it). This used
 *     to be silently allowed; that let users save broken TURN entries.
 */
export function validateTurnDraft(
  draft: TurnDraft[],
  messages: {
    invalidUrl: string;
    missingCredentials: string;
  },
): TurnValidationError | null {
  for (const row of draft) {
    if (!row.urls.trim()) continue;
    if (!isTurnUrl(row.urls)) {
      return { rowId: row.id, code: "invalidUrl", message: messages.invalidUrl };
    }
    if (!row.username.trim() || !row.credential.trim()) {
      return {
        rowId: row.id,
        code: "missingCredentials",
        message: messages.missingCredentials,
      };
    }
  }
  return null;
}