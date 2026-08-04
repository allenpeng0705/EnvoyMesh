/**
 * Zero-step first friend — apply bundled sponsor contact and send hello after setup.
 */
import {
  resolveSetupSponsorFriendConfig,
  type ResolvedSetupSponsorFriend,
  type RunSetupSponsorFriendResult,
  type SetupSponsorFriendConfig,
} from "@envoymesh/api";
import type { HelloProfile, NodeService, SendHelloOptions } from "@envoymesh/api";
import { createAuditEvent, type AuditEvent } from "@envoymesh/local-store";
import { loadBundledSponsorFriendConfig } from "./bundled-sponsor-friend-loader.js";
import { pickAddressFilterForPeer } from "./outbound-dial-hints.js";
import { bondTrace, classifyBondDialTarget } from "./bond-trace.js";
import type { PersistedNodeConfig } from "./node-config-store.js";

/**
 * Module-level set of owner ids with an in-flight retry loop. Prevents
 * duplicate loops when SetupView's auto-trigger and NodeStateContext's
 * auto-trigger both fire (or when the user clicks Retry during a running
 * cycle). The set is small (one entry per configured sponsor — usually
 * 1, occasionally 2-3 for a power user) so we don't bother with TTLs or
 * eviction; the loop's finally-handler deletes its entry on completion.
 */
const activeSponsorLoops = new Set<string>();

/** Test helper — clear the single-flight set between tests. */
export function __resetActiveSponsorLoopsForTests(): void {
  activeSponsorLoops.clear();
}

/**
 * Classification of a sponsor-hello failure. Drives which hint the UI
 * surfaces — proof-token hints for token mismatches, network hints for
 * reachability failures, and a generic message for everything else.
 *
 *   - `network-unreachable` — all transport paths failed (libp2p direct,
 *     relay-tunnel, etc.). Operator needs to check Settings → Network on
 *     both sides and/or pick a relay both nodes can reach.
 *   - `proof-token-mismatch` — recipient requires a matching
 *     `bondAutonomySponsorProofToken` and the hello was rejected because
 *     the bundled `proofOfContext` doesn't match. Operator needs to set
 *     the same token on the recipient's node-config.json.
 *   - `profile-not-ready` — local human profile isn't loaded yet. NOT a
 *     transport problem; the loop should pause and wait for the profile
 *     to land before retrying. UI surfaces a "Profile required" hint
 *     instead of a network hint.
 *   - `other` — anything else (rate limit, schema mismatch, recipient
 *     policy denies, transient). Generic retry hint.
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
 * Classify the error message produced by the hello send. Pure function so
 * it can be unit-tested without wiring the full runtime.
 *
 * Order matters — earlier patterns win. Profile-not-ready must beat the
 * network patterns because the underlying "Human profile not initialized"
 * string contains the substring "not initialized" which would otherwise
 * trip the "operation timed out" pattern (it doesn't today, but keeping
 * the comment as a tripwire). Mesh-not-ready must beat network patterns
 * because we want to surface a "wait for the network" hint, not a "your
 * network is down" hint.
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
  // Mesh-not-ready — the libp2p mesh exists but hasn't started its event
  // loop yet, or the bound `mesh` instance is undefined when the loop
  // fires. The original signal in the runtime is `"[searchPeers] Node
  // not initialized"` from `node-service-discovery` when `getMesh()`
  // returns null/undefined, plus the libp2p `"not started"` family
  // thrown by `node.start()` callers.
  if (
    /node not initialized|mesh not (yet )?ready|mesh not started|libp2p not (yet )?started|node.start.*not (yet )?called|envoy not started|envoymesh not started|node is starting/.test(
      m,
    )
  ) {
    return "mesh-not-ready";
  }
  // Network reachability patterns from chat-outbound-deliver / network layer.
  // `no outbound dial attempted` is the dial layer's signal that it had
  // no usable candidate addrs (all filtered by addressFilter, all LAN
  // stripped under wan-public, etc.) — semantically a reachability
  // failure from the operator's perspective, even though no actual
  // dial was attempted.
  //
  // Includes the libp2p `ensurePeerReachable` and `Cannot open protocol
  // stream on limited connection` families observed in 2026-07-12 log:
  //   "[network] ensurePeerReachable failed for /ip4/47.93.11.212/…:
  //    The operation was aborted due to timeout"
  //   "[network] outbound /envoymesh/message/0.1.0 dial failed for
  //    …/p2p-circuit/…: Cannot open protocol stream on limited connection"
  //   "expect-reply attempt N/3 failed for /ip4/…: sendExpectReply:
  //    peer closed stream without a reply"
  if (
    /no reachable path|could not dial|dial backoff|dial tcp|connection refused|connection reset|econnrefused|etimedout|enotfound|ehostunreach|network is unreachable|relay.*unreachable|relay.*closed|relay.*timeout|relay.*disconnected|i\/o timeout|operation timed out|no outbound dial attempted|ensurepeerreachable failed|cannot open protocol stream on limited connection|peer closed stream without a reply|stream open failed|unexpected eof|connection error|sendexpectreply/.test(
      m,
    )
  ) {
    return "network-unreachable";
  }
  // Sponsor-no-ack — the local sendHello completed but the sponsor
  // never emitted `bond.established` within the configured timeout. The
  // bytes may have been lost in transit (relay stream drop, NAT rebind,
  // etc.) or the sponsor's accept handler may have silently rejected.
  // Surface this distinctly from `network-unreachable` so the UI can
  // hint at "the message was sent but the sponsor didn't accept" rather
  // than "we couldn't reach the sponsor at all".
  if (/sponsor did not acknowledge|sponsor-no-ack|did not acknowledge bond/.test(m)) {
    return "sponsor-no-ack";
  }
  // Protocol-mismatch — the envelope's intent isn't accepted on the
  // protocol it was routed to (e.g. `bond.request` landed on the chat
  // protocol, which only accepts `chat.message`). Surfacing this lets
  // the UI show a "protocol routing" hint instead of "network" — these
  // are code bugs, not operator-network bugs.
  if (
    /invalid intent .* on .* protocol|protocol.*rejected|unsupported intent|unknown intent|intent.*not (yet )?supported|unsupported protocol/.test(
      m,
    )
  ) {
    return "protocol-mismatch";
  }
  // Proof-token mismatch from bondAutonomyWorker / bond.request handler.
  if (
    /proof.?of.?context|sponsor.?proof.?token|proofoftoken|token.?mismatch|invalid.?proof|missing.?proof/.test(
      m,
    )
  ) {
    return "proof-token-mismatch";
  }
  return "other";
}

export function persistedSetupSponsorFriendConfig(
  config: PersistedNodeConfig | undefined,
): SetupSponsorFriendConfig | null {
  if (!config?.setupSponsorFriendEnabled) return null;
  return {
    enabled: true,
    contactUri: config.setupSponsorFriendContactUri,
    ownerId: config.setupSponsorFriendOwnerId,
    peerId: config.setupSponsorFriendPeerId,
    joinToken: config.setupSponsorFriendJoinToken,
    displayName: config.setupSponsorFriendDisplayName,
    helloMessage: config.setupSponsorFriendHelloMessage,
    proofOfContext: config.setupSponsorFriendProofOfContext,
    maxAttempts: config.setupSponsorFriendMaxAttempts,
    retryDelayMs: config.setupSponsorFriendRetryDelayMs,
    cooldownMs: config.setupSponsorFriendCooldownMs,
    forceBypassGuards: undefined,
  };
}

export async function resolveEffectiveSetupSponsorFriend(input: {
  persisted?: PersistedNodeConfig;
  nodeBundleDir?: string;
}): Promise<ResolvedSetupSponsorFriend> {
  const bundled = await loadBundledSponsorFriendConfig(input.nodeBundleDir);
  return resolveSetupSponsorFriendConfig({
    bundled,
    persisted: persistedSetupSponsorFriendConfig(input.persisted),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Default cooldown after a cycle exhausts `maxAttempts` (or hits a permanent
 *  skip). 60s — long enough to avoid hammering the dial, short enough that
 *  the user can come back from a coffee and see fresh state. */
const DEFAULT_COOLDOWN_MS = 60_000;

function resolveCooldownMs(config: PersistedNodeConfig | undefined): number {
  const v = config?.setupSponsorFriendCooldownMs;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return DEFAULT_COOLDOWN_MS;
}

function isCooldownActive(
  existing: PersistedNodeConfig | undefined,
  now: number,
): { active: boolean; until?: string } {
  const untilIso = existing?.setupSponsorFriendCooldownUntil;
  if (typeof untilIso !== "string" || !untilIso) return { active: false };
  const untilMs = Date.parse(untilIso);
  if (!Number.isFinite(untilMs)) return { active: false };
  if (untilMs <= now) return { active: false };
  return { active: true, until: untilIso };
}

/**
 * Fire-and-forget observability hook for a setup-sponsor-friend skip.
 * The runtime never persists skip decisions (the loop's
 * `getSetupSponsorFriendStatus` reads the in-memory return), so without
 * this the UI can't tell "we're waiting for the network" from "we
 * never started" — both look the same on disk. The audit event is the
 * single source of truth for "what is the runtime waiting on right
 * now?". The dep is optional: tests that don't wire it simply skip
 * the audit write and the runtime still returns the same skip result.
 *
 * Outcome is `"record"` (not `"deny"`): this is an in-process wait, not
 * a security decision. The `summary` carries the human-readable reason
 * and any extra context (e.g. cooldown expiry). `correlationId` is the
 * sponsor's `ownerId` so a UI audit query can filter to one sponsor.
 */
function recordSponsorSkip(input: {
  deps: SetupSponsorFriendRuntimeDeps;
  ownerId: string;
  reason: string;
  extra?: string;
}): void {
  const { deps, ownerId, reason, extra } = input;
  if (!deps.appendAudit) return;
  // Don't await — the runtime is fire-and-forget on the RPC return path
  // and we don't want a slow audit write to block the skip return.
  // Errors are logged but never thrown: the in-memory skip is still
  // the source of truth for the UI's behavior.
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
  /** Optional explicit profile-readiness probe — used by the auto-trigger
   *  to decide whether to spawn a loop or wait. When omitted, the runtime
   *  probes `loadHelloProfile()` on its own. The probe is split out so
   *  callers (UI) can read profile state without forcing a load. */
  probeHumanProfileReady?(): Promise<boolean>;
  /** Optional explicit libp2p mesh-readiness probe — used by the auto-trigger
   *  to gate the loop on the mesh being actually up, not just on
   *  `nodeStatus === "running"`. The NodeStateContext auto-trigger fires
   *  the moment nodeStatus becomes "running", which can be tens of seconds
   *  before the libp2p mesh's event loop is fully online. Sending
   *  `bond.request` against a not-yet-started mesh returns either
   *  `"Node not initialized"` from `searchPeers` (silently, no error) or
   *  a `dialHints count=1` sendHello that times out at 30s — the loop
   *  burns 12 attempts before the operator sees a final state.
   *
   *  The probe should return `true` only when the underlying
   *  `EnvoyMesh` instance is started AND the relay circuit (if enabled)
   *  has a reservation, so the first attempt of the loop has a
   *  non-empty set of routable dial hints. When omitted, the runtime
   *  skips the gate and falls back to the existing per-attempt
   *  `assertOnline()` check. */
  probeMeshReady?(): Promise<boolean>;
  /** Load the local node profile (for self-check). */
  loadNodeProfile(): Promise<{ owner: { ownerId: string }; peerId: string } | undefined>;
  assertOnline(): void;
  /**
   * Wait for the sponsor's `bond.established` event for a given
   * `targetOwnerId` (i.e. the requester side — that's who emits the
   * event after the sponsor side stores the bond). Resolves when the
   * event fires, rejects on timeout.
   *
   * The runtime subscribes to the bond context's `bond:established`
   * event and resolves the promise when an event matching the target
   * owner fires. Times out with a "sponsor-no-ack" error so the loop
   * can fall through to the existing retry path. Used to fix the
   * false-positive-completion bug (where `setupSponsorFriendCompletedAt`
   * was being persisted the instant `sendHello` returned locally, even
   * though the message might have been lost in transit over the
   * relay).
   */
  waitForBondEstablished?(
    targetOwnerId: string,
    timeoutMs: number,
  ): Promise<{ peerOwnerId: string; displayName?: string }>;
  /**
   * Optional: the sponsor's known multiaddrs (bundled config +
   * peer directory). Used by the smart address-filter picker to decide
   * whether to try LAN+circuit (`"all"`) or skip LAN (`"wan-public"`).
   * Prefer `getPeerMultiaddrs` so each retry can pick up mDNS/DHT updates.
   * When both are omitted, the loop falls back to the local profile default.
   */
  peerMultiaddrs?: string[];
  /** Optional: refresh sponsor multiaddrs each retry attempt. */
  getPeerMultiaddrs?(): Promise<string[]>;
  /**
   * Optional: local node's `discoveryProfile` (e.g. `"lan-fast"`,
   * `"wan-default"`). The smart picker reads this to honor a local
   * opt-in to RFC1918 paths when the peer might be on the same LAN.
   * When omitted, the picker defaults to `"wan-public"` for any peer.
   */
  localDiscoveryProfile?: string;
  /** Optional: read the current cooldown from a custom source (test seam). */
  now?(): number;
  /**
   * Optional: append an audit event for observability hooks. The runtime
   * fires a `setup.sponsor_friend.skipped` event whenever it returns
   * `{ skipped: true, reason: <X> }` (mesh-not-ready, profile-not-ready,
   * cooldown, etc.) so the UI can surface "waiting for the network"
   * hints instead of looking dead. Skips are NOT persisted to
   * node-config.json — the audit log is the only signal. When this dep
   * is omitted (e.g. in unit tests that don't care about the audit
   * side-effect) the runtime is a no-op for the audit write and the
   * skip still returns as before.
   */
  appendAudit?: (event: AuditEvent) => Promise<void>;
}

export interface RunSetupSponsorFriendInput {
  /** Manual-retry entry point: bypass cooldown and profile-not-ready
   *  guards so the user can always force-start a fresh cycle. */
  forceBypassGuards?: boolean;
}

export async function runSetupSponsorFriendViaRuntime(
  deps: SetupSponsorFriendRuntimeDeps,
  input: RunSetupSponsorFriendInput = {},
): Promise<RunSetupSponsorFriendResult> {
  const now = deps.now ? deps.now() : Date.now();
  const existing = await deps.loadNodeConfig();
  // Manual retry (forceBypassGuards=true) always re-runs, even if a
  // previous attempt was marked completed. The previous attempt may
  // have been a false positive — pre-fix the runtime marked
  // `setupSponsorFriendCompletedAt` the instant `sendHello` returned
  // locally, before the sponsor's `bond.established` event fired. If
  // the user is clicking "Try again", they're explicitly asking to
  // clear that stale state. The loop will re-set the timestamp on
  // success (idempotent for already-bonded peers — bondAutonomy on
  // the sponsor side just no-ops an already-bonded requester).
  //
  // Auto-trigger (no forceBypassGuards) still respects the
  // completedAt marker so we don't hammer the sponsor's auto-accept
  // every restart. The runtime is the source of truth for "we
  // successfully bonded"; the user's manual override is the explicit
  // escape hatch.
  if (existing?.setupSponsorFriendCompletedAt && input.forceBypassGuards !== true) {
    // No audit event here — "already-completed" is a deliberate no-op
    // (the user already bonded). The UI's tile is the source of truth.
    return { ok: true, skipped: true, reason: "already-completed" };
  }

  const resolved = await resolveEffectiveSetupSponsorFriend({
    persisted: existing,
    nodeBundleDir: deps.nodeBundleDir,
  });

  if (!resolved.enabled || !resolved.ownerId) {
    // No audit event here — the runtime wasn't configured, so the UI
    // shows "Setup not configured" from the resolved config itself.
    return { ok: true, skipped: true, reason: "disabled-or-incomplete" };
  }

  // After the early return above, `resolved.ownerId` is guaranteed to be
  // a non-empty string, but the public type of `ResolvedSetupSponsorFriend`
  // declares it as `string | undefined`. Capture it in a narrowed local so
  // the rest of the function (and the background retry loop below) can use
  // it as `string` without `!` non-null assertions at every use site.
  const ownerId: string = resolved.ownerId;
  const forceBypass = input.forceBypassGuards === true;

  // Cooldown guard — pause auto-retry after a failed cycle. Manual Retry
  // (forceBypassGuards=true) bypasses this. The runtime still persists
  // `cooldownUntil` so a non-forced caller is rate-limited.
  if (!forceBypass) {
    const cooldown = isCooldownActive(existing, now);
    if (cooldown.active) {
      console.log(
        `[runSetupSponsorFriend] cooldown active for ownerId=${ownerId.slice(0, 16)}… until ${cooldown.until}; manual Retry can bypass`,
      );
      recordSponsorSkip({
        deps,
        ownerId,
        reason: "cooldown",
        extra: cooldown.until ? `until=${cooldown.until}` : undefined,
      });
      return {
        ok: true,
        skipped: true,
        reason: "cooldown",
        ownerId,
        cooldownUntil: cooldown.until,
        lastErrorKind: existing?.setupSponsorFriendLastErrorKind,
      };
    }

    // Profile-readiness guard — if the local human profile isn't loaded
    // yet, don't spawn the loop. The first attempt would just hit
    // "Human profile not initialized" 12 times. The UI gates its
    // auto-trigger on profile readiness separately; this is the
    // runtime-side belt-and-suspenders for direct RPCs (e.g. from
    // SetupView or pasteContactUri).
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

    // Mesh-readiness guard — nodeStatus flips to "running" the moment the
    // process is up, but the libp2p mesh can take another 10-30s to
    // register listen addrs, complete the DHT bootstrap, and (if
    // configured) land a relay reservation. Without this guard, the loop
    // fires immediately, `searchPeers` returns `[]` with `"Node not
    // initialized"` (silently, no error), and `sendHello` proceeds with
    // `dialHints count=1` against a mesh that can't actually route —
    // burning all 12 attempts before the operator sees a final state.
    //
    // Skip is also classified as `mesh-not-ready` so the UI can show a
    // "waiting for the network" hint instead of "Retrying" forever.
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
      bondTrace(1, "PASS", "mesh ready — spawning auto-bond loop", {
        ownerId: ownerId.slice(0, 20),
      });
    }
  }

  // Single-flight: if a retry loop is already in flight for this sponsor,
  // don't spawn a duplicate. Two concurrent loops would race on
  // saveNodeConfig (last-write-wins — correct end state, but each loop
  // does up to 12×30s of work, and they'd compete for the dial queue).
  // The caller still gets `running: true` so the UI behaves the same.
  if (activeSponsorLoops.has(ownerId)) {
    console.log(
      `[runSetupSponsorFriend] loop already in flight for ownerId=${ownerId.slice(0, 16)}…; returning running: true without spawning a duplicate`,
    );
    return { ok: true, running: true, ownerId };
  }
  activeSponsorLoops.add(ownerId);

  // Self-check: if the sponsor's peer ID or owner ID matches the local node,
  // skip gracefully. This happens when the sponsor themselves runs the app —
  // they can't bond with themselves.
  const localProfile = await deps.loadNodeProfile();
  if (localProfile) {
    if (resolved.peerId && localProfile.peerId === resolved.peerId) {
      activeSponsorLoops.delete(ownerId);
      return { ok: true, skipped: true, reason: "sponsor-is-self-peer" };
    }
    if (localProfile.owner.ownerId === ownerId) {
      activeSponsorLoops.delete(ownerId);
      return { ok: true, skipped: true, reason: "sponsor-is-self-owner" };
    }
  }

  // assertOnline() + loadHelloProfile() live INSIDE the per-attempt try so
  // their failure modes are persisted the same way as network errors. Without
  // this, an early call from SetupView/NodeStateContext (right after
  // startNode or after the Tauri node process restart for OpenClaw
  // provider env) hits a node still in `"starting"` state. The throw from
  // `_assertOnline()` (`Node is starting. Start the node first.`) would
  // propagate out of the runtime, the for-loop's catch block never runs,
  // and no `setupSponsorFriend*` fields land in node-config.json — leaving
  // the tile stuck on "Not started yet" with no actionable hint.
  //
  // The retry loop is fire-and-forget: the RPC returns immediately with
  // `{ ok: true, running: true }` so the UI's RPC timeout (typically 30-120s)
  // doesn't kill the wait mid-attempt. The runtime's worst case is
  // maxAttempts × (per-attempt-call-time + retryDelayMs) — easily 6+ minutes
  // when the per-attempt `expect-reply` budget is involved — and a real RPC
  // timeout would surface as a misleading "Request runSetupSponsorFriend
  // timed out" before the runtime classifies any failure. The retry loop
  // persists state after each attempt, and the UI's polling
  // (getSetupSponsorFriendStatus) surfaces the final result.
  void runSetupSponsorFriendRetryLoop({
    deps,
    existing,
    resolved,
    ownerId,
    startedAt: now,
    cooldownMs: resolveCooldownMs(existing),
  })
    .catch((err) => {
      // The loop's internal try/catch already persists every per-attempt
      // failure. This catch is a final safety net for unexpected throws
      // outside that path (e.g. a dep throwing synchronously).
      const message = err instanceof Error ? err.message : String(err);
      console.error("[runSetupSponsorFriend] retry loop terminated unexpectedly:", message);
    })
    .finally(() => {
      // Release the single-flight slot. Whether the loop succeeded,
      // exhausted its retries, or threw, the next caller is allowed to
      // spawn a fresh run (e.g. the user clicks Retry after seeing the
      // final failure).
      activeSponsorLoops.delete(ownerId);
    });

  return {
    ok: true,
    running: true,
    ownerId,
  };
}

interface SetupSponsorFriendRetryLoopParams {
  deps: SetupSponsorFriendRuntimeDeps;
  existing: Awaited<ReturnType<SetupSponsorFriendRuntimeDeps["loadNodeConfig"]>>;
  resolved: Awaited<ReturnType<typeof resolveEffectiveSetupSponsorFriend>>;
  /** Pre-narrowed sponsor owner id (caller guarantees non-empty). */
  ownerId: string;
  /** Wall-clock at loop start — used to stamp `lastAttemptAt` consistently. */
  startedAt: number;
  /** Cooldown applied after exhaustion. */
  cooldownMs: number;
}

/** Read the persisted config snapshot — used to build a save base. Pure
 *  helper so the success and failure branches can share the same fallback. */
function buildBasePersistedConfig(
  existing: PersistedNodeConfig | undefined,
  deps: SetupSponsorFriendRuntimeDeps,
): PersistedNodeConfig {
  return (
    existing ??
    ({
      version: "0.1",
      profileDir: deps.getProfileDir(),
      discoveryProfile: "wan-default",
      relayEnabled: true,
      relayServerEnabled: false,
      advertiseAddrs: [],
      bootstrapPeers: [],
      bootstrapPresets: [],
      configuredRelays: [],
      modelProviders: { mode: "disabled" },
      chatAssistEnabled: false,
      contactAiPreferences: [],
      updatedAt: new Date().toISOString(),
    } satisfies PersistedNodeConfig)
  );
}

async function runSetupSponsorFriendRetryLoop(
  params: SetupSponsorFriendRetryLoopParams,
): Promise<void> {
  const { deps, existing, resolved, ownerId, startedAt, cooldownMs } = params;
  let lastError: string | undefined;
  let lastErrorKind: SponsorFailureKind = "other";
  let profile: HelloProfile | undefined;

  for (let attempt = 1; attempt <= resolved.maxAttempts; attempt += 1) {
    try {
      bondTrace(1, "INFO", "auto-bond attempt starting", {
        attempt,
        maxAttempts: resolved.maxAttempts,
        sponsorPeerId: resolved.peerId?.slice(0, 16),
        sponsorOwnerId: ownerId.slice(0, 20),
      });
      deps.assertOnline();
      // Re-probe mesh readiness inside the loop too. The guard at the call
      // site is the first line of defense (skips the spawn entirely), but
      // libp2p can still be initializing when the loop's first iteration
      // runs if the spawn raced with `node.start()`. Re-probing here
      // turns that race from "burn 12 attempts" into "bail on the first
      // one with a classified hint".
      if (deps.probeMeshReady) {
        const meshReady = await deps.probeMeshReady();
        if (!meshReady) {
          bondTrace(1, "WAIT", "mesh not ready yet (need relay hop / reservation)", {
            attempt,
          });
          console.log(
            `[setupSponsorFriend] attempt ${attempt}/${resolved.maxAttempts}: mesh not ready, deferring`,
          );
          throw new Error("libp2p mesh not ready yet — deferring bond.request");
        }
        bondTrace(1, "PASS", "local mesh ready for sponsor bond (relay path usable)");
      }
      // Load the hello profile lazily — failure here is also persisted, so
      // a half-initialized profile surfaces as a clear error in the tile
      // instead of an opaque "Not started yet".
      profile ??= await deps.loadHelloProfile();

      if (resolved.joinToken) {
        await deps.applyWanJoinInvite(resolved.joinToken);
      }

      // Refresh sponsor circuits via relay.lookup across configured relays
      // BEFORE dialing. Multi-relay: whichever relay Allen is actually
      // RESERVED on returns hasHopSlot + circuit multiaddrs; bundled invite
      // paths alone may point at a different relay.
      if (resolved.peerId) {
        try {
          bondTrace(2, "WAIT", "relay.lookup sponsor across configured relays", {
            peer: resolved.peerId.slice(0, 16),
          });
          await deps.searchPeers({ peerId: resolved.peerId });
          bondTrace(2, "PASS", "relay.lookup/searchPeers completed for sponsor");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          bondTrace(2, "WAIT", "relay.lookup/searchPeers failed — falling back to bundled dial hints", {
            error: msg.slice(0, 120),
          });
        }
      }

      // Smart address-filter: refresh sponsor multiaddrs each attempt so
      // late mDNS / DHT / relay.lookup discoveries can flip LAN+circuit → "all" with
      // circuit-first dials. Prefer getPeerMultiaddrs when wired.
      const peerMultiaddrs = deps.getPeerMultiaddrs
        ? await deps.getPeerMultiaddrs()
        : deps.peerMultiaddrs;
      const publicCircuits = (peerMultiaddrs ?? []).filter(
        (a) => classifyBondDialTarget(a) === "public-circuit",
      );
      const privateCircuits = (peerMultiaddrs ?? []).filter(
        (a) => classifyBondDialTarget(a) === "private-circuit",
      );
      if (publicCircuits.length > 0) {
        bondTrace(2, "PASS", "have public /p2p-circuit/ dial target for sponsor", {
          publicCircuits: publicCircuits.length,
          privateCircuits: privateCircuits.length,
          sample: publicCircuits[0]?.slice(0, 120),
        });
      } else if (privateCircuits.length > 0) {
        bondTrace(2, "FAIL", "only private-hop circuits — WAN dial will fail; need Allen RESERVED on community relay", {
          privateCircuits: privateCircuits.length,
          sample: privateCircuits[0]?.slice(0, 120),
        });
      } else {
        bondTrace(2, "FAIL", "no circuit dial targets for sponsor (empty multiaddrs)", {
          addrCount: peerMultiaddrs?.length ?? 0,
        });
      }
      // Circuit+LAN → "wan-public". Circuit-only →
      // "wan-public". lan-fast → "all" with LAN-first. See pickAddressFilterForPeer.
      const addressFilter = pickAddressFilterForPeer(
        peerMultiaddrs,
        deps.localDiscoveryProfile ?? (await deps.loadNodeConfig())?.discoveryProfile,
      );
      bondTrace(3, "WAIT", "sending bond.request (sendHello) — watch [bond-trace] dial lines next", {
        addressFilter,
        attempt,
      });
      const hello = await deps.sendHello(ownerId, profile, resolved.helloMessage, {
        proofOfContext: resolved.proofOfContext,
        targetPeerId: resolved.peerId,
        addressFilter,
      });
      bondTrace(3, "PASS", "bond.request sendHello returned (local deliver completed)", {
        messageId: hello?.messageId?.slice(0, 12),
      });

      // Best-effort peer-directory cache warm (lookup already ran above).
      if (resolved.peerId) {
        try {
          await deps.searchPeers({ peerId: resolved.peerId });
        } catch {
          /* best-effort cache warm */
        }
      }

      // Wait for the sponsor's `bond.established` event before marking
      // the loop COMPLETED. The local `sendHello` only proves the bytes
      // left the local libp2p stream; it doesn't wait for the sponsor's
      // `accept-bond` reply. If the message is lost in transit (relay
      // stream drop, NAT rebind, etc.) the runtime used to silently
      // mark COMPLETED anyway, which masked the real failure. Now we
      // require a matching `bond:established` event with a 30s timeout.
      // On timeout, fall through to the existing error path with a new
      // failure kind `sponsor-no-ack` so the loop can retry.
      if (deps.waitForBondEstablished) {
        const ACKNOWLEDGEMENT_TIMEOUT_MS = 30_000;
        bondTrace(4, "WAIT", "waiting for sponsor bond.established ack", {
          timeoutMs: ACKNOWLEDGEMENT_TIMEOUT_MS,
        });
        console.log(
          `[setupSponsorFriend] sendHello OK, waiting up to ${ACKNOWLEDGEMENT_TIMEOUT_MS}ms for sponsor bond.established acknowledgement...`,
        );
        try {
          await deps.waitForBondEstablished(ownerId, ACKNOWLEDGEMENT_TIMEOUT_MS);
          bondTrace(4, "PASS", "sponsor acknowledged bond (bond.established)");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          bondTrace(4, "FAIL", "sponsor did not acknowledge bond", { error: msg.slice(0, 160) });
          throw new Error(
            `sponsor did not acknowledge bond within ${ACKNOWLEDGEMENT_TIMEOUT_MS}ms: ${msg}`,
          );
        }
      }

      const base = buildBasePersistedConfig(existing, deps);
      await deps.saveNodeConfig({
        ...base,
        setupSponsorFriendCompletedAt: new Date().toISOString(),
        setupSponsorFriendAttempts: attempt,
        setupSponsorFriendLastAttemptAt: new Date(startedAt).toISOString(),
        setupSponsorFriendLastError: undefined,
        setupSponsorFriendLastErrorKind: undefined,
        setupSponsorFriendCooldownUntil: undefined,
        setupSponsorFriendSkipReason: undefined,
        updatedAt: new Date().toISOString(),
      });

      bondTrace(4, "PASS", "auto-bond COMPLETE — all 4 steps succeeded", {
        attempt,
        sponsorOwnerId: ownerId.slice(0, 20),
      });
      console.log(
        `[runSetupSponsorFriend] succeeded on attempt ${attempt} for ownerId=${ownerId}`,
      );
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      lastErrorKind = classifySponsorError(lastError);
      const failStep =
        lastErrorKind === "mesh-not-ready"
          ? (1 as const)
          : lastErrorKind === "network-unreachable"
            ? (3 as const)
            : lastErrorKind === "sponsor-no-ack"
              ? (4 as const)
              : (4 as const);
      bondTrace(failStep, "FAIL", "auto-bond attempt failed", {
        attempt,
        kind: lastErrorKind,
        error: lastError.slice(0, 200),
      });
      // Always persist progress — first-run failures must survive a restart
      // so the operator can see "we tried and here's why" on next launch.
      // Use the same default-base pattern as the success path.
      const base = buildBasePersistedConfig(existing, deps);
      const attemptAt = new Date().toISOString();
      await deps.saveNodeConfig({
        ...base,
        setupSponsorFriendAttempts: attempt,
        setupSponsorFriendLastAttemptAt: attemptAt,
        setupSponsorFriendLastError: lastError,
        setupSponsorFriendLastErrorKind: lastErrorKind,
        updatedAt: new Date().toISOString(),
      });
      console.warn(
        `[runSetupSponsorFriend] attempt ${attempt}/${resolved.maxAttempts} failed: ${lastError}`,
      );

      // profile-not-ready is permanent until the user finishes profile
      // setup. Burning 12 attempts then a 60s cooldown, only to fail the
      // same way, is what produced the "Retrying forever" UX. Bail out
      // early so the user sees "Profile required" instead of "Retrying".
      if (lastErrorKind === "profile-not-ready") {
        const base2 = buildBasePersistedConfig(existing, deps);
        await deps.saveNodeConfig({
          ...base2,
          // Carry forward the per-attempt diagnostics so the tile shows
          // the same classified lastError the user just saw during the
          // active attempt, not a cleared state.
          setupSponsorFriendLastError: lastError,
          setupSponsorFriendLastErrorKind: "profile-not-ready",
          setupSponsorFriendSkipReason: "profile-not-ready",
          setupSponsorFriendCooldownUntil: new Date(Date.now() + cooldownMs).toISOString(),
          updatedAt: new Date().toISOString(),
        });
        console.warn(
          `[runSetupSponsorFriend] bailing out: profile not ready. Cooldown until ${new Date(
            Date.now() + cooldownMs,
          ).toISOString()}`,
        );
        return;
      }

      // mesh-not-ready is transient (libp2p finishes its event loop
      // eventually) but the 30s dial timeout makes per-attempt burns
      // costly. Same bail-and-cooldown pattern as profile-not-ready
      // so the UI shows "Mesh is starting" instead of "Retrying" for
      // 60s, and the next auto-trigger has a fresh window to probe.
      if (lastErrorKind === "mesh-not-ready") {
        const base2 = buildBasePersistedConfig(existing, deps);
        await deps.saveNodeConfig({
          ...base2,
          setupSponsorFriendLastError: lastError,
          setupSponsorFriendLastErrorKind: "mesh-not-ready",
          setupSponsorFriendSkipReason: "mesh-not-ready",
          setupSponsorFriendCooldownUntil: new Date(Date.now() + cooldownMs).toISOString(),
          updatedAt: new Date().toISOString(),
        });
        console.warn(
          `[runSetupSponsorFriend] bailing out: libp2p mesh not ready. Cooldown until ${new Date(
            Date.now() + cooldownMs,
          ).toISOString()}`,
        );
        return;
      }

      // protocol-mismatch is a code bug, not a network or operator
      // issue. Bail with a permanent-ish cooldown (still respects
      // `forceBypassGuards` for Retry) so the operator sees the
      // classified hint and can file a bug instead of watching 12
      // attempts spam "Retrying".
      if (lastErrorKind === "protocol-mismatch") {
        const base2 = buildBasePersistedConfig(existing, deps);
        await deps.saveNodeConfig({
          ...base2,
          setupSponsorFriendLastError: lastError,
          setupSponsorFriendLastErrorKind: "protocol-mismatch",
          setupSponsorFriendSkipReason: "protocol-mismatch",
          setupSponsorFriendCooldownUntil: new Date(Date.now() + cooldownMs).toISOString(),
          updatedAt: new Date().toISOString(),
        });
        console.warn(
          `[runSetupSponsorFriend] bailing out: protocol-mismatch. Cooldown until ${new Date(
            Date.now() + cooldownMs,
          ).toISOString()}`,
        );
        return;
      }

      if (attempt < resolved.maxAttempts) {
        await sleep(resolved.retryDelayMs);
      }
    }
  }

  // Loop exhausted `maxAttempts` — apply the cooldown so the tile stops
  // showing "Retrying" and shows the classified lastError instead. The next
  // auto-trigger is gated on `cooldownUntil` expiring.
  const cooldownUntil = new Date(Date.now() + cooldownMs).toISOString();
  const base = buildBasePersistedConfig(existing, deps);
  await deps.saveNodeConfig({
    ...base,
    setupSponsorFriendCooldownUntil: cooldownUntil,
    setupSponsorFriendSkipReason: "cooldown",
    updatedAt: new Date().toISOString(),
  });

  console.warn(
    `[runSetupSponsorFriend] exhausted ${resolved.maxAttempts} attempts; last error: ${lastError ?? "(none)"}; cooldown until ${cooldownUntil}`,
  );
  bondTrace(4, "FAIL", "auto-bond exhausted all attempts — copy [bond-trace] lines from this session", {
    maxAttempts: resolved.maxAttempts,
    kind: lastErrorKind ?? "other",
    error: (lastError ?? "(none)").slice(0, 200),
  });
}

/** Convenience wrapper using NodeService when available. */
export async function runSetupSponsorFriendOnService(
  ns: NodeService,
  deps: Omit<SetupSponsorFriendRuntimeDeps, "applyWanJoinInvite" | "searchPeers" | "sendHello" | "loadHelloProfile" | "loadNodeProfile" | "probeHumanProfileReady">,
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
