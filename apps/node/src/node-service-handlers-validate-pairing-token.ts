/**
 * validatePairingToken runtime (Step 45).
 *
 * Extracted from `node-service-impl.ts`. Validates a pairing token
 * against:
 *   0. optional review / App Store demo token (long TTL, opt-in)
 *   1. in-memory QR pairing token (30-min TTL)
 *   2. persisted session-token store
 *   3. company invites
 *
 * Returns true if the token is valid.
 */
import type { SessionTokenStore, LocalTaskStore } from "@envoymesh/local-store";
import {
  isActiveReviewPairingToken,
  type ReviewPairingSettings,
} from "./review-pairing.js";

export interface ValidatePairingTokenContext {
  /** Opt-in store-review long-lived token (null when disabled). */
  getReviewPairing():
    | ReviewPairingSettings
    | null
    | Promise<ReviewPairingSettings | null>;
  /** In-memory QR pairing token (if any). */
  getInMemoryToken(): string | undefined;
  /** When the in-memory token was issued (ms epoch). */
  getInMemoryTokenIssuedAt(): number | undefined;
  /** TTL for the in-memory QR pairing token (ms). */
  getInMemoryTokenTtlMs(): number;
  /** Session token store (for persisted tokens). */
  getSessionTokenStore(): SessionTokenStore | undefined;
  /** Local task store (for company invites). */
  getTaskStore(): LocalTaskStore | undefined;
}

export async function validatePairingTokenViaRuntime(
  ctx: ValidatePairingTokenContext,
  token: string,
): Promise<boolean> {
  const t = token.trim();
  if (!t) return false;

  // 0. Review / App Store demo token (opt-in, long TTL).
  // Accepts owner tok and derived family.<tok> (same ENVOY_REVIEW_PAIRING_* TTL).
  const review = await Promise.resolve(ctx.getReviewPairing());
  if (isActiveReviewPairingToken(review, t)) {
    return true;
  }

  // 1. Check in-memory QR pairing token.
  const memToken = ctx.getInMemoryToken();
  const memIssuedAt = ctx.getInMemoryTokenIssuedAt();
  if (memToken && memIssuedAt !== undefined && t === memToken) {
    if (Date.now() - memIssuedAt <= ctx.getInMemoryTokenTtlMs()) {
      return true;
    }
  }

  // 2. Check persisted session token store.
  const store = ctx.getSessionTokenStore();
  if (store) {
    const record = await store.getTokenByValue(t);
    if (record) {
      record.lastUsedAt = new Date().toISOString();
      await store.setToken(record);
      return true;
    }
  }

  // 3. Company invites. A non-revoked, unexpired invite is valid.
  const taskStore = ctx.getTaskStore();
  if (taskStore) {
    const invite = await taskStore.findCompanyInviteByToken(t);
    if (invite && !invite.revokedAt && Date.parse(invite.expiresAt) > Date.now()) {
      return true;
    }
  }
  return false;
}
