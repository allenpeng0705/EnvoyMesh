/**
 * Phase 8 / Step 3 — `B-class` deps factory functions.
 *
 * **What this is:** the host-side glue that builds the
 * bridge's `BClass*` deps from `NodeServiceImpl` state.
 * Three factories (sponsor-friend / peer-list / relay-
 * status), one per `B-class` skill.
 *
 * **Why three factories, not one:** the three
 * `B-class` skills have very different dep shapes
 * (sponsor-friend is 4 sub-groups, the other two are
 * flat). One factory per skill keeps each one
 * focused and easy to read.
 *
 * **Why a separate file (not in `runtime.ts`):** the
 * factories are used by TWO callers — the runtime
 * (`createRealEnvoyHarnessRuntime` for `bClassTools`)
 * and the dev-CLI / RPC handlers (for direct invocations).
 * Keeping the factories in their own file lets both
 * callers import without pulling in the full runtime.
 *
 * **Why we use bracket notation for private access:**
 * `NodeServiceImpl`'s `_mesh` / `_configStore` /
 * `_gatherSponsorMultiaddrs` / `_waitForBondEstablished`
 * / etc. are `private` on the class. The factories
 * are in a sibling directory (`agent-runtime-envoy/`)
 * and don't have class-level access. The pattern
 * `service as unknown as NodeServiceLike` is
 * the smallest seam that works — alternatives
 * (changing access modifiers, adding getters) would
 * leak internals wider.
 *
 * **Stability:** the public surface is the 3 factory
 * functions + their `BClass*` deps types (re-exported
 * from the bridge). Additive; new fields on the deps
 * are optional.
 */

import {
  type HelloProfile,
  type NodeProfile,
  type NodeService,
  type SendHelloOptions,
  resolveSetupSponsorFriendConfig,
} from "@envoymesh/api";
import { buildRelayManagerSnapshot, createLocalTaskStore, loadOrCreateNodeProfile } from "@envoymesh/local-store";
import type { AuditEvent } from "@envoymesh/local-store";
import { pickAddressFilterForPeer } from "../outbound-dial-hints.js";
import { bondTrace } from "../bond-trace.js";
import { isMeshReadyForSponsorBond } from "../mesh-readiness.js";
import { loadBundledSponsorFriendConfig } from "../bundled-sponsor-friend-loader.js";
import type {
  BClassPeerListDeps,
  BClassRelaySnapshot,
  BClassRelayStatusDeps,
  BClassSponsorFriendConfigDeps,
  BClassSponsorFriendDeps,
  BClassSponsorFriendMeshDeps,
  BClassSponsorFriendProfileDeps,
  BClassPersistedNodeConfig,
  BClassResolvedSponsorFriend,
  BClassAuditEventLike,
  BClassHelloProfile,
} from "@envoymesh/envoy-harness-adapter";

// ---------------------------------------------------------------------------
// Type aliases for the bracket-notation private access
// ---------------------------------------------------------------------------

/**
 * The shape of `NodeServiceImpl` that the factories
 * read. Combines the public `NodeService` interface
 * with the private fields the bridge needs (mesh
 * instance, profile dir, config store, etc.). The
 * private fields use the same types as the host's
 * `NodeServiceImpl` so the bracket-notation cast is
 * type-safe.
 */
interface NodeServiceLike
  extends NodeService,
    Partial<{
      _mesh: unknown;
      _externalMesh: unknown;
      _configStore: { load(): Promise<BClassPersistedNodeConfig | undefined>; save(config: BClassPersistedNodeConfig): Promise<void> };
      _profileDir: string;
      _appendAuditEvent(event: AuditEvent): Promise<void>;
      _gatherSponsorMultiaddrs(): Promise<string[]>;
      _waitForBondEstablished(
        targetOwnerId: string,
        timeoutMs: number,
      ): Promise<{ peerOwnerId: string; displayName?: string }>;
      _assertOnline(): void;
    }> {}

function asLike(service: unknown): NodeServiceLike {
  return service as unknown as NodeServiceLike;
}

// ---------------------------------------------------------------------------
// Sponsor-friend factory
// ---------------------------------------------------------------------------

/**
 * Build the bridge's `BClassSponsorFriendDeps` from a
 * `NodeServiceImpl`. The 4 sub-groups map cleanly to
 * the host's existing per-method call sites:
 *
 * - `mesh` → `service.sendHello` / `searchPeers` /
 *   `applyWanJoinInvite` / `_gatherSponsorMultiaddrs` /
 *   `_waitForBondEstablished` / `_assertOnline` /
 *   `_mesh` + `_externalMesh` for the readiness probe
 * - `profile` → `service.getProfile` /
 *   `getHumanProfile` / `getBonds` (for trust check)
 * - `config` → `service._configStore` /
 *   `service._profileDir` / bundled config loader
 * - `audit` → `service._appendAuditEvent` /
 *   `bondTrace` for observability
 *
 * **Why `pickAddressFilter` is wired to the host's
 * `pickAddressFilterForPeer`:** the address-filter
 * policy (LAN+circuit vs WAN-only) is an EnvoyMesh-
 * specific concern. The bridge doesn't know about it;
 * the host does. The bridge calls the dep, the dep
 * delegates to the host's existing helper.
 *
 * **Why `trace` is wired to `bondTrace`:** the host
 * already has a `bondTrace(step, status, message, fields)`
 * observability helper. The bridge's `trace` dep is
 * the same shape. Re-use the existing helper instead
 * of inventing a new one.
 */
export function createBClassSponsorFriendDeps(
  service: unknown,
): BClassSponsorFriendDeps {
  const svc = asLike(service);

  const mesh: BClassSponsorFriendMeshDeps = {
    searchPeers: (input: { peerId: string }) =>
      svc.searchPeers({ peerId: input.peerId }),
    sendHello: (
      targetOwnerId: string,
      profile: BClassHelloProfile,
      message: string,
      options?: { dialHints?: string[]; proofOfContext?: string; preferredOwnerId?: string },
    ) => {
      // Map bridge options → NodeService.sendHello options.
      // The host's `sendHello` takes `SendHelloOptions`
      // (proofOfContext + targetPeerId + addressFilter).
      // The bridge uses `dialHints` (rename → `addressFilter`).
      const sendOpts: SendHelloOptions = {};
      if (options?.proofOfContext) sendOpts.proofOfContext = options.proofOfContext;
      if (options?.preferredOwnerId) sendOpts.targetPeerId = options.preferredOwnerId;
      if (options?.dialHints && options.dialHints.length > 0) {
        // The bridge's `dialHints` is a list of addresses
        // (from the host's `_gatherSponsorMultiaddrs`).
        // The host's `addressFilter` is a `DialableAddrMode`
        // ("wan-public" | "lan-paired" | "all"), set by
        // the smart picker — not a list. The bridge
        // passes the list because it doesn't know about
        // the picker; the wrapper here is where the
        // list → mode translation happens (v0: ignore
        // the list and let the picker decide; the host's
        // `pickAddressFilterForPeer` is the source of truth).
        void options.dialHints;
        sendOpts.addressFilter = "wan-public";
      }
      return svc.sendHello(
        targetOwnerId,
        profile as unknown as HelloProfile,
        message,
        sendOpts,
      );
    },
    applyWanJoinInvite: (token: string) => svc.applyWanJoinInvite(token),
    waitForBondEstablished: (targetOwnerId: string, timeoutMs: number) =>
      svc._waitForBondEstablished!(targetOwnerId, timeoutMs),
    assertOnline: () => svc._assertOnline!(),
    probeMeshReady: async () => {
      // Mirror the host's `probeMeshReady` impl: read
      // config, then check the mesh. The bridge's
      // `probeMeshReady?` is optional, so this can be
      // omitted if the host doesn't want the gate.
      const mesh = (svc._mesh ?? svc._externalMesh) as
        | Parameters<typeof isMeshReadyForSponsorBond>[0]
        | undefined;
      if (!mesh) return false;
      const config = await svc._configStore!.load().catch(() => undefined);
      return isMeshReadyForSponsorBond(mesh, {
        discoveryProfile: config?.discoveryProfile as string | undefined,
        relayEnabled: config?.relayEnabled as boolean | undefined,
      });
    },
    getPeerMultiaddrs: () => svc._gatherSponsorMultiaddrs!(),
    pickAddressFilter: ({
      peerMultiaddrs,
      localDiscoveryProfile,
    }: {
      peerMultiaddrs: string[];
      localDiscoveryProfile?: string | undefined;
    }) => {
      // The bridge passes a `localDiscoveryProfile` derived
      // from the persisted config (read via `loadNodeConfig`).
      // Pass it through to the host's picker.
      return pickAddressFilterForPeer(peerMultiaddrs, localDiscoveryProfile);
    },
  };

  const profile: BClassSponsorFriendProfileDeps = {
    loadNodeProfile: async () => {
      try {
        const np: NodeProfile = svc.getProfile();
        return { owner: { ownerId: np.owner.ownerId }, peerId: undefined };
      } catch {
        return undefined;
      }
    },
    loadHelloProfile: async () => {
      const hp = await svc.getHumanProfile();
      if (!hp) throw new Error("Human profile not initialized");
      return { displayName: hp.displayName ?? hp.ownerId };
    },
    probeHumanProfileReady: async () => Boolean(await svc.getHumanProfile()),
    isAlreadyBondedWith: async (sponsorOwnerId: string) => {
      const bonds = await svc.getBonds();
      const persisted = await svc._configStore!.load().catch(() => undefined);
      const peerId = persisted?.setupSponsorFriendPeerId?.trim();
      return bonds.some((b) => {
        const idMatch =
          b.peerOwnerId === sponsorOwnerId ||
          (Boolean(peerId) && b.libp2pPeerId === peerId);
        return idMatch && (b.level === "direct" || b.level === "referred");
      });
    },
  };

  const config: BClassSponsorFriendConfigDeps = {
    loadNodeConfig: () => svc._configStore!.load(),
    saveNodeConfig: (next: BClassPersistedNodeConfig) => svc._configStore!.save(next),
    getProfileDir: () => svc._profileDir!,
    nodeBundleDir: process.env.ENVOYMESH_NODE_BUNDLE_DIR,
    resolveEffectiveConfig: async ({
      persisted,
      nodeBundleDir,
    }: {
      persisted: BClassPersistedNodeConfig | undefined;
      nodeBundleDir?: string | undefined;
    }): Promise<BClassResolvedSponsorFriend> => {
      // Load the bundled config and merge with persisted.
      // The bridge's `BClassResolvedSponsorFriend` doesn't
      // include `contactUri` or `source`; the host's
      // `resolveSetupSponsorFriendConfig` does. We map
      // the host's result to the bridge's minimal shape.
      const bundled = await loadBundledSponsorFriendConfig(nodeBundleDir);
      const persistedConfig = persisted
        ? {
            enabled: persisted.setupSponsorFriendEnabled ?? false,
            contactUri: persisted.setupSponsorFriendContactUri,
            ownerId: persisted.setupSponsorFriendOwnerId,
            peerId: persisted.setupSponsorFriendPeerId,
            joinToken: persisted.setupSponsorFriendJoinToken,
            displayName: persisted.setupSponsorFriendDisplayName,
            helloMessage: persisted.setupSponsorFriendHelloMessage,
            proofOfContext: persisted.setupSponsorFriendProofOfContext,
            maxAttempts: persisted.setupSponsorFriendMaxAttempts,
            retryDelayMs: persisted.setupSponsorFriendRetryDelayMs,
            cooldownMs: persisted.setupSponsorFriendCooldownMs,
            forceBypassGuards: undefined,
          }
        : null;
      const hostResolved = resolveSetupSponsorFriendConfig({
        bundled,
        persisted: persistedConfig,
      });
      return {
        enabled: hostResolved.enabled,
        ownerId: hostResolved.ownerId,
        peerId: hostResolved.peerId,
        joinToken: hostResolved.joinToken,
        displayName: hostResolved.displayName,
        helloMessage: hostResolved.helloMessage,
        proofOfContext: hostResolved.proofOfContext,
        maxAttempts: hostResolved.maxAttempts,
        retryDelayMs: hostResolved.retryDelayMs,
        cooldownMs: persisted?.setupSponsorFriendCooldownMs ?? 60_000,
      };
    },
  };

  return {
    mesh,
    profile,
    config,
    audit: {
      appendAudit: async (event: { type: string; createdAt: string; [k: string]: unknown }) => {
        // The bridge's `BClassSponsorAuditEvent` is a minimal
        // interface (`type` + `createdAt` + index sig). The
        // host's `AuditEvent` has more required fields
        // (`version`, `eventId`, `outcome`, `summary`).
        // The bridge never sets `outcome` / `summary` /
        // `eventId` / `version`, so the cast is needed.
        // The host's `_appendAuditEvent` builds a full
        // `AuditEvent` from the partial input (defaulting
        // missing fields). Cast to `unknown` first to
        // satisfy the strict structural check.
        await svc._appendAuditEvent!(event as unknown as AuditEvent);
      },
      trace: (
        step: number,
        status: string,
        message: string,
        fields?: Record<string, unknown>,
      ) => {
        // The bridge's `trace` uses `step: number` (any
        // iteration step). The host's `bondTrace` requires
        // `BondTraceStep = 1 | 2 | 3 | 4`. Narrow at the
        // wrapper boundary. The bridge only emits steps
        // 1-5 in practice (the impl uses 1-5 for the
        // 4 main stages + a "sponsor-is-self" pre-check);
        // out-of-range steps fall through to step 4.
        const stepNarrow: 1 | 2 | 3 | 4 =
          step === 1 ? 1 : step === 2 ? 2 : step === 3 ? 3 : 4;
        bondTrace(
          stepNarrow,
          status as "PASS" | "WAIT" | "FAIL" | "INFO" | "SKIP",
          message,
          fields as Record<string, string | number | boolean | undefined | null> | undefined,
        );
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Peer-list factory
// ---------------------------------------------------------------------------

/**
 * Build the bridge's `BClassPeerListDeps` from a
 * `NodeServiceImpl`. Flat deps — just one method
 * (`readAuditEvents`) + a few optional filter options.
 *
 * **Why the profile dir is read from the service:**
 * the audit log lives in the profile dir. The bridge
 * calls the dep, the dep opens the local store,
 * reads events, returns them.
 */
export function createBClassPeerListDeps(
  service: unknown,
): BClassPeerListDeps {
  const svc = asLike(service);
  return {
    readAuditEvents: async () => {
      const store = createLocalTaskStore(svc._profileDir!);
      const events = await store.readAuditEvents();
      // Cast to the bridge's minimal `BClassAuditEventLike`:
      // `AuditEvent` from local-store has all the fields
      // (`type`, `createdAt`, `remotePeerId?`) plus more.
      return events as ReadonlyArray<BClassAuditEventLike>;
    },
  };
}

// ---------------------------------------------------------------------------
// Relay-status factory
// ---------------------------------------------------------------------------

/**
 * Build the bridge's `BClassRelayStatusDeps` from a
 * `NodeServiceImpl`. Three methods + a `buildSnapshot`
 * callback (host wraps the local-store's
 * `buildRelayManagerSnapshot`).
 *
 * **Why `buildSnapshot` is a callback:** the snapshot
 * is built by `buildRelayManagerSnapshot` in
 * `@envoymesh/local-store` (an EnvoyMesh-internal dep).
 * The bridge can't import it (cross-monorepo dep would
 * be wrong). The host wraps the call:
 * `buildSnapshot: (input) => buildRelayManagerSnapshot(input)`.
 */
export function createBClassRelayStatusDeps(
  service: unknown,
): BClassRelayStatusDeps {
  const svc = asLike(service);
  return {
    readAuditEvents: async () => {
      const store = createLocalTaskStore(svc._profileDir!);
      const events = await store.readAuditEvents();
      return events as ReadonlyArray<BClassAuditEventLike>;
    },
    loadProfile: async (): Promise<unknown> => {
      // The local profile is loaded by the host's
      // `loadOrCreateNodeProfile` from `@envoymesh/local-store`.
      // The bridge's `loadProfile` return type is `Promise<unknown>`
      // (the bridge doesn't care about the shape; the
      // `buildSnapshot` callback does the actual reading).
      const profile = await loadOrCreateNodeProfile(svc._profileDir!);
      return profile as unknown;
    },
    buildSnapshot: ({
      profile,
      auditEvents,
    }: {
      profile: unknown;
      auditEvents: ReadonlyArray<BClassAuditEventLike>;
    }): BClassRelaySnapshot | null | undefined => {
      const snapshot = buildRelayManagerSnapshot({
        profile: profile as Parameters<typeof buildRelayManagerSnapshot>[0]["profile"],
        auditEvents: auditEvents as Parameters<typeof buildRelayManagerSnapshot>[0]["auditEvents"],
      });
      return snapshot as BClassRelaySnapshot | null | undefined;
    },
  };
}
