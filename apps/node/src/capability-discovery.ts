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

/**
 * Slugify a free-text hobby/knowledge tag into a DHT-safe topic segment.
 * Lowercase, alnum + hyphen only; collapses/trims non-conforming chars.
 *
 * Shared by the advertise path (buildInterestTopics) and the search path
 * (NodeDiscoveryRuntime.searchPeers) so both sides normalize identically.
 * Exported so callers can convert a single raw interest to its canonical
 * `interest:<slug>` topic without reconstructing the whole list.
 */
export function slugifyTopic(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug;
}

/**
 * Canonical topic string for a single raw interest: `interest:<slug>`.
 * Returns "" if the slug is empty (e.g. user typed only punctuation).
 * This is the single source of truth for the interest topic vocabulary —
 * both advertise (capability-discovery / identity) and search
 * (node-service-discovery) MUST route raw interests through this.
 */
export function interestTopicFor(rawInterest: string): string {
  const slug = slugifyTopic(rawInterest);
  return slug ? `interest:${slug}` : "";
}

/**
 * Build `interest:<slug>` DHT topics from a human profile's hobbies + knowledge.
 * Empty/duplicate/unsuitable tags are dropped. Used to advertise a new user's
 * chosen interests so peers running `searchPeers({ interests: ["music"] })`
 * can find them — the search side applies the same `interestTopicFor()`
 * normalization, so the two paths agree on the on-wire topic vocabulary.
 */
export function buildInterestTopics(input: {
  hobbies?: readonly string[] | null;
  knowledge?: readonly string[] | null;
}): string[] {
  const tags: string[] = [];
  for (const hobby of input.hobbies ?? []) {
    const slug = slugifyTopic(hobby);
    if (slug) tags.push(`interest:${slug}`);
  }
  for (const item of input.knowledge ?? []) {
    const slug = slugifyTopic(item);
    if (slug) tags.push(`interest:${slug}`);
  }
  return [...new Set(tags)];
}

/**
 * Aggregate all DHT topics this node should advertise for discovery:
 * device-certificate capabilities, profile interests (hobbies + knowledge),
 * and coarse geo topics derived from the profile's discovery location.
 *
 * `geoTopics` should be precomputed by the caller via `deriveLocationDiscoveryTopics`
 * from `@envoymesh/api` — kept as an arg so this helper stays sync + testable.
 */
export function buildProfileDiscoveryTopics(input: {
  capabilities: readonly string[];
  hobbies?: readonly string[] | null;
  knowledge?: readonly string[] | null;
  geoTopics?: readonly string[] | null;
}): string[] {
  return [
    ...buildAutoCapabilityTopics(input.capabilities),
    ...buildInterestTopics({ hobbies: input.hobbies, knowledge: input.knowledge }),
    ...(input.geoTopics ?? []),
  ];
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

  // Advertise all topics concurrently (not sequentially) to avoid blocking
  // startup for N_topics × 10s. Each provide has its own internal timeout.
  await Promise.allSettled(
    topics.map(async (topic) => {
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
        return; // skip find if provide failed
      }

      if (!runFind) return;

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
        return;
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
    }),
  );
}
