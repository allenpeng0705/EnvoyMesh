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
  buildAutoCapabilityTopics,
  runCapabilityDiscoveryCycle,
} from "./capability-discovery.js";
import {
  shouldRunPeriodicCapabilityFind,
  type ResolvedConnectivityRuntime,
} from "./connectivity-runtime.js";
import type { DiscoverySeedStore } from "./discovery-seed-store.js";
import type { LocalTaskStore } from "@envoymesh/local-store";
import type { DiscoveryProfile } from "@envoymesh/api";

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
  const topics = buildAutoCapabilityTopics(profile.deviceCertificate.capabilities);
  await runCapabilityDiscoveryCycle({
    mesh: mesh as never,
    profile: config.discoveryProfile,
    topics,
    taskStore: ctx.getTaskStore()!,
    discoverySeedStore: ctx.getDiscoverySeedStore()!,
    enableDht: connectivityRuntime.enableDht,
    options: {
      source,
      runFind:
        opts.runFind ??
        (source === "on-demand"
          ? true
          : shouldRunPeriodicCapabilityFind(connectivityRuntime)),
    },
  });
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
  const topics = buildAutoCapabilityTopics(profile.deviceCertificate.capabilities);
  if (topics.length === 0) {
    return;
  }

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

