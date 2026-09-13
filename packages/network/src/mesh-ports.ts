/**
 * Mesh ports — the narrow surfaces a *reusable* module may ask of a mesh.
 *
 * ## Why these are here rather than beside their first user
 *
 * `OutboundDeliverMesh` and `OutboundExpectReplyMesh` were declared in
 * `apps/node/src/chat-outbound-deliver.ts`, which is `product-bound` (it is chat
 * delivery). Every module that needed the *port* therefore inherited that taint —
 * broadcast fan-out, agent-task proposal sending, worker-lease broadcast,
 * scoreboard rules, the mesh outbound helper and more. They name no product
 * concept and reference nothing product-bound: they are `Pick`s of
 * {@link EnvoyMesh}, which lives right here.
 *
 * `isLibp2pPeerId` arrived the same way, from `profile-sync-outbound.ts`: a pure
 * predicate over peer-id strings, tainting five modules for no reason.
 *
 * ## What this is not
 *
 * Not a new abstraction. `Pick<EnvoyMesh, …>` is exactly what those modules were
 * already written against; the only change is where the name is declared, so the
 * modules can be `reusable` and a second product can use them. The product keeps
 * its own richer collaboration interfaces — it just no longer owns the port that
 * the reusable half depends on.
 *
 * Plan: `docs/envoymesh-refactoring-plan.md` §8.17.10.
 */

import type { EnvoyMesh } from "./index.js";

/**
 * The mesh surface outbound delivery needs: send, close, probe reachability,
 * read connection info. Deliberately narrow so a caller can be handed a stub.
 */
export type OutboundDeliverMesh = Pick<
  EnvoyMesh,
  "send" | "closeConnectionsToPeer" | "ensurePeerReachable" | "getPeerConnectionInfo"
>;

/** The above plus the expect-reply variants and connected-peer listing. */
export type OutboundExpectReplyMesh = OutboundDeliverMesh &
  Pick<EnvoyMesh, "sendExpectReply" | "sendChatExpectEnvelopeReply" | "getConnectedPeerIds">;

/**
 * True when a peer id looks like a libp2p peer id rather than an EnvoyMesh
 * envelope id.
 *
 * libp2p peer ids start with `12D3KooW` (base58btc); EnvoyMesh envelope ids use
 * the `envoy_` prefix and EnvoyMesh identity ids the `envoy:` one.
 */
export function isLibp2pPeerId(peerId: string): boolean {
  const id = peerId.trim();
  return id.length > 0 && !id.startsWith("envoy_") && !id.startsWith("envoy:");
}
