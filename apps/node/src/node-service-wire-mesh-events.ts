/**
 * Wire Mesh Events runtime (Step 20e, Option B).
 *
 * Extracted from `node-service-impl.ts` (`_wireMeshEvents` private method).
 * Owns ONLY the wiring: registers the inbound-message handler and the
 * peer-discovered handler with the mesh. Handler bodies stay on the
 * class as private methods (`_handleInboundMessage`, `_handlePeerDiscovered`).
 *
 * The handler bodies preserve the original closure captures of
 * `mesh`, `profile`, `taskStore` by re-introducing them as local
 * consts at the top of each method. This means the body code
 * (`mesh.X`, `profile.X`, etc.) still works without transformation.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type WireMeshEventsMessageParams = any;
export type WireMeshEventsPeerDiscoveredParams = any;

export interface WireMeshEventsMeshLike {
  onMessage(handler: (params: WireMeshEventsMessageParams) => Promise<void>): void;
  onPeerDiscovered(
    handler: (params: WireMeshEventsPeerDiscoveredParams) => Promise<void>,
  ): void;
}

export interface WireMeshEventsContext {
  mesh: WireMeshEventsMeshLike;
  onMessage: (params: WireMeshEventsMessageParams) => Promise<void>;
  onPeerDiscovered: (params: WireMeshEventsPeerDiscoveredParams) => Promise<void>;
}

export function wireMeshEventsViaRuntime(ctx: WireMeshEventsContext): void {
  ctx.mesh.onMessage(ctx.onMessage);
  ctx.mesh.onPeerDiscovered(ctx.onPeerDiscovered);
}