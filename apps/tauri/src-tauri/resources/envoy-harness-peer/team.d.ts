/**
 * D4 — `createPeerTeamExecutor`: the `TeamOptions.peerExecutor`
 * implementation that dispatches a team agent to a standalone
 * envoy-harness peer.
 *
 * The runner (Package 1) declares the seam; this package provides it —
 * so Package 1 never depends on the peer package.
 */
import type { AgentSpec } from "@envoymesh/envoy-harness";
import type { PeerClient } from "./client.js";
import { PeerRegistry } from "./registry.js";
export interface PeerTeamExecutorOptions {
    /** Default cost ceiling for peer agents (USD). */
    defaultCostCeilingUsd?: number;
    /** Default deadline for peer agents (ms). */
    defaultDeadlineMs?: number;
    /** A signal to abort the whole team run. */
    signal?: AbortSignal;
}
export declare function createPeerTeamExecutor(registry: PeerRegistry, options?: PeerTeamExecutorOptions): (spec: AgentSpec, prompt: string) => Promise<string>;
/** Convenience: a `PeerClient` + identity is a one-peer registry. */
export declare function createSinglePeerTeamExecutor(peerId: string, client: PeerClient, options?: PeerTeamExecutorOptions): (spec: AgentSpec, prompt: string) => Promise<string>;
//# sourceMappingURL=team.d.ts.map