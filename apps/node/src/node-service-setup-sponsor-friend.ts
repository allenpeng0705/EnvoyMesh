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
 *   - `other` — anything else (rate limit, schema mismatch, recipient
 *     policy denies, transient). Generic retry hint.
 */
export type SponsorFailureKind =
  | "network-unreachable"
  | "proof-token-mismatch"
  | "other";

/**
 * Classify the error message produced by the hello send. Pure function so
 * it can be unit-tested without wiring the full runtime.
 */
export function classifySponsorError(message: string | undefined): SponsorFailureKind {
  const m = (message ?? "").toLowerCase();
  if (!m) return "other";
  // Network reachability patterns from chat-outbound-deliver / network layer.
  if (
    /no reachable path|could not dial|dial backoff|dial tcp|connection refused|connection reset|econnrefused|etimedout|enotfound|ehostunreach|network is unreachable|relay.*unreachable|relay.*closed|relay.*timeout|relay.*disconnected|i\/o timeout|operation timed out/.test(
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
  /** Load the local node profile (for self-check). */
  loadNodeProfile(): Promise<{ owner: { ownerId: string }; peerId: string } | undefined>;
  assertOnline(): void;
}

export async function runSetupSponsorFriendViaRuntime(
  deps: SetupSponsorFriendRuntimeDeps,
): Promise<RunSetupSponsorFriendResult> {
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

  // Self-check: if the sponsor's peer ID or owner ID matches the local node,
  // skip gracefully. This happens when the sponsor themselves runs the app —
  // they can't bond with themselves.
  const localProfile = await deps.loadNodeProfile();
  if (localProfile) {
    if (resolved.peerId && localProfile.peerId === resolved.peerId) {
      return { ok: true, skipped: true, reason: "sponsor-is-self-peer" };
    }
    if (localProfile.owner.ownerId === ownerId) {
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
  }).catch((err) => {
    // The loop's internal try/catch already persists every per-attempt
    // failure. This catch is a final safety net for unexpected throws
    // outside that path (e.g. a dep throwing synchronously).
    const message = err instanceof Error ? err.message : String(err);
    console.error("[runSetupSponsorFriend] retry loop terminated unexpectedly:", message);
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
}

async function runSetupSponsorFriendRetryLoop(
  params: SetupSponsorFriendRetryLoopParams,
): Promise<void> {
  const { deps, existing, resolved, ownerId } = params;
  let lastError: string | undefined;
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

      const base =
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
        } satisfies PersistedNodeConfig);

      await deps.saveNodeConfig({
        ...base,
        setupSponsorFriendCompletedAt: new Date().toISOString(),
        setupSponsorFriendAttempts: attempt,
        setupSponsorFriendLastError: undefined,
        updatedAt: new Date().toISOString(),
      });

      console.log(
        `[runSetupSponsorFriend] succeeded on attempt ${attempt} for ownerId=${resolved.ownerId}`,
      );
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const lastErrorKind = classifySponsorError(lastError);
      // Always persist progress — first-run failures must survive a restart
      // so the operator can see "we tried and here's why" on next launch.
      // Use the same default-base pattern as the success path.
      const base =
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
        } satisfies PersistedNodeConfig);
      await deps.saveNodeConfig({
        ...base,
        setupSponsorFriendAttempts: attempt,
        setupSponsorFriendLastError: lastError,
        setupSponsorFriendLastErrorKind: lastErrorKind,
        updatedAt: new Date().toISOString(),
      });
      console.warn(
        `[runSetupSponsorFriend] attempt ${attempt}/${resolved.maxAttempts} failed: ${lastError}`,
      );
      if (attempt < resolved.maxAttempts) {
        await sleep(resolved.retryDelayMs);
      }
    }
  }

  console.warn(
    `[runSetupSponsorFriend] exhausted ${resolved.maxAttempts} attempts; last error: ${lastError ?? "(none)"}`,
  );
}

/** Convenience wrapper using NodeService when available. */
export async function runSetupSponsorFriendOnService(
  ns: NodeService,
  deps: Omit<SetupSponsorFriendRuntimeDeps, "applyWanJoinInvite" | "searchPeers" | "sendHello" | "loadHelloProfile" | "loadNodeProfile">,
): Promise<RunSetupSponsorFriendResult> {
  return runSetupSponsorFriendViaRuntime({
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
    loadNodeProfile: async () => {
      try {
        const np = ns.getProfile();
        const peerId = (ns as unknown as { peerId?: string }).peerId;
        return { owner: { ownerId: np.owner.ownerId }, peerId: peerId ?? "" };
      } catch {
        return undefined;
      }
    },
  });
}
