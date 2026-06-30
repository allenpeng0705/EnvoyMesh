/**
 * Agent-setup runtime (Step 20b).
 *
 * Extracted from `node-service-impl.ts` (Node Lifecycle section).
 * Owns three private helpers used to wire up agent stores before
 * a node is fully running:
 *
 *   - initNodeViaRuntime — creates the profile dir + writes the
 *     initial persisted config, plus kicks off push notification init
 *   - ensureAgentStoresViaRuntime — re-loads profile + task store
 *     from the persisted config when the Envoy-managed path needs them
 *   - requireToolExecutionContextViaRuntime — returns a tool execution
 *     context or throws a specific error describing the failure
 */
import { derivePeerId } from "@envoymesh/identity";
import {
  loadOrCreateNodeProfile,
  createLocalTaskStore,
} from "@envoymesh/local-store";
import {
  defaultBootstrapPresetsForDiscoveryProfile,
} from "@envoymesh/api";
import type {
  PersistedNodeConfig,
} from "./node-config-store.js";
import { pushNotificationService } from "./push-notification.js";
import type { MeshToolContext } from "./tool-registry.js";
import type {
  InitNodeOptions,
  NodeInitResult,
  NodeProfile,
  NodeStatus,
} from "@envoymesh/api";

export interface AgentSetupContext {
  /** Save the persisted node config. */
  saveConfig(config: PersistedNodeConfig): Promise<void>;
  /** Load the persisted node config. */
  loadConfig(): Promise<PersistedNodeConfig | undefined>;
  /** Local profile dir. */
  getProfileDir(): string | null;
  /** Get the current node profile (or undefined if not loaded). */
  getProfile(): NodeProfile | undefined;
  /** Set the current node profile. */
  setProfile(profile: NodeProfile | undefined): void;
  /** Get the current task store (or undefined if not loaded). */
  getTaskStore(): unknown;
  /** Set the current task store. */
  setTaskStore(store: unknown): void;
  /** Current node lifecycle status string. */
  getNodeStatus(): NodeStatus;
  /** Resolve the tool execution context for the current profile. */
  getToolExecutionContext(): Promise<MeshToolContext | null>;
}

export async function initNodeViaRuntime(
  ctx: AgentSetupContext,
  profileDir: string,
  options?: InitNodeOptions,
): Promise<NodeInitResult> {
  console.log(`[node-service] initNode called: profileDir=${profileDir}, options=`, options);
  const profile = await loadOrCreateNodeProfile(profileDir);
  const discoveryProfile = options?.discoveryProfile ?? "lan-fast";
  const config: PersistedNodeConfig = {
    version: "0.1",
    profileDir,
    discoveryProfile,
    relayEnabled: options?.relayEnabled ?? true,
    relayServerEnabled: options?.relayServerEnabled ?? false,
    advertiseAddrs: options?.advertiseAddrs ?? [],
    bootstrapPeers: options?.bootstrapPeers ?? [],
    bootstrapPresets:
      options?.bootstrapPresets ??
      [...defaultBootstrapPresetsForDiscoveryProfile(discoveryProfile)],
    configuredRelays: [],
    modelProviders: { mode: "disabled" },
    chatAssistEnabled: false,
    autonomousKillSwitch: false,
    autonomousPolicies: [],
    contactAiPreferences: [],
    updatedAt: new Date().toISOString(),
  };
  await ctx.saveConfig(config);
  ctx.setProfile(profile);

  // Phase 31I — initialize push notification service
  void pushNotificationService.init(profileDir).catch((err: unknown) => {
    console.warn("[node-service] push notification service init failed:", err);
  });

  return {
    profileDir,
    peerId: derivePeerId(profile.device.publicKeyPem),
    ownerId: profile.owner.ownerId,
    deviceId: profile.device.deviceId,
  };
}

export async function ensureAgentStoresViaRuntime(
  ctx: AgentSetupContext,
): Promise<boolean> {
  const config = await ctx.loadConfig();
  if (!config?.profileDir) {
    return Boolean(ctx.getProfile() && ctx.getTaskStore());
  }
  if (!ctx.getProfile()) {
    ctx.setProfile(await loadOrCreateNodeProfile(config.profileDir));
  }
  if (!ctx.getTaskStore()) {
    ctx.setTaskStore(createLocalTaskStore(config.profileDir));
  }
  return Boolean(ctx.getProfile() && ctx.getTaskStore());
}

export async function requireToolExecutionContextViaRuntime(
  ctx: AgentSetupContext,
): Promise<MeshToolContext> {
  if (!(await ensureAgentStoresViaRuntime(ctx))) {
    const status = ctx.getNodeStatus();
    if (status === "starting") {
      throw new Error("Node is still starting. Wait a moment and try again.");
    }
    if (status === "offline") {
      throw new Error(
        "Node is offline. Complete setup or start the node from Settings → Node.",
      );
    }
    const config = await ctx.loadConfig();
    if (!config) {
      throw new Error(
        "Node not set up. Finish Welcome setup or run the Envoy node app.",
      );
    }
    throw new Error("Node not ready for Assistant. Start the node from Settings → Node.");
  }
  const context = await ctx.getToolExecutionContext();
  if (!context) {
    throw new Error("Could not initialize agent identity. Check Settings → Node.");
  }
  return context;
}