/**
 * Phase 8 / Step 3 — `setup-sponsor-friend` host-side wrapper.
 *
 * **What this is:** the thin host-side adapter for the
 * bridge's canonical `runSponsorFriendBridge`. The
 * bridge (in `envoy-harness-adapter`) owns the
 * algorithm; this file is the RPC adapter that
 * preserves the existing public API +
 * `SetupSponsorFriendRuntimeDeps` shape so the rest
 * of the host (the RPC handler in `node-service-impl.ts`,
 * the dev-CLI, the tests) doesn't need to change.
 *
 * **Why we still have a host-side wrapper (instead of
 * calling the bridge directly from the RPC handler):**
 * the wire type (`RunSetupSponsorFriendResult` from
 * `@envoymesh/api`) is different from the bridge's
 * `BClassSponsorFriendResult`. The host's wrapper is
 * the translation layer:
 *
 *   1. It does the SYNCHRONOUS skip cases (already-
 *      completed, disabled, sponsor-is-self, already-
 *      bonded, cooldown, profile-not-ready,
 *      mesh-not-ready) so the RPC returns a meaningful
 *      result instead of `{ running: true }` for cases
 *      that should be no-ops. The bridge's own guards
 *      are a safety net for the fire-and-forget case.
 *   2. It does the synchronous single-flight check
 *      (a host-side `Set<ownerId>`) so the second
 *      concurrent call returns `{ running: true }`
 *      immediately instead of going through the
 *      bridge's `await`.
 *   3. It does the self-check (sponsor is this peer
 *      / owner) before any spawn — the bridge doesn't
 *      know about `loadNodeProfile` so this is host-
 *      specific.
 *   4. It spawns the bridge fire-and-forget (the
 *      bridge's `runSponsorFriendBridge` is awaited
 *      by the wrapper, but the wrapper's caller is
 *      not awaiting the wrapper's loop — same
 *      fire-and-forget as the original `runSetup-
 *      SponsorFriendRetryLoop`).
 *   5. It maps the bridge's `{ skipped: "single-flight" }`
 *      to the wire's `{ running: true }` (both mean
 *      "the runtime is busy; the UI should poll").
 *
 * **What this file does NOT do anymore:** the
 * orchestration loop (search → join → hello → wait),
 * the per-attempt error classification, the cooldown
 * after exhaustion, the audit emission per attempt.
 * All of that is in `runSponsorFriendBridge` in the
 * bridge (the canonical impl).
 *
 * **Stability:** the public surface
 * (`runSetupSponsorFriendViaRuntime`,
 * `runSetupSponsorFriendOnService`,
 * `__resetActiveSponsorLoopsForTests`,
 * `classifySponsorError`, `SetupSponsorFriendRuntimeDeps`,
 * `RunSetupSponsorFriendInput`, `SponsorFailureKind`,
 * `persistedSetupSponsorFriendConfig`,
 * `resolveEffectiveSetupSponsorFriend`) is preserved.
 * Additive; new fields on `SetupSponsorFriendRuntimeDeps`
 * are optional.
 */

import {
  resolveSetupSponsorFriendConfig,
  persistedNodeConfigToSponsorFriendConfig,
  type ResolvedSetupSponsorFriend,
  type RunSetupSponsorFriendResult,
  type SetupSponsorFriendConfig,
} from "@envoymesh/api";
import type { HelloProfile, NodeService, SendHelloOptions } from "@envoymesh/api";
import { createAuditEvent, type AuditEvent } from "@envoymesh/local-store";
import {
  __resetActiveSponsorLoopsForTests as __resetBridgeActiveSponsorLoopsForTests,
  runSponsorFriendBridge,
  type BClassPersistedNodeConfig,
  type BClassResolvedSponsorFriend,
  type BClassSponsorFriendDeps,
  type BClassSponsorFriendResult,
} from "@envoymesh/envoy-harness-adapter";
import { loadBundledSponsorFriendConfig } from "./bundled-sponsor-friend-loader.js";
import { bondTrace } from "./bond-trace.js";
import type { PersistedNodeConfig } from "./node-config-store.js";

// ---------------------------------------------------------------------------
// Module-level single-flight set
// ---------------------------------------------------------------------------

/**
 * Synchronous single-flight guard. The bridge ALSO has
 * one (in `runSponsorFriendBridge`), but the bridge's
 * only fires when the bridge itself is called twice
 * synchronously. The host's wrapper fires when
 * `runSetupSponsorFriendViaRuntime` is called twice
 * synchronously — the second call returns
 * `{ running: true }` immediately, before the bridge
 * is even reached. This is the wire contract for
 * concurrent RPCs (the UI's SetupView + NodeStateContext
 * both auto-trigger and would otherwise race).
 *
 * **The bridge's own `__resetActiveSponsorLoopsForTests`**
 * is reset in tandem (the host's reset helper calls
 * both). Tests that bypass the host's wrapper and call
 * the bridge directly would need to reset the bridge's
 * set themselves.
 */
const activeSponsorLoops = new Set<string>();

/** Test helper — clear the single-flight set between tests. */
export function __resetActiveSponsorLoopsForTests(): void {
  activeSponsorLoops.clear();
  __resetBridgeActiveSponsorLoopsForTests();
}

// ---------------------------------------------------------------------------
// Error classification (preserved for the test seam)
// ---------------------------------------------------------------------------

/**
 * Classification of a sponsor-hello failure. Mirrors
 * the bridge's internal classification
 * (`sponsor-friend.ts:classifySponsorError` in the
 * bridge) — kept here as a public seam so the existing
 * `classifySponsorError` test continues to work. The
 * bridge's classification is the source of truth; this
 * copy is a stable contract for the test suite.
 *
 *   - `network-unreachable` — all transport paths failed
 *   - `proof-token-mismatch` — recipient requires a
 *     matching `bondAutonomySponsorProofToken`
 *   - `profile-not-ready` — local human profile isn't loaded
 *   - `mesh-not-ready` — libp2p mesh event loop isn't up
 *   - `protocol-mismatch` — the envelope's intent isn't
 *     accepted on the protocol it was routed to
 *   - `sponsor-no-ack` — sendHello completed but the
 *     sponsor never emitted `bond.established`
 *   - `other` — anything else
 */
export type SponsorFailureKind =
  | "network-unreachable"
  | "proof-token-mismatch"
  | "profile-not-ready"
  | "mesh-not-ready"
  | "protocol-mismatch"
  | "sponsor-no-ack"
  | "other";

/**
 * Classify the error message produced by the hello send.
 * Mirrors the bridge's `classifySponsorError` (the
 * canonical impl) — kept here as a stable test seam.
 * Pure function so it can be unit-tested without
 * wiring the full runtime.
 */
export function classifySponsorError(message: string | undefined): SponsorFailureKind {
  const m = (message ?? "").toLowerCase();
  if (!m) return "other";
  if (
    /human profile not initialized|profile not (yet )?initialized|profile not ready|missing profile/.test(
      m,
    )
  ) {
    return "profile-not-ready";
  }
  if (
    /node not initialized|mesh not (yet )?ready|mesh not started|libp2p not (yet )?started|node.start.*not (yet )?called|envoy not started|envoymesh not started|node is starting/.test(
      m,
    )
  ) {
    return "mesh-not-ready";
  }
  if (
    /no reachable path|could not dial|dial backoff|dial tcp|connection refused|connection reset|econnrefused|etimedout|enotfound|ehostunreach|network is unreachable|relay.*unreachable|relay.*closed|relay.*timeout|relay.*disconnected|i\/o timeout|operation timed out|no outbound dial attempted|ensurepeerreachable failed|cannot open protocol stream on limited connection|peer closed stream without a reply|stream open failed|unexpected eof|connection error|sendexpectreply/.test(
      m,
    )
  ) {
    return "network-unreachable";
  }
  if (/sponsor did not acknowledge|sponsor-no-ack|did not acknowledge bond/.test(m)) {
    return "sponsor-no-ack";
  }
  if (
    /invalid intent .* on .* protocol|protocol.*rejected|unsupported intent|unknown intent|intent.*not (yet )?supported|unsupported protocol/.test(
      m,
    )
  ) {
    return "protocol-mismatch";
  }
  if (
    /proof.?of.?context|sponsor.?proof.?token|proofoftoken|token.?mismatch|invalid.?proof|missing.?proof/.test(
      m,
    )
  ) {
    return "proof-token-mismatch";
  }
  return "other";
}

// ---------------------------------------------------------------------------
// Pure helpers (preserved for the test seam + node-service-impl.ts consumers)
// ---------------------------------------------------------------------------

export function persistedSetupSponsorFriendConfig(
  config: PersistedNodeConfig | undefined,
): SetupSponsorFriendConfig | null {
  return persistedNodeConfigToSponsorFriendConfig(config);
}

export async function resolveEffectiveSetupSponsorFriend(input: {
  /** Full persisted config or any object carrying `setupSponsorFriend*` fields. */
  persisted?: Parameters<typeof persistedNodeConfigToSponsorFriendConfig>[0];
  nodeBundleDir?: string;
}): Promise<ResolvedSetupSponsorFriend> {
  const bundled = await loadBundledSponsorFriendConfig(input.nodeBundleDir);
  return resolveSetupSponsorFriendConfig({
    bundled,
    persisted: persistedNodeConfigToSponsorFriendConfig(input.persisted),
  });
}

// ---------------------------------------------------------------------------
// Runtime deps interface (preserved for the test seam + node-service-impl.ts)
// ---------------------------------------------------------------------------

export interface SetupSponsorFriendRuntimeDeps {
  loadNodeConfig(): Promise<PersistedNodeConfig | undefined>;
  saveNodeConfig(config: PersistedNodeConfig): Promise<void>;
  getProfileDir(): string;
  nodeBundleDir?: string;
  applyWanJoinInvite(token: string): Promise<unknown>;
  searchPeers(input: { peerId: string }): Promise<Array<{ ownerId?: string; peerId?: string }>>;
  sendHello(
    targetOwnerId: string,
    profile: HelloProfile,
    message: string,
    options?: SendHelloOptions,
  ): Promise<{ messageId: string }>;
  loadHelloProfile(): Promise<HelloProfile>;
  probeHumanProfileReady?(): Promise<boolean>;
  probeMeshReady?(): Promise<boolean>;
  loadNodeProfile(): Promise<{ owner: { ownerId: string }; peerId: string } | undefined>;
  isAlreadyBondedWith?(ownerId: string): Promise<boolean>;
  assertOnline(): void;
  waitForBondEstablished?(
    targetOwnerId: string,
    timeoutMs: number,
  ): Promise<{ peerOwnerId: string; displayName?: string }>;
  peerMultiaddrs?: string[];
  getPeerMultiaddrs?(): Promise<string[]>;
  localDiscoveryProfile?: string;
  now?(): number;
  appendAudit?: (event: AuditEvent) => Promise<void>;
}

export interface RunSetupSponsorFriendInput {
  forceBypassGuards?: boolean;
}

// ---------------------------------------------------------------------------
// Audit emit helper (host-side observability for skip cases)
// ---------------------------------------------------------------------------

/**
 * Fire-and-forget observability hook for a
 * `setup-sponsor-friend` skip. The runtime never
 * persists skip decisions (the loop's
 * `getSetupSponsorFriendStatus` reads the in-memory
 * return), so without this the UI can't tell
 * "we're waiting for the network" from "we never
 * started" — both look the same on disk. The audit
 * event is the single source of truth for "what is
 * the runtime waiting on right now?".
 *
 * The bridge does NOT emit this event (it's a
 * host-specific concern). The host's wrapper emits
 * it synchronously when returning a skip result.
 */
function recordSponsorSkip(input: {
  deps: SetupSponsorFriendRuntimeDeps;
  ownerId: string;
  reason: string;
  extra?: string;
}): void {
  const { deps, ownerId, reason, extra } = input;
  if (!deps.appendAudit) return;
  void deps
    .appendAudit(
      createAuditEvent({
        type: "setup.sponsor_friend.skipped",
        correlationId: ownerId,
        outcome: "record",
        summary: extra
          ? `setup.sponsor-friend skipped: ${reason} (${extra})`
          : `setup.sponsor-friend skipped: ${reason}`,
      }),
    )
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[runSetupSponsorFriend] audit emit failed for skip reason=${reason}:`,
        message,
      );
    });
}

// ---------------------------------------------------------------------------
// Bridge-deps adapter
// ---------------------------------------------------------------------------

/**
 * Map the host's `SetupSponsorFriendRuntimeDeps` to
 * the bridge's `BClassSponsorFriendDeps`. The bridge
 * uses 4 sub-groups (mesh / profile / config / audit);
 * the host's deps are flat. The mapping is mostly
 * 1-to-1 with a few renames (the host uses
 * `addressFilter` for the picker; the bridge uses
 * `dialHints` for the list of addresses).
 *
 * **Why a separate function (not inlined):** it's the
 * exact same shape as `createBClassSponsorFriendDeps`
 * in `agent-runtime-envoy/b-class-deps.ts`, but that
 * factory takes a `NodeServiceImpl` (for the runtime's
 * `bClassTools` wiring). This version takes the
 * old-style `SetupSponsorFriendRuntimeDeps` (for the
 * RPC handler + tests). Two factories, same shape.
 */
function buildBridgeDeps(
  deps: SetupSponsorFriendRuntimeDeps,
): BClassSponsorFriendDeps {
  return {
    mesh: {
      searchPeers: (input: { peerId: string }) => deps.searchPeers(input),
      sendHello: (
        targetOwnerId: string,
        profile: Parameters<BClassSponsorFriendDeps["mesh"]["sendHello"]>[1],
        message: string,
        options?: Parameters<BClassSponsorFriendDeps["mesh"]["sendHello"]>[3],
      ) => {
        // Map the bridge's `sendHello` options to the
        // host's `SendHelloOptions` shape:
        // - `dialHints` (string[]) → `addressFilter`
        //   (DialableAddrMode). v0 ignores the list and
        //   lets the host's smart picker decide
        //   (the picker reads `peerMultiaddrs` from its
        //   own state, not from this call).
        // - `preferredOwnerId` → `targetPeerId`
        const sendOpts: SendHelloOptions = {};
        if (options?.proofOfContext) {
          sendOpts.proofOfContext = options.proofOfContext;
        }
        if (options?.preferredOwnerId) {
          sendOpts.targetPeerId = options.preferredOwnerId;
        }
        if (options?.dialHints && options.dialHints.length > 0) {
          sendOpts.extraDialHints = options.dialHints;
        }
        return deps.sendHello(
          targetOwnerId,
          profile as unknown as HelloProfile,
          message,
          sendOpts,
        );
      },
      applyWanJoinInvite: (token: string) => deps.applyWanJoinInvite(token),
      ...(deps.waitForBondEstablished
        ? {
            waitForBondEstablished: (targetOwnerId: string, timeoutMs: number) =>
              deps.waitForBondEstablished!(targetOwnerId, timeoutMs),
          }
        : {}),
      assertOnline: () => deps.assertOnline(),
      ...(deps.probeMeshReady ? { probeMeshReady: () => deps.probeMeshReady!() } : {}),
      ...(deps.peerMultiaddrs ? { peerMultiaddrs: deps.peerMultiaddrs } : {}),
      ...(deps.getPeerMultiaddrs ? { getPeerMultiaddrs: () => deps.getPeerMultiaddrs!() } : {}),
      ...(deps.localDiscoveryProfile
        ? { localDiscoveryProfile: deps.localDiscoveryProfile }
        : {}),
    },
    profile: {
      loadNodeProfile: () => deps.loadNodeProfile() as unknown as Promise<{ owner?: { ownerId?: string }; peerId?: string } | undefined>,
      loadHelloProfile: () => deps.loadHelloProfile() as unknown as Promise<BClassSponsorFriendDeps["profile"]["loadHelloProfile"] extends () => Promise<infer R> ? R : never>,
      ...(deps.probeHumanProfileReady
        ? { probeHumanProfileReady: () => deps.probeHumanProfileReady!() }
        : {}),
      ...(deps.isAlreadyBondedWith
        ? { isAlreadyBondedWith: (ownerId: string) => deps.isAlreadyBondedWith!(ownerId) }
        : {}),
    },
    config: {
      loadNodeConfig: (): Promise<BClassPersistedNodeConfig | undefined> =>
        deps.loadNodeConfig() as Promise<BClassPersistedNodeConfig | undefined>,
      saveNodeConfig: (config: BClassPersistedNodeConfig): Promise<void> =>
        deps.saveNodeConfig(config as unknown as PersistedNodeConfig) as unknown as Promise<void>,
      getProfileDir: () => deps.getProfileDir(),
      ...(deps.nodeBundleDir ? { nodeBundleDir: deps.nodeBundleDir } : {}),
      resolveEffectiveConfig: async ({
        persisted,
        nodeBundleDir,
      }: {
        persisted: BClassPersistedNodeConfig | undefined;
        nodeBundleDir?: string | undefined;
      }): Promise<BClassResolvedSponsorFriend> => {
        const bundled = await loadBundledSponsorFriendConfig(nodeBundleDir);
        const hostResolved = resolveSetupSponsorFriendConfig({
          bundled,
          persisted: persisted
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
            : null,
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
    },
    audit: {
      ...(deps.appendAudit
        ? {
            appendAudit: async (event: { type: string; createdAt: string; [k: string]: unknown }) => {
              await deps.appendAudit!(event as unknown as AuditEvent);
            },
          }
        : {}),
      ...(deps.now ? { now: deps.now } : {}),
      trace: (
        step: number,
        status: string,
        message: string,
        fields?: Record<string, unknown>,
      ) => {
        // Narrow the bridge's `step: number` to the
        // host's `BondTraceStep = 1 | 2 | 3 | 4`. The
        // bridge only emits 1-5; out-of-range falls to 4.
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
// Result translation
// ---------------------------------------------------------------------------

/**
 * Map the bridge's `BClassSponsorFriendResult` to the
 * host's wire `RunSetupSponsorFriendResult`. The shape
 * difference:
 * - bridge's `skipped: true, reason: "single-flight"` →
 *   wire's `running: true` (both mean "the runtime is busy")
 * - bridge's `skipped: true, reason: "X"` (other) →
 *   wire's `skipped: true, reason: "X"`
 * - bridge's `ok: true, ownerId, attempts` → wire's
 *   `running: true, ownerId` (the loop just finished
 *   successfully; the wrapper spawns fire-and-forget so
 *   this case only arises when the test calls sync, but
 *   the test asserts the spawn behavior, not the result)
 * - bridge's `ok: false, ...` → wire's `ok: false, ...`
 *   (direct mapping; the per-attempt lastErrorKind is
 *   carried over)
 */
function mapBridgeResultToWire(
  bridge: BClassSponsorFriendResult,
): RunSetupSponsorFriendResult {
  if (bridge.skipped && bridge.reason === "single-flight") {
    return {
      ok: true,
      running: true,
      ...(bridge.ownerId ? { ownerId: bridge.ownerId } : {}),
    };
  }
  if (bridge.skipped) {
    return {
      ok: true,
      skipped: true,
      reason: bridge.reason,
      ...(bridge.ownerId ? { ownerId: bridge.ownerId } : {}),
      ...(bridge.cooldownUntil ? { cooldownUntil: bridge.cooldownUntil } : {}),
      ...(bridge.lastErrorKind ? { lastErrorKind: bridge.lastErrorKind as "network-unreachable" | "proof-token-mismatch" | "profile-not-ready" | "mesh-not-ready" | "protocol-mismatch" | "sponsor-no-ack" | "other" } : {}),
    };
  }
  if (bridge.ok) {
    return {
      ok: true,
      ...(bridge.ownerId ? { ownerId: bridge.ownerId } : {}),
    };
  }
  return {
    ok: false,
    ...(bridge.reason ? { reason: bridge.reason } : {}),
    ...(bridge.ownerId ? { ownerId: bridge.ownerId } : {}),
    ...(bridge.lastErrorKind ? { lastErrorKind: bridge.lastErrorKind as "network-unreachable" | "proof-token-mismatch" | "profile-not-ready" | "mesh-not-ready" | "protocol-mismatch" | "sponsor-no-ack" | "other" } : {}),
  };
}

// ---------------------------------------------------------------------------
// Main entry point (the RPC adapter)
// ---------------------------------------------------------------------------

/**
 * Run the sponsor-friend bond flow. The host-side
 * wrapper that delegates the algorithm to the bridge.
 *
 * **Behavior:** identical to the pre-Step-3 host
 * (fire-and-forget + synchronous skip returns for
 * cooldown / profile / mesh / single-flight + self-
 * check). The only difference: the background loop
 * is the bridge's `runSponsorFriendBridge` instead
 * of the inlined `runSetupSponsorFriendRetryLoop`.
 */
/**
 * Persist "setup complete" when the sponsor is already a contact — including
 * clearing stale lastError/cooldown left by a failed auto-attempt before the
 * user bonded via Discover / LAN / QR. Shared by the run RPC and status heal.
 */
export async function persistSetupSponsorFriendAlreadyBonded(
  deps: Pick<SetupSponsorFriendRuntimeDeps, "saveNodeConfig" | "getProfileDir">,
  existing: PersistedNodeConfig | undefined,
): Promise<PersistedNodeConfig> {
  const nowIso = new Date().toISOString();
  const base = existing ?? {
    version: "0.1" as const,
    profileDir: deps.getProfileDir(),
    discoveryProfile: "wan-default" as const,
    enableMdns: true,
    relayEnabled: true,
    relayServerEnabled: false,
    advertiseAddrs: [],
    bootstrapPeers: [],
    bootstrapPresets: [],
    configuredRelays: [],
    modelProviders: { mode: "disabled" as const },
    chatAssistEnabled: false,
    contactAiPreferences: [],
    updatedAt: nowIso,
  };
  const next: PersistedNodeConfig = {
    ...base,
    setupSponsorFriendCompletedAt: base.setupSponsorFriendCompletedAt ?? nowIso,
    setupSponsorFriendLastError: undefined,
    setupSponsorFriendLastErrorKind: undefined,
    setupSponsorFriendCooldownUntil: undefined,
    setupSponsorFriendSkipReason: undefined,
    updatedAt: nowIso,
  };
  await deps.saveNodeConfig(next);
  return next;
}

export function setupSponsorFriendNeedsAlreadyBondedHeal(
  existing: PersistedNodeConfig | undefined,
): boolean {
  if (!existing) return true;
  return (
    !existing.setupSponsorFriendCompletedAt ||
    Boolean(existing.setupSponsorFriendLastError) ||
    Boolean(existing.setupSponsorFriendLastErrorKind) ||
    Boolean(existing.setupSponsorFriendCooldownUntil) ||
    Boolean(existing.setupSponsorFriendSkipReason)
  );
}

export async function runSetupSponsorFriendViaRuntime(
  deps: SetupSponsorFriendRuntimeDeps,
  input: RunSetupSponsorFriendInput = {},
): Promise<RunSetupSponsorFriendResult> {
  const now = deps.now ? deps.now() : Date.now();
  const existing = await deps.loadNodeConfig();

  // Resolve first so already-bonded can run before already-completed and clear
  // stale lastError even when completedAt was set earlier without clearing it.
  const resolved = await resolveEffectiveSetupSponsorFriend({
    persisted: existing,
    nodeBundleDir: deps.nodeBundleDir,
  });

  // Persist resolved peerId so mesh restart / strict-dial can allow-list without
  // re-parsing contactUri (and so Settings shows a concrete peer id).
  let configSnapshot = existing;
  if (resolved.peerId?.trim() && existing) {
    const want = resolved.peerId.trim();
    if (existing.setupSponsorFriendPeerId?.trim() !== want) {
      configSnapshot = {
        ...existing,
        setupSponsorFriendPeerId: want,
        updatedAt: new Date().toISOString(),
      };
      await deps.saveNodeConfig(configSnapshot);
    }
  }

  const forceBypass = input.forceBypassGuards === true;

  // Trust store guard (already-bonded) — before already-completed so a manual
  // bond after a failed auto-run still heals completedAt + clears lastError.
  if (resolved.ownerId && deps.isAlreadyBondedWith) {
    const ownerId = resolved.ownerId;
    const alreadyBonded = await deps.isAlreadyBondedWith(ownerId);
    if (alreadyBonded) {
      bondTrace(1, "PASS", "skip auto-bond — already bonded with sponsor", {
        ownerId: ownerId.slice(0, 20),
      });
      if (setupSponsorFriendNeedsAlreadyBondedHeal(configSnapshot)) {
        await persistSetupSponsorFriendAlreadyBonded(deps, configSnapshot);
      }
      return { ok: true, skipped: true, reason: "already-bonded", ownerId };
    }
  }

  // Already-completed guard (only when not already-bonded above).
  if (configSnapshot?.setupSponsorFriendCompletedAt && forceBypass !== true) {
    return { ok: true, skipped: true, reason: "already-completed" };
  }

  if (!resolved.enabled || !resolved.ownerId) {
    return { ok: true, skipped: true, reason: "disabled-or-incomplete" };
  }

  const ownerId: string = resolved.ownerId;

  // Cooldown + readiness guards.
  if (!forceBypass) {
    if (existing?.setupSponsorFriendCooldownUntil) {
      const untilMs = Date.parse(existing.setupSponsorFriendCooldownUntil);
      if (Number.isFinite(untilMs) && untilMs > now) {
        console.log(
          `[runSetupSponsorFriend] cooldown active for ownerId=${ownerId.slice(0, 16)}… until ${existing.setupSponsorFriendCooldownUntil}; manual Retry can bypass`,
        );
        recordSponsorSkip({
          deps,
          ownerId,
          reason: "cooldown",
          extra: `until=${existing.setupSponsorFriendCooldownUntil}`,
        });
        return {
          ok: true,
          skipped: true,
          reason: "cooldown",
          ownerId,
          cooldownUntil: existing.setupSponsorFriendCooldownUntil,
          lastErrorKind: existing.setupSponsorFriendLastErrorKind as
            | "network-unreachable"
            | "proof-token-mismatch"
            | "profile-not-ready"
            | "mesh-not-ready"
            | "protocol-mismatch"
            | "sponsor-no-ack"
            | "other"
            | undefined,
        };
      }
    }

    if (deps.probeHumanProfileReady) {
      const profileReady = await deps.probeHumanProfileReady();
      if (!profileReady) {
        console.log(
          `[runSetupSponsorFriend] profile not ready for ownerId=${ownerId.slice(0, 16)}…; not spawning a loop`,
        );
        recordSponsorSkip({ deps, ownerId, reason: "profile-not-ready" });
        return {
          ok: true,
          skipped: true,
          reason: "profile-not-ready",
          ownerId,
          lastErrorKind: "profile-not-ready",
        };
      }
    }

    if (deps.probeMeshReady) {
      const meshReady = await deps.probeMeshReady();
      if (!meshReady) {
        bondTrace(1, "WAIT", "not spawning auto-bond loop — mesh not ready (relay hop / reservation)", {
          ownerId: ownerId.slice(0, 20),
        });
        console.log(
          `[runSetupSponsorFriend] libp2p mesh not ready for ownerId=${ownerId.slice(0, 16)}…; not spawning a loop`,
        );
        recordSponsorSkip({ deps, ownerId, reason: "mesh-not-ready" });
        return {
          ok: true,
          skipped: true,
          reason: "mesh-not-ready",
          ownerId,
          lastErrorKind: "mesh-not-ready",
        };
      }
    }
  }

  // 5. Single-flight guard.
  if (activeSponsorLoops.has(ownerId)) {
    bondTrace(1, "WAIT", "auto-bond loop already in flight — not spawning a duplicate", {
      ownerId: ownerId.slice(0, 20),
    });
    console.log(
      `[runSetupSponsorFriend] loop already in flight for ownerId=${ownerId.slice(0, 16)}…; returning running: true without spawning a duplicate`,
    );
    return { ok: true, running: true, ownerId };
  }

  // 6. Self-check (sponsor is this peer / owner).
  const localProfile = await deps.loadNodeProfile();
  if (localProfile) {
    if (resolved.peerId && localProfile.peerId === resolved.peerId) {
      bondTrace(1, "PASS", "skip auto-bond — sponsor is this peer", {
        ownerId: ownerId.slice(0, 20),
      });
      return { ok: true, skipped: true, reason: "sponsor-is-self-peer" };
    }
    if (localProfile.owner.ownerId === ownerId) {
      bondTrace(1, "PASS", "skip auto-bond — sponsor is this owner", {
        ownerId: ownerId.slice(0, 20),
      });
      return { ok: true, skipped: true, reason: "sponsor-is-self-owner" };
    }
  }

  // 7. Claim the single-flight slot, spawn the bridge loop fire-and-forget.
  activeSponsorLoops.add(ownerId);
  bondTrace(1, "PASS", "mesh ready — spawning auto-bond loop (bridge impl)", {
    ownerId: ownerId.slice(0, 20),
  });

  const bridgeDeps = buildBridgeDeps(deps);
  void runSponsorFriendBridge(bridgeDeps, {
    forceBypassGuards: input.forceBypassGuards,
  })
    .catch((err: unknown) => {
      // The bridge's internal try/catch already handles
      // per-attempt failures. This is a final safety
      // net for unexpected throws.
      const message = err instanceof Error ? err.message : String(err);
      console.error("[runSetupSponsorFriend] bridge loop terminated unexpectedly:", message);
    })
    .finally(() => {
      activeSponsorLoops.delete(ownerId);
    });

  return {
    ok: true,
    running: true,
    ownerId,
  };
}

// ---------------------------------------------------------------------------
// NodeService entry point (preserved for node-service-impl.ts)
// ---------------------------------------------------------------------------

/** Convenience wrapper using NodeService when available. */
export async function runSetupSponsorFriendOnService(
  ns: NodeService,
  deps: Omit<
    SetupSponsorFriendRuntimeDeps,
    | "applyWanJoinInvite"
    | "searchPeers"
    | "sendHello"
    | "loadHelloProfile"
    | "loadNodeProfile"
    | "probeHumanProfileReady"
    | "isAlreadyBondedWith"
  >,
  input: RunSetupSponsorFriendInput = {},
): Promise<RunSetupSponsorFriendResult> {
  return runSetupSponsorFriendViaRuntime(
    {
      ...deps,
      applyWanJoinInvite: (token) => ns.applyWanJoinInvite(token),
      searchPeers: (input) => ns.searchPeers(input),
      sendHello: (targetOwnerId, profile, message, options) =>
        ns.sendHello(targetOwnerId, profile, message, options),
      loadHelloProfile: async () => {
        const hp = await ns.getHumanProfile();
        if (!hp) {
          throw new Error("Human profile not initialized");
        }
        return {
          displayName: hp.displayName ?? hp.ownerId,
          bio: hp.bio ?? "",
          interests: hp.hobbies ?? [],
          whatShares: [],
        };
      },
      probeHumanProfileReady: async () => Boolean(await ns.getHumanProfile()),
      isAlreadyBondedWith: async (sponsorOwnerId) => {
        const bonds = await ns.getBonds();
        const persisted = await deps.loadNodeConfig();
        const peerId = persisted?.setupSponsorFriendPeerId?.trim();
        return bonds.some((b) => {
          const idMatch =
            b.peerOwnerId === sponsorOwnerId ||
            (Boolean(peerId) && b.libp2pPeerId === peerId);
          return idMatch && (b.level === "direct" || b.level === "referred");
        });
      },
      loadNodeProfile: async () => {
        try {
          const np = ns.getProfile();
          const peerId = (ns as unknown as { peerId?: string }).peerId;
          return { owner: { ownerId: np.owner.ownerId }, peerId: peerId ?? "" };
        } catch {
          return undefined;
        }
      },
    },
    input,
  );
}
