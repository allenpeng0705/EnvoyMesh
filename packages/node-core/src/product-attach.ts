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
//
// The rule lives in `@envoymesh/protocol` (browser-safe, dependency-free) so a web UI
// can apply it without dragging a node runtime into its bundle. Re-exported here so a
// node-side consumer keeps importing it from the package it already uses.
export {
  DEFAULT_APP_NAME,
  pairingAppMismatch,
  resolveAppName,
} from "@envoymesh/protocol";
