import type { DiscoveryProfile } from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
import { createAuditEvent } from "@envoymesh/local-store";
import type { LocalTaskStore } from "@envoymesh/local-store";
import type { DiscoverySeedStore } from "./discovery-seed-store.js";
import { shouldRunCapabilityTopicFind } from "./peer-discovery-telemetry.js";

const CAPABILITY_DISCOVERY_QUERY_TIMEOUT_MS = 6_000;
const CAPABILITY_DISCOVERY_MAX_PROVIDERS = 32;

function dedupeAddrs(addrs: string[]): string[] {
  return [...new Set(addrs.map((a) => a.trim()).filter(Boolean))];
}

export function buildAutoCapabilityTopics(capabilities: readonly string[]): string[] {
  const normalized = capabilities
    .map((capability) => capability.trim())
    .filter(Boolean)
    .map((capability) => `capability:${capability}`);
  return [...new Set(normalized)];
}

export interface CapabilityDiscoveryCycleOptions {
  source: "startup" | "periodic" | "on-demand";
  /** When false, skip DHT find (provide still runs if DHT enabled). */
  runFind?: boolean;
  queryTimeoutMs?: number;
  limit?: number;
}

export async function runCapabilityDiscoveryCycle(deps: {
  mesh: EnvoyMesh;
  profile: DiscoveryProfile;
  topics: readonly string[];
  taskStore: Pick<LocalTaskStore, "appendAuditEvent">;
  discoverySeedStore: DiscoverySeedStore;
  enableDht: boolean;
  options: CapabilityDiscoveryCycleOptions;
}): Promise<void> {
  const { mesh, profile, topics, taskStore, discoverySeedStore, enableDht, options } = deps;
  if (!enableDht || topics.length === 0) {
    return;
  }

  const runFind =
    options.runFind !== false &&
    shouldRunCapabilityTopicFind(profile);
  const queryTimeoutMs = options.queryTimeoutMs ?? CAPABILITY_DISCOVERY_QUERY_TIMEOUT_MS;
  const limit = options.limit ?? CAPABILITY_DISCOVERY_MAX_PROVIDERS;
  const source = options.source;

  for (const topic of topics) {
    try {
      await mesh.provideCapabilityTopic(topic);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "p2p.trace",
          direction: "outbound",
          protocol: "discovery.capability.provide.ok",
          outcome: "record",
          summary: `capability provide ok topic=${topic} source=${source}`,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "p2p.trace",
          direction: "outbound",
          protocol: "discovery.capability.provide.fail",
          outcome: "record",
          summary: `capability provide failed topic=${topic} source=${source} error=${message}`,
        }),
      );
      continue;
    }

    if (!runFind) {
      continue;
    }

    let providers:
      | Array<{
          peerId: string;
          multiaddrs: string[];
        }>
      | undefined;
    try {
      providers = await mesh.findCapabilityTopicProviders(topic, {
        queryTimeoutMs,
        limit,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "p2p.trace",
          direction: "outbound",
          protocol: "discovery.capability.find.fail",
          outcome: "record",
          summary: `capability find failed topic=${topic} source=${source} error=${message}`,
        }),
      );
      continue;
    }

    const remoteProviders = providers.filter((provider) => provider.peerId !== mesh.peerId);
    const discoveredAddrs = dedupeAddrs(remoteProviders.flatMap((provider) => provider.multiaddrs));
    if (discoveredAddrs.length > 0) {
      await discoverySeedStore.upsertMany(discoveredAddrs, "capability-topic");
    }
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        direction: "outbound",
        protocol: "discovery.capability.find.ok",
        outcome: "record",
        summary: `capability find ok topic=${topic} source=${source} providers=${providers.length} remote=${remoteProviders.length} addrs=${discoveredAddrs.length}`,
      }),
    );
  }
}
