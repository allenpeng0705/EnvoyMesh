/**
 * Attaching a second EnvoyMesh app to a running node.
 *
 * ## The model
 *
 * A product on the same machine joins the group by asking the running node for a
 * session of its **own** — not by reading the owner's key, and not by borrowing the
 * owner's scope. Two things make that safe:
 *
 *   * the request is **loopback-only**, enforced by the transport
 *     (`loopbackOnlyMethods`), so the trust basis is exactly the one the owner's own
 *     UI already has — being on this machine;
 *   * the session it returns carries a **product scope** (`product:<Name>`) with
 *     `isOwnerProfile: false`, so `requireOwnerProfile` keeps refusing owner-only
 *     RPCs. Least privilege by construction, not by good intentions.
 *
 * ## What is shared here
 *
 * The method name and the scope encoding, because two sides have to agree on them
 * and a string literal in each is how they stop agreeing. Everything else — who may
 * attach, what a product may then call — is policy and stays with the product.
 *
 * Design: `docs/envoymesh-multi-product-design.md` §7.
 */

import type { RunningNode } from "./node-registry.js";

/** The loopback-only, pre-auth RPC a product calls to get its own session. */
export const ATTACH_LOCAL_PRODUCT_METHOD = "attachLocalProduct";

const PRODUCT_SCOPE_PREFIX = "product:";

/** Names are shown to the user and stored, so keep them boring and bounded. */
const PRODUCT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9 _-]{1,39}$/;

/**
 * The scope key a product's session runs under.
 *
 * A prefix rather than a separate field so existing policy — which is written
 * against `scopeKey` — can recognise a product scope without a schema change, and
 * so a product scope can never collide with a family profile id.
 */
export function productScopeKey(product: string): string {
  const name = product.trim();
  if (!name) throw new Error("productScopeKey: product name is required");
  return `${PRODUCT_SCOPE_PREFIX}${name}`;
}

/** True for a product scope key — the predicate policy should branch on. */
export function isProductScope(scopeKey: string | undefined): scopeKey is string {
  return typeof scopeKey === "string" && scopeKey.startsWith(PRODUCT_SCOPE_PREFIX);
}

/** The product name behind a scope key, or `null`. */
export function productFromScope(scopeKey: string | undefined): string | null {
  if (!isProductScope(scopeKey)) return null;
  const name = scopeKey.slice(PRODUCT_SCOPE_PREFIX.length).trim();
  return name.length > 0 ? name : null;
}

/** Validate a product name before it becomes a scope, a token record or a log line. */
export function isValidProductName(product: string | undefined): boolean {
  return typeof product === "string" && PRODUCT_NAME_PATTERN.test(product.trim());
}

export interface AttachProductRequest {
  product: string;
  version?: string;
}

export interface AttachedProductSession {
  /** Session token the product presents on its WebSocket URL (`?token=…`). */
  token: string;
  /** `product:<Name>` — never the owner's scope. */
  scopeKey: string;
  ownerId: string;
  /** Ready-to-dial URL, so the caller does not reassemble it from parts. */
  wsUrl: string;
}

/**
 * What `resolveRunningNode` must have found before an attach can be attempted.
 *
 * Expressed as a type so a product cannot pass a merely *unverified* node — the
 * whole point of that check is that "something answers on the port" is not the same
 * as "the owner's node is there".
 */
export type VerifiedRunningNode = RunningNode & { status: "running"; wsUrl: string };

// ─── which app a pairing code belongs to ────────────────────────────────────────

/**
 * The app this process *is*, for pairing and identity purposes.
 *
 * Every product in the group mints its own pairing codes, and a phone app belongs to
 * one product. `ENVOYMESH_APP_NAME` exists so a future product states it once, in its
 * launcher, rather than a literal appearing in several places.
 */
export const DEFAULT_APP_NAME = "EnvoyMesh";

export function resolveAppName(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env["ENVOYMESH_APP_NAME"]?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_APP_NAME;
}

/**
 * Why a pairing code from another app must be refused, or `null` when it is fine.
 *
 * Returns an **end-user sentence**, not a code: the person holding the phone is the
 * one who has to act on it, and "app mismatch" tells them nothing. `codeApp`
 * undefined means the code predates the field — accepted, because refusing it would
 * break every QR already printed, and the phone app still has to authenticate.
 */
export function pairingAppMismatch(
  codeApp: string | undefined,
  nodeApp: string = resolveAppName(),
): string | null {
  const claimed = codeApp?.trim();
  if (!claimed) return null;
  if (claimed === nodeApp.trim()) return null;
  return (
    `That code was made by ${claimed}, and this is ${nodeApp}. ` +
    `Open ${claimed} and show its pairing code, or install ${claimed} here.`
  );
}
