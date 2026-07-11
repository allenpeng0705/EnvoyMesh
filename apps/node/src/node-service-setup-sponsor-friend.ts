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
import { loadBundledSponsorFriendConfig } from "./bundled-sponsor-friend-loader.js";
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
  | "other";

/**
 * Classify the error message produced by the hello send. Pure function so
 * it can be unit-tested without wiring the full runtime.
 */
export function classifySponsorError(message: string | undefined): SponsorFailureKind {
  const m = (message ?? "").toLowerCase();
  if (!m) return "other";
  // Profile-not-ready must be checked BEFORE the network patterns, because
  // the underlying "Human profile not initialized" string contains the
  // substring "not initialized" which otherwise doesn't trip the network
  // patterns but is the very specific signal we want to surface separately.
  if (
    /human profile not initialized|profile not (yet )?initialized|profile not ready|missing profile/.test(
      m,
    )
  ) {
    return "profile-not-ready";
  }
  // Network reachability patterns from chat-outbound-deliver / network layer.
  // `no outbound dial attempted` is the dial layer's signal that it had
  // no usable candidate addrs (all filtered by addressFilter, all LAN
  // stripped under wan-public, etc.) — semantically a reachability
  // failure from the operator's perspective, even though no actual
  // dial was attempted.
  if (
    /no reachable path|could not dial|dial backoff|dial tcp|connection refused|connection reset|econnrefused|etimedout|enotfound|ehostunreach|network is unreachable|relay.*unreachable|relay.*closed|relay.*timeout|relay.*disconnected|i\/o timeout|operation timed out|no outbound dial attempted/.test(
      m,
    )
  ) {
    return "network-unreachable";
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
  /** Load the local node profile (for self-check). */
  loadNodeProfile(): Promise<{ owner: { ownerId: string }; peerId: string } | undefined>;
  assertOnline(): void;
  /** Optional: read the current cooldown from a custom source (test seam). */
  now?(): number;
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
  if (existing?.setupSponsorFriendCompletedAt) {
    return { ok: true, skipped: true, reason: "already-completed" };
  }

  const resolved = await resolveEffectiveSetupSponsorFriend({
    persisted: existing,
    nodeBundleDir: deps.nodeBundleDir,
  });

  if (!resolved.enabled || !resolved.ownerId) {
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
        return {
          ok: true,
          skipped: true,
          reason: "profile-not-ready",
          ownerId,
          lastErrorKind: "profile-not-ready",
        };
      }
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
      deps.assertOnline();
      // Load the hello profile lazily — failure here is also persisted, so
      // a half-initialized profile surfaces as a clear error in the tile
      // instead of an opaque "Not started yet".
      profile ??= await deps.loadHelloProfile();

      if (resolved.joinToken) {
        await deps.applyWanJoinInvite(resolved.joinToken);
      }

      if (resolved.peerId) {
        await deps.searchPeers({ peerId: resolved.peerId });
      }

      const hello = await deps.sendHello(ownerId, profile, resolved.helloMessage, {
        proofOfContext: resolved.proofOfContext,
        targetPeerId: resolved.peerId,
      });

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

      console.log(
        `[runSetupSponsorFriend] succeeded on attempt ${attempt} for ownerId=${resolved.ownerId}`,
      );
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      lastErrorKind = classifySponsorError(lastError);
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
