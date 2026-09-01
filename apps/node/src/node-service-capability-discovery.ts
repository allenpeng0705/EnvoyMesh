/**
 * Capability discovery scheduler runtime.
 *
 * Extracted from `node-service-impl.ts` (Step 20a). Owns the two
 * private helpers that drive capability discovery at startup,
 * periodically, and on-demand:
 *
 *   - runCapabilityDiscoveryCycleViaRuntime — guards + delegates to
 *     `runCapabilityDiscoveryCycle`
 *   - startCapabilityDiscoverySchedulerViaRuntime — installs the
 *     periodic timer (with jitter) that calls
 *     `runCapabilityDiscoveryCycle`
 *
 * Both functions take a typed `CapabilityDiscoveryContext` carrying
 * only the fields they read or mutate. The class methods collapse
 * to one-line delegations.
 */
import {
  buildProfileDiscoveryTopics,
  buildPublishTopicsFromManifest,
  runCapabilityDiscoveryCycle,
  withMarketShopDiscoveryTopic,
  withPublishDiscoveryTopics,
  withWebContentDiscoveryTopic,
} from "./capability-discovery.js";
import type { ResolvedConnectivityRuntime } from "./connectivity-runtime.js";
import type { DiscoverySeedStore } from "./discovery-seed-store.js";
import type { LocalTaskStore } from "@envoymesh/local-store";
import type { DiscoveryProfile } from "@envoymesh/api";
import { deriveLocationDiscoveryTopics } from "@envoymesh/api";
import type {
  DiscoveryLocation,
  DiscoveryLocationPrecision,
} from "@envoymesh/protocol";
import { join } from "node:path";
import { createWebContentStore } from "./web-content-store.js";

export interface CapabilityDiscoveryContext {
  /** Live mesh instance (or undefined when stopped). */
  getMesh(): unknown | undefined;
  /** Local node profile (or undefined when not initialised). */
  getProfile(): { deviceCertificate: { capabilities: string[] } } | undefined;
  /** Local task store. */
  getTaskStore(): LocalTaskStore | undefined;
  /** Discovery seed store. */
  getDiscoverySeedStore(): DiscoverySeedStore | undefined;
  /** Load the persisted node config. */
  loadConfig(): Promise<{ discoveryProfile: DiscoveryProfile } | undefined>;
  /** Current capability-discovery timer (or undefined). */
  getCapabilityDiscoveryTimer(): NodeJS.Timeout | undefined;
  /** Replace the capability-discovery timer (or clear it via undefined). */
  setCapabilityDiscoveryTimer(timer: NodeJS.Timeout | undefined): void;
  /** Sync the pairing-kiosk server after node start (Phase 35D). */
  syncPairingKioskFromConfig(): Promise<void>;
  /** Load the owner's signed human profile (hobbies/knowledge/location), if any. */
  loadHumanProfile(): Promise<HumanProfileLite | undefined>;
  /** Profile directory — used to detect published web content for DHT advertise. */
  getProfileDir(): string | undefined;
  /** Replace capability/publish topics on relay.checkin advertisements (cross-NAT lookup). */
  mergeAdvertisedDiscoveryTopics?(topics: string[]): void;
  /** True when local shop has ≥1 active/reserved public listing (advertise `market:shop`). */
  hasPublicMarketShop?(): Promise<boolean>;
}

/** Subset of `HumanProfilePayload` consumed by the discovery scheduler. */
export interface HumanProfileLite {
  hobbies?: readonly string[] | null;
  knowledge?: readonly string[] | null;
  discoveryLocation?: DiscoveryLocation | null;
  discoveryLocationPrecision?: DiscoveryLocationPrecision | null;
}

export type CapabilityDiscoverySource = "startup" | "periodic" | "on-demand";

export async function runCapabilityDiscoveryCycleViaRuntime(
  ctx: CapabilityDiscoveryContext,
  source: CapabilityDiscoverySource,
  opts: { connectivityRuntime: ResolvedConnectivityRuntime; runFind?: boolean },
): Promise<void> {
  const mesh = ctx.getMesh();
  const profile = ctx.getProfile();
  if (!mesh || !profile || !ctx.getTaskStore() || !ctx.getDiscoverySeedStore()) {
    return;
  }
  const config = await ctx.loadConfig();
  if (!config) return;
  const { connectivityRuntime } = opts;
  const humanProfile = await ctx.loadHumanProfile().catch(() => undefined);
  const geoTopics = humanProfile
    ? deriveLocationDiscoveryTopics({
        location: humanProfile.discoveryLocation ?? null,
        precision: humanProfile.discoveryLocationPrecision ?? null,
      })
    : [];
  const topics = buildProfileDiscoveryTopics({
    capabilities: profile.deviceCertificate.capabilities,
    hobbies: humanProfile?.hobbies,
    knowledge: humanProfile?.knowledge,
    geoTopics,
  });
  // Phase 45 — advertise envoymesh.web-content when the manifest has entries.
  // Phase 45E — also advertise publish:<slug> for tagged entries.
  let finalTopics = topics;
  const profileDir = ctx.getProfileDir();
  if (profileDir) {
    try {
      const store = createWebContentStore(join(profileDir, "web"));
      const manifest = await store.load();
      if (manifest.entries.length > 0) {
        finalTopics = withWebContentDiscoveryTopic(finalTopics);
        const publishTopics = buildPublishTopicsFromManifest(manifest.entries);
        if (publishTopics.length > 0) {
          finalTopics = withPublishDiscoveryTopics(finalTopics, publishTopics);
        }
      }
    } catch {
      // Non-fatal — capability discovery continues without web topics.
    }
  }
  // Phase 63C — advertise market:shop when the owner has public listings for sale.
  try {
    if (ctx.hasPublicMarketShop && (await ctx.hasPublicMarketShop())) {
      finalTopics = withMarketShopDiscoveryTopic(finalTopics);
    }
  } catch {
    // Non-fatal — shop advertise is best-effort.
  }
  await runCapabilityDiscoveryCycle({
    mesh: mesh as never,
    profile: config.discoveryProfile,
    topics: finalTopics,
    taskStore: ctx.getTaskStore()!,
    discoverySeedStore: ctx.getDiscoverySeedStore()!,
    enableDht: connectivityRuntime.enableDht,
    options: {
      source,
      // Discovery find is triggered-only (B2): on-demand / explicit runFind.
      // Periodic and startup cycles advertise only — never free-running findProviders.
      runFind: opts.runFind ?? source === "on-demand",
    },
  });
  // Mirror capability + publish topics into relay checkin so NAT peers
  // can resolve them via relay.lookup when DHT provide is empty/flaky.
  // Always replace (including empty) so removed publish tags shrink the roster.
  ctx.mergeAdvertisedDiscoveryTopics?.(finalTopics);
}

export function startCapabilityDiscoverySchedulerViaRuntime(
  ctx: CapabilityDiscoveryContext,
  connectivityRuntime: ResolvedConnectivityRuntime,
): void {
  const existing = ctx.getCapabilityDiscoveryTimer();
  if (existing) {
    clearTimeout(existing);
    ctx.setCapabilityDiscoveryTimer(undefined);
  }
  const profile = ctx.getProfile();
  if (!connectivityRuntime.enableDht || !profile) {
    return;
  }
  // Note: we no longer short-circuit on empty capability topics here. A new
  // user typically has zero capabilities but has chosen interests in setup —
  // the async cycle below loads the human profile and merges interest +
  // geo topics. Short-circuiting would suppress advertising those interests.

  const schedule = (): void => {
    const jitter = Math.floor(
      Math.random() * connectivityRuntime.capabilityDiscoveryJitterMs,
    );
    const timer = setTimeout(() => {
      void runCapabilityDiscoveryCycleViaRuntime(ctx, "periodic", { connectivityRuntime })
        .catch((err) =>
          console.warn("[node-service] capability discovery cycle failed:", err),
        )
        .finally(() => {
          if (ctx.getMesh()) {
            schedule();
          }
        });
    }, connectivityRuntime.capabilityDiscoveryIntervalMsEffective() + jitter);
    ctx.setCapabilityDiscoveryTimer(timer);
  };
  schedule();

  // Phase 35D — kick the pairing-kiosk server on node start so a config
  // that has it enabled at boot time is honoured without a manual
  // `updateNodeConfig` call.
  void ctx.syncPairingKioskFromConfig().catch((err) => {
    console.warn("[pairing-kiosk] sync on start failed:", err);
  });
}

