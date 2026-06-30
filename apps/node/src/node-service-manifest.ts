/**
 * Capability manifest + relay-config runtime.
 *
 * Extracted from `node-service-impl.ts`. Owns:
 *   - getCapabilityManifest / updateCapabilityManifest
 *   - addRelay (resolves domain addresses via resolveBootstrapAddresses)
 *   - removeRelay
 *
 * The runtime is pure: takes a `CapabilityManifestContext` carrying the
 * capability-manifest store + config store accessors and returns the
 * same shape the class did. The class methods collapse to 1-line
 * delegations.
 */
import {
  resolveBootstrapAddresses,
  looksLikeDomain,
} from "./bootstrap-resolver.js";
import {
  createDefaultPersistedNodeConfig,
  type PersistedNodeConfig,
} from "./node-config-store.js";
import type {
  CapabilityManifest,
  ManifestVisibility,
  RelayConfig,
} from "@envoymesh/api";
import type { CapabilityManifestStore } from "@envoymesh/local-store";

export interface CapabilityManifestContext {
  /** Local profile dir (for default-config fallback). */
  getProfileDir(): string | null;
  /** The local capability-manifest store, or undefined when not initialised. */
  getCapabilityManifestStore(): CapabilityManifestStoreLike | undefined;
  /** Load the persisted node config. */
  loadNodeConfig(): Promise<PersistedNodeConfig | undefined>;
  /** Save the persisted node config (full overwrite). */
  saveNodeConfig(config: PersistedNodeConfig): Promise<void>;
}

/**
 * Subset of the capability-manifest store's surface that the runtime
 * actually uses. Keeps the runtime decoupled from the concrete
 * implementation.
 */
export interface CapabilityManifestStoreLike {
  loadManifest(): Promise<CapabilityManifest | undefined> | CapabilityManifest | undefined;
  saveManifest(manifest: CapabilityManifest): Promise<void> | void;
  createDefaultManifest(params?: {
    visibility?: ManifestVisibility;
    sensitivityCeiling?: "public" | "friends" | "private";
    keywords?: string[];
    capabilities?: string[];
    description?: string;
  }): Promise<CapabilityManifest> | CapabilityManifest;
}

export async function getCapabilityManifestViaRuntime(
  ctx: CapabilityManifestContext,
): Promise<CapabilityManifest | undefined> {
  const store = ctx.getCapabilityManifestStore();
  if (!store) return undefined;
  return await store.loadManifest();
}

export async function updateCapabilityManifestViaRuntime(
  ctx: CapabilityManifestContext,
  params: {
    visibility?: ManifestVisibility;
    sensitivityCeiling?: "public" | "friends" | "private";
    keywords?: string[];
    capabilities?: string[];
    description?: string;
  },
): Promise<CapabilityManifest> {
  const store = ctx.getCapabilityManifestStore();
  if (!store) {
    throw new Error("Capability manifest store not available");
  }
  const existing = await store.loadManifest();
  if (existing) {
    const updated: CapabilityManifest = {
      ...existing,
      ...(params.visibility !== undefined && { visibility: params.visibility }),
      ...(params.sensitivityCeiling !== undefined && { sensitivityCeiling: params.sensitivityCeiling }),
      ...(params.keywords !== undefined && { keywords: params.keywords }),
      ...(params.capabilities !== undefined && { capabilities: params.capabilities }),
      ...(params.description !== undefined && { description: params.description }),
      updatedAt: new Date().toISOString(),
    };
    await store.saveManifest(updated);
    return updated;
  }
  return await store.createDefaultManifest(params);
}

export async function addRelayViaRuntime(
  ctx: CapabilityManifestContext,
  addr: string,
  level?: number,
  region?: string,
): Promise<RelayConfig> {
  const config =
    (await ctx.loadNodeConfig()) ??
    createDefaultPersistedNodeConfig(ctx.getProfileDir() ?? "");

  const relayId = `relay_${Date.now()}`;
  const newRelay: RelayConfig = { relayId, addr, level, region, enabled: true };

  // If the address looks like a domain, try to resolve it to a multiaddr with peer ID.
  let resolvedAddr = addr;
  if (looksLikeDomain(addr)) {
    console.log(`[capability-manifest] Resolving relay domain: ${addr}`);
    const results = await resolveBootstrapAddresses([addr]);
    if (results.length > 0 && results[0].resolved.length > 0) {
      resolvedAddr = results[0].resolved[0];
      console.log(`[capability-manifest] Resolved ${addr} to ${resolvedAddr}`);
    }
  }

  const updated: PersistedNodeConfig = {
    ...config,
    configuredRelays: [
      ...config.configuredRelays,
      { ...newRelay, addr: resolvedAddr },
    ],
    updatedAt: new Date().toISOString(),
  };
  await ctx.saveNodeConfig(updated);
  return { ...newRelay, addr: resolvedAddr };
}

export async function removeRelayViaRuntime(
  ctx: CapabilityManifestContext,
  relayId: string,
): Promise<void> {
  const config = await ctx.loadNodeConfig();
  if (!config) return;
  const updated: PersistedNodeConfig = {
    ...config,
    configuredRelays: config.configuredRelays.filter((r: PersistedNodeConfig["configuredRelays"][number]) => r.relayId !== relayId),
    updatedAt: new Date().toISOString(),
  };
  await ctx.saveNodeConfig(updated);
}