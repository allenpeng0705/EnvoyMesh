/**
 * Review / App Store demo pairing — optional long-lived QR token.
 *
 * Default: OFF. End-user DMG / Tauri / normal installs never enable this.
 * For a terminal demo home used by Apple/Google review, set env vars or
 * node-config.json fields below.
 *
 * Env (preferred for a throwaway review node):
 *   ENVOY_REVIEW_PAIRING=1
 *   ENVOY_REVIEW_PAIRING_TOKEN=<secret>
 *   ENVOY_REVIEW_PAIRING_DAYS=14          # optional, default 14
 *   ENVOY_REVIEW_PAIRING_EXPIRES_AT=ISO   # optional, overrides DAYS
 *
 * node-config.json (optional):
 *   "reviewPairingEnabled": true,
 *   "reviewPairingToken": "...",
 *   "reviewPairingExpiresAt": "2026-08-15T00:00:00.000Z",
 *   "reviewPairingTtlDays": 14
 *
 * Env wins over file when both are set. Missing token → treated as disabled.
 */

export interface ReviewPairingSettings {
  enabled: boolean;
  token: string;
  /** Absolute expiry (ms epoch). */
  expiresAtMs: number;
}

export interface ReviewPairingConfigSource {
  reviewPairingEnabled?: boolean;
  reviewPairingToken?: string;
  reviewPairingExpiresAt?: string;
  reviewPairingTtlDays?: number;
}

const DEFAULT_TTL_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Process-start anchor so DAYS stays stable across getPairingPayload calls. */
let envDaysAnchorMs: number | undefined;

function envFlagTrue(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function parseExpiresAt(iso: string | undefined, ttlDays: number, nowMs: number): number {
  if (iso?.trim()) {
    const parsed = Date.parse(iso.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return nowMs + Math.max(1, ttlDays) * MS_PER_DAY;
}

/**
 * Resolve review pairing from env + optional persisted config.
 * Returns null when disabled or misconfigured (no token).
 */
export function resolveReviewPairing(
  file?: ReviewPairingConfigSource | null,
  env: NodeJS.ProcessEnv = process.env,
  nowMs: number = Date.now(),
): ReviewPairingSettings | null {
  const envEnabled = envFlagTrue(env.ENVOY_REVIEW_PAIRING);
  const fileEnabled = file?.reviewPairingEnabled === true;
  if (!envEnabled && !fileEnabled) return null;

  const token = (
    env.ENVOY_REVIEW_PAIRING_TOKEN?.trim() ||
    file?.reviewPairingToken?.trim() ||
    ""
  );
  if (!token) {
    console.warn(
      "[review-pairing] enabled but reviewPairingToken / ENVOY_REVIEW_PAIRING_TOKEN is empty — ignoring",
    );
    return null;
  }

  const ttlDaysRaw =
    env.ENVOY_REVIEW_PAIRING_DAYS?.trim() ||
    (file?.reviewPairingTtlDays != null ? String(file.reviewPairingTtlDays) : "");
  const ttlDays = ttlDaysRaw ? Number(ttlDaysRaw) : DEFAULT_TTL_DAYS;
  const safeDays = Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : DEFAULT_TTL_DAYS;

  const expiresIso =
    env.ENVOY_REVIEW_PAIRING_EXPIRES_AT?.trim() ||
    file?.reviewPairingExpiresAt?.trim();

  // Anchor DAYS from first resolve in this process so the QR does not
  // silently slide forward on every getPairingPayload call.
  if (!expiresIso) {
    envDaysAnchorMs ??= nowMs;
  }
  const anchor = expiresIso ? nowMs : (envDaysAnchorMs ?? nowMs);
  const expiresAtMs = parseExpiresAt(expiresIso, safeDays, anchor);

  if (expiresAtMs <= nowMs) {
    console.warn("[review-pairing] token expired — treating as disabled");
    return null;
  }

  return { enabled: true, token, expiresAtMs };
}

/** Loud startup banner so demo nodes are obvious in terminal logs. */
export function logReviewPairingBanner(settings: ReviewPairingSettings | null): void {
  if (!settings) return;
  const until = new Date(settings.expiresAtMs).toISOString();
  console.warn(
    `[review-pairing] ENABLED until ${until} — long-lived QR token for store review only. ` +
      `Do not enable on end-user DMG/Tauri installs.`,
  );
}

/** @internal test helper */
export function resetReviewPairingAnchorForTests(): void {
  envDaysAnchorMs = undefined;
}
