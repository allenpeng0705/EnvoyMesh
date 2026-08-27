/**
 * Phase 8 / Step 3 — `setup-sponsor-friend` B-class skill
 * (canonical in the bridge).
 *
 * **What this is:** the canonical `setup-sponsor-friend`
 * impl. The "first-friend auto-bond" — the installer's
 * primary onboarding step. The bridge owns the
 * algorithm (orchestration loop, retry, cooldown,
 * error classification, audit events). The host
 * (`apps/node/src/`) becomes a thin wrapper that
 * builds the deps from `NodeServiceImpl` state.
 *
 * **Why this is in the bridge:** per the Phase 8 design
 * doc §2.2, the bridge is the canonical implementation
 * of mesh-touching capabilities. envoy-harness can
 * run a bond flow even if OpenClaw subprocess is down.
 *
 * **The deps interface (4 sub-groups per the Step 3
 * plan):**
 * - `mesh`: searchPeers, sendHello, applyWanJoinInvite,
 *   waitForBondEstablished, address filters, mesh
 *   readiness probe
 * - `profile`: loadNodeProfile, loadHelloProfile,
 *   profile readiness probe, trust check
 * - `config`: loadNodeConfig, saveNodeConfig, profile
 *   dir, bundled config dir
 * - `audit`: appendAudit, now() for cooldown calculation
 *
 * **Minimal data types:** the bridge defines minimal
 * interfaces (e.g. `BClassPersistedNodeConfig`,
 * `BClassHelloProfile`) for the fields it reads/writes.
 * EnvoyMesh's `PersistedNodeConfig` and `HelloProfile`
 * (from `@envoymesh/api` + `@envoymesh/identity`)
 * satisfy these structurally. The host's wrapper is
 * the only place that maps between the full EnvoyMesh
 * types and the bridge's minimal interfaces.
 *
 * **Scope reduction (Phase 8 / Step 3 v0):** the bridge
 * owns the orchestration algorithm + the audit +
 * the retry/cooldown. The HOST owns the address
 * filter (`pickAddressFilterForPeer` in
 * `apps/node/src/outbound-dial-hints.ts`) — the bridge
 * calls `deps.mesh.getAddressFilter(...)` for it.
 * Same for `bondTrace` (the host provides a callback).
 * These are EnvoyMesh-specific concerns that the
 * bridge should not duplicate.
 *
 * **Stability:** the public surface is
 * `runSponsorFriendBridge` + `sponsorFriendTool` +
 * `BClassSponsorFriendDeps` + the 4 sub-interfaces +
 * the minimal data types. Additive; new fields are
 * optional.
 */
import type { Tool } from "@envoymesh/envoy-harness";
import { z } from "zod";
/**
 * Minimal `PersistedNodeConfig` shape the bridge
 * reads + writes. EnvoyMesh's `PersistedNodeConfig`
 * (from `@envoymesh/api`) satisfies this structurally.
 *
 * **All fields have `| undefined`:** the bridge
 * spreads objects with explicit `undefined` values
 * (e.g. `setupSponsorFriendLastError: undefined`
 * to clear a field). Under
 * `exactOptionalPropertyTypes: true`, the type must
 * accept `undefined` for the spread to work.
 */
export interface BClassPersistedNodeConfig {
    setupSponsorFriendEnabled?: boolean | undefined;
    setupSponsorFriendContactUri?: string | undefined;
    setupSponsorFriendOwnerId?: string | undefined;
    setupSponsorFriendPeerId?: string | undefined;
    setupSponsorFriendJoinToken?: string | undefined;
    setupSponsorFriendDisplayName?: string | undefined;
    setupSponsorFriendHelloMessage?: string | undefined;
    setupSponsorFriendProofOfContext?: string | undefined;
    setupSponsorFriendMaxAttempts?: number | undefined;
    setupSponsorFriendRetryDelayMs?: number | undefined;
    setupSponsorFriendCompletedAt?: string | undefined;
    setupSponsorFriendLastError?: string | undefined;
    setupSponsorFriendLastErrorKind?: string | undefined;
    setupSponsorFriendLastAttemptAt?: string | undefined;
    setupSponsorFriendAttempts?: number | undefined;
    setupSponsorFriendCooldownUntil?: string | undefined;
    setupSponsorFriendCooldownMs?: number | undefined;
    setupSponsorFriendSkipReason?: string | undefined;
    /** Allow extra fields without TypeScript errors (the host's full PersistedNodeConfig has more). */
    [key: string]: unknown;
}
/**
 * Minimal `HelloProfile` shape (the local human profile
 * sent in the bond request). EnvoyMesh's `HelloProfile`
 * satisfies this structurally.
 */
export interface BClassHelloProfile {
    displayName?: string;
    [key: string]: unknown;
}
/**
 * Minimal `ResolvedSetupSponsorFriend` shape (the
 * resolved config after merging the bundled default +
 * the persisted overrides + the runtime settings).
 * EnvoyMesh's `ResolvedSetupSponsorFriend` satisfies
 * this structurally.
 */
export interface BClassResolvedSponsorFriend {
    enabled: boolean;
    ownerId?: string;
    peerId?: string;
    joinToken?: string;
    displayName?: string;
    helloMessage?: string;
    proofOfContext?: string;
    maxAttempts: number;
    retryDelayMs: number;
    cooldownMs: number;
}
/**
 * The result type for `runSponsorFriendBridge`. Mirrors
 * EnvoyMesh's `RunSetupSponsorFriendResult`.
 */
export interface BClassSponsorFriendResult {
    ok: boolean;
    skipped?: boolean | undefined;
    reason?: "already-completed" | "disabled-or-incomplete" | "already-bonded" | "cooldown" | "profile-not-ready" | "mesh-not-ready" | "protocol-mismatch" | "auto-exhausted" | "single-flight" | undefined;
    ownerId?: string | undefined;
    cooldownUntil?: string | undefined;
    lastErrorKind?: string | undefined;
    /** Best-effort; not present when no bond was attempted. */
    attempts?: number | undefined;
    /** Free-form text for UI / audit. */
    finalNote?: string | undefined;
}
/** The minimal audit event the bridge writes. */
export interface BClassSponsorAuditEvent {
    type: string;
    createdAt: string;
    [key: string]: unknown;
}
/**
 * Mesh operations the sponsor-friend loop needs.
 * Mesh ops = peerstore + bond protocol + relay + libp2p
 * readiness + addresses.
 */
export interface BClassSponsorFriendMeshDeps {
    /** Search the mesh for the sponsor's peer (by ownerId or peerId). */
    searchPeers(input: {
        peerId: string;
    }): Promise<ReadonlyArray<{
        ownerId?: string;
        peerId?: string;
    }>>;
    /** Send the bond request (hello message) to the sponsor. */
    sendHello(targetOwnerId: string, profile: BClassHelloProfile, message: string, options?: {
        dialHints?: string[];
        proofOfContext?: string;
        preferredOwnerId?: string;
    } | undefined): Promise<{
        messageId: string;
    }>;
    /** Apply the sponsor's join token (e.g. WAN join invite). */
    applyWanJoinInvite(token: string): Promise<unknown>;
    /** Optional: wait for the sponsor's `bond.established` event
     *  (with timeout). When omitted, the bridge assumes the bond
     *  is established once `sendHello` returns successfully. */
    waitForBondEstablished?(targetOwnerId: string, timeoutMs: number): Promise<{
        peerOwnerId: string;
        displayName?: string;
    }>;
    /** Throws if the local runtime is not online. */
    assertOnline(): void;
    /** Optional: explicit libp2p mesh-readiness probe. */
    probeMeshReady?(): Promise<boolean>;
    /** Optional: static sponsor multiaddrs (from the bundled config). */
    peerMultiaddrs?: string[] | undefined;
    /** Optional: refresh sponsor multiaddrs each retry attempt. */
    getPeerMultiaddrs?(): Promise<string[]>;
    /** Optional: local node's discovery profile ("lan-fast" / "wan-default"). */
    localDiscoveryProfile?: string | undefined;
    /** Optional: pick the address filter (LAN+circuit vs WAN-only). */
    pickAddressFilter?(input: {
        peerMultiaddrs: string[];
        localDiscoveryProfile?: string | undefined;
    }): string;
}
/** Profile + trust operations. */
export interface BClassSponsorFriendProfileDeps {
    loadNodeProfile(): Promise<{
        owner?: {
            ownerId?: string;
        };
        peerId?: string;
    } | undefined>;
    loadHelloProfile(): Promise<BClassHelloProfile>;
    /** Optional: explicit profile-readiness probe. */
    probeHumanProfileReady?(): Promise<boolean>;
    /** Optional: true when the local trust store already has a real bond. */
    isAlreadyBondedWith?(ownerId: string): Promise<boolean>;
}
/** Config persistence (the persisted node-config.json). */
export interface BClassSponsorFriendConfigDeps {
    loadNodeConfig(): Promise<BClassPersistedNodeConfig | undefined>;
    saveNodeConfig(config: BClassPersistedNodeConfig): Promise<void>;
    /** Profile dir (for resolving bundled-sponsor-friend config). */
    getProfileDir(): string;
    /** Optional: bundled sponsor config dir. */
    nodeBundleDir?: string | undefined;
    /**
     * Resolve the effective config (merge bundled default + persisted
     * overrides). The host's wrapper calls
     * `@envoymesh/api`'s `resolveSetupSponsorFriendConfig(...)`.
     */
    resolveEffectiveConfig(input: {
        persisted: BClassPersistedNodeConfig | undefined;
        nodeBundleDir?: string | undefined;
    }): BClassResolvedSponsorFriend | Promise<BClassResolvedSponsorFriend>;
    /** Optional: load the bundled sponsor-friend config from the bundle. */
    loadBundledConfig?(input: {
        profileDir: string;
        nodeBundleDir?: string | undefined;
    }): BClassResolvedSponsorFriend | null;
}
/** Audit + time. */
export interface BClassSponsorFriendAuditDeps {
    /** Optional: append an audit event for observability. */
    appendAudit?(event: BClassSponsorAuditEvent): Promise<void>;
    /** Optional: clock for cooldown calculation. Default: `Date.now`. */
    now?(): number;
    /** Optional: sleep function for retry delays. Default: `setTimeout`. */
    sleep?(ms: number): Promise<void>;
    /** Optional: trace function for observability. Default: no-op. */
    trace?(step: number, status: string, message: string, fields?: Record<string, unknown> | undefined): void;
}
/** Combined deps (the 4 sub-groups). */
export interface BClassSponsorFriendDeps {
    mesh: BClassSponsorFriendMeshDeps;
    profile: BClassSponsorFriendProfileDeps;
    config: BClassSponsorFriendConfigDeps;
    audit: BClassSponsorFriendAuditDeps;
}
export declare function __resetActiveSponsorLoopsForTests(): void;
export declare function runSponsorFriendBridge(deps: BClassSponsorFriendDeps, input?: {
    forceBypassGuards?: boolean;
}): Promise<BClassSponsorFriendResult>;
/**
 * The `sponsor_friend` BUILTIN tool. Always-on when
 * included in `bClassTools?`. The model calls this
 * when the orchestrator's `requiredSkill` is
 * `setup-sponsor-friend`.
 */
export declare const sponsorFriendTool: (deps: BClassSponsorFriendDeps) => Tool<z.ZodObject<{
    force: z.ZodOptional<z.ZodBoolean>;
}>>;
//# sourceMappingURL=sponsor-friend.d.ts.map