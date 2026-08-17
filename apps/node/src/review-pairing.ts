/**
 * Review / App Store demo pairing — optional long-lived QR token.
 *
 * Default: OFF. End-user DMG / Tauri / normal installs never enable this.
 * For a terminal demo home used by Apple/Google review, set env vars or
 * node-config.json fields below.
 *
 * Two modes:
 *  1. Owner + family (default): the owner QR binds the scanner as OWNER and a
 *     separate family invite QR binds family members. For demos where a
 *     reviewer may legitimately be the home's owner.
 *  2. Family-only (Apple review): `ENVOY_APPLE_REVIEW=1` (or
 *     `reviewPairingFamilyOnly`). Every QR — including the EnvoyGo owner QR —
 *     embeds the derived `family.<token>` and `pairThinClient` ALWAYS binds
 *     the scanner as a family member, never the owner. Default TTL is 30 days.
 *
 * Env (preferred for a throwaway review node):
 *   ENVOY_APPLE_REVIEW=1                  # single flag: family-only + 30-day TTL
 *   ENVOY_REVIEW_PAIRING=1                # review mode (owner+family)
 *   ENVOY_REVIEW_PAIRING_TOKEN=<secret>
 *   ENVOY_REVIEW_PAIRING_FAMILY_ONLY=1    # force family-only (with REVIEW_PAIRING)
 *   ENVOY_REVIEW_PAIRING_DAYS=14          # optional, default 14 (30 in family-only)
 *   ENVOY_REVIEW_PAIRING_EXPIRES_AT=ISO   # optional, overrides DAYS
 *
 * node-config.json (optional):
 *   "reviewPairingEnabled": true,
 *   "reviewPairingToken": "...",
 *   "reviewPairingFamilyOnly": true,
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
  /**
   * Family-only review mode: EnvoyGo QR embeds the family token and pairing
   * can NEVER bind the scanner as the home owner.
   */
  familyOnly: boolean;
}

export interface ReviewPairingConfigSource {
  reviewPairingEnabled?: boolean;
  reviewPairingToken?: string;
  reviewPairingExpiresAt?: string;
  reviewPairingTtlDays?: number;
  reviewPairingFamilyOnly?: boolean;
}

const DEFAULT_TTL_DAYS = 14;
const APPLE_REVIEW_DEFAULT_TTL_DAYS = 30;
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
  // Single umbrella flag for the Apple-review build: implies review pairing,
  // forces family-only semantics, and defaults the TTL to 30 days.
  const appleReview = envFlagTrue(env.ENVOY_APPLE_REVIEW);
  const envEnabled = envFlagTrue(env.ENVOY_REVIEW_PAIRING);
  const fileEnabled = file?.reviewPairingEnabled === true;
  if (!appleReview && !envEnabled && !fileEnabled) return null;

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

  const familyOnly =
    appleReview ||
    envFlagTrue(env.ENVOY_REVIEW_PAIRING_FAMILY_ONLY) ||
    file?.reviewPairingFamilyOnly === true;

  const ttlDaysRaw =
    env.ENVOY_REVIEW_PAIRING_DAYS?.trim() ||
    (file?.reviewPairingTtlDays != null ? String(file.reviewPairingTtlDays) : "");
  const defaultTtl = familyOnly ? APPLE_REVIEW_DEFAULT_TTL_DAYS : DEFAULT_TTL_DAYS;
  const ttlDays = ttlDaysRaw ? Number(ttlDaysRaw) : defaultTtl;
  const safeDays = Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : defaultTtl;

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

  return { enabled: true, token, expiresAtMs, familyOnly };
}

/**
 * Family-invite bearer derived from the owner review token.
 * Same TTL / env controls, different string so owner QR (`envoy://pair`) and
 * family invite (`envoy://invite`) never collide in `pairThinClient`.
 */
export function reviewFamilyInviteToken(ownerReviewToken: string): string {
  return `family.${ownerReviewToken.trim()}`;
}

/**
 * True when `token` is the active store-review pairing secret (owner or
 * family-invite derived form) and not expired. Used so Apple/Google can
 * re-use one family QR across devices during the review window.
 */
export function isActiveReviewPairingToken(
  settings: ReviewPairingSettings | null | undefined,
  token: string,
  nowMs: number = Date.now(),
): boolean {
  const t = token.trim();
  if (!settings?.enabled || !t) return false;
  if (nowMs >= settings.expiresAtMs) return false;
  if (t === settings.token) return true;
  return t === reviewFamilyInviteToken(settings.token);
}

/** Loud startup banner so demo nodes are obvious in terminal logs. */
export function logReviewPairingBanner(settings: ReviewPairingSettings | null): void {
  if (!settings) return;
  const until = new Date(settings.expiresAtMs).toISOString();
  const mode = settings.familyOnly
    ? "FAMILY-ONLY (reviewers can never become the owner)"
    : "owner + family invite";
  console.warn(
    `[review-pairing] ENABLED until ${until} — ${mode}, long-lived QR for store review only. ` +
      `Do not enable on end-user DMG/Tauri installs.`,
  );
}

/** @internal test helper */
export function resetReviewPairingAnchorForTests(): void {
  envDaysAnchorMs = undefined;
}
