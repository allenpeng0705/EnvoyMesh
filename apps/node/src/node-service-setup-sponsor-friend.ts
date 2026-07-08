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

  // Self-check: if the sponsor's peer ID or owner ID matches the local node,
  // skip gracefully. This happens when the sponsor themselves runs the app —
  // they can't bond with themselves.
  const localProfile = await deps.loadNodeProfile();
  if (localProfile) {
    if (resolved.peerId && localProfile.peerId === resolved.peerId) {
      return { ok: true, skipped: true, reason: "sponsor-is-self-peer" };
    }
    if (localProfile.owner.ownerId === resolved.ownerId) {
      return { ok: true, skipped: true, reason: "sponsor-is-self-owner" };
    }
  }

  deps.assertOnline();
  const profile = await deps.loadHelloProfile();
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= resolved.maxAttempts; attempt += 1) {
    try {
      if (resolved.joinToken) {
        await deps.applyWanJoinInvite(resolved.joinToken);
      }

      if (resolved.peerId) {
        await deps.searchPeers({ peerId: resolved.peerId });
      }

      const hello = await deps.sendHello(resolved.ownerId, profile, resolved.helloMessage, {
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

      return {
        ok: true,
        ownerId: resolved.ownerId,
        helloMessageId: hello.messageId,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (existing) {
        await deps.saveNodeConfig({
          ...existing,
          setupSponsorFriendAttempts: attempt,
          setupSponsorFriendLastError: lastError,
          updatedAt: new Date().toISOString(),
        });
      }
      if (attempt < resolved.maxAttempts) {
        await sleep(resolved.retryDelayMs);
      }
    }
  }

  return {
    ok: false,
    reason: lastError ?? "sponsor hello failed",
    ownerId: resolved.ownerId,
  };
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
