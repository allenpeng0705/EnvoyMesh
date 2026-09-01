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
  // Keep Unicode letters/numbers (CJK etc.) so publish:/interest: topics match
  // what authors tag and what Discover / Bazaar search for.
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Canonical topic string for a single raw interest: `interest:<slug>`.
 * Returns "" if the slug is empty (e.g. user typed only punctuation).
 * This is the single source of truth for the interest topic vocabulary —
 * both advertise (capability-discovery / identity) and search
 * (node-service-discovery) MUST route raw interests through this.
 *
 * Idempotent: passing an already-normalized topic ("interest:music")
 * returns it unchanged instead of double-prefixing
 * ("interest:interest-music"). This matters because the production
 * advertise call site (`computePublicDiscoveryTopics`) pre-normalizes
 * its interests, and the defensive normalization in
 * `_advertisePublicDiscoveryTopics` would otherwise double-prefix
 * them.
 */
export function interestTopicFor(rawInterest: string): string {
  const trimmed = rawInterest.trim();
  if (trimmed.toLowerCase().startsWith("interest:")) {
    const rest = trimmed.slice("interest:".length);
    const slug = slugifyTopic(rest);
    return slug ? `interest:${slug}` : "";
  }
  const slug = slugifyTopic(trimmed);
  return slug ? `interest:${slug}` : "";
}

/**
 * Canonical topic string for a user's display name: `displayname:<slug>`.
 * Returns "" if the slug is empty (e.g. user typed only punctuation).
 *
 * Why this exists: the Social UI's "By name" search lets users type
 * free-text — typically a display name like "Allen Peng", NOT the @handle
 * (`username:allen_peng`). The username-topic lookup is exact (no
 * slug), so `"Allen Peng"` doesn't match the advertised `username:allen_peng`.
 * Publishing + looking up the display name as its own topic (slugged the
 * same way on both sides) gives name search a real handle to query.
 *
 * Both advertise (node-service-identity → _advertisePublicDiscoveryTopics)
 * and search (node-service-discovery → searchPeers) MUST route raw display
 * names through this so the on-wire topic keys agree.
 *
 * Idempotent: passing an already-normalized topic returns it unchanged.
 */
export function displayNameTopicFor(rawDisplayName: string): string {
  const trimmed = rawDisplayName.trim();
  if (trimmed.toLowerCase().startsWith("displayname:")) {
    const rest = trimmed.slice("displayname:".length);
    const slug = slugifyTopic(rest);
    return slug ? `displayname:${slug}` : "";
  }
  const slug = slugifyTopic(trimmed);
  return slug ? `displayname:${slug}` : "";
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

/**
 * Canonical topic string for a published web-content tag: `publish:<slug>`.
 * Returns "" if the slug is empty.
 * Idempotent: already-normalized `publish:` topics pass through unchanged.
 */
export function publishTopicFor(rawTag: string): string {
  const trimmed = rawTag.trim();
  const withoutPrefix = trimmed.startsWith("publish:")
    ? trimmed.slice("publish:".length)
    : trimmed;
  const slug = slugifyTopic(withoutPrefix);
  return slug ? `publish:${slug}` : "";
}

/**
 * Normalize a Discover "By topic" / explicit `topic` query to the on-wire
 * DHT key. Known prefixes pass through (idempotent). Bare free text maps
 * to `interest:<slug>` so UI searches match advertised interest topics.
 */
export function normalizeDiscoveryTopicQuery(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (lower.startsWith("interest:")) {
    return interestTopicFor(t) || t.toLowerCase();
  }
  if (lower.startsWith("displayname:")) {
    return displayNameTopicFor(t) || t.toLowerCase();
  }
  if (lower.startsWith("publish:")) {
    return publishTopicFor(t);
  }
  if (lower.startsWith("username:")) {
    const name = t.slice(lower.indexOf(":") + 1).trim().toLowerCase();
    return name ? `username:${name}` : "";
  }
  if (lower.startsWith("capability:") || lower.startsWith("geo:")) {
    return t;
  }
  // Phase 63C — shop rendezvous (`market:shop`) and future category topics.
  if (lower.startsWith("market:")) {
    return lower;
  }
  return interestTopicFor(t);
}

/**
 * Expand a By-topic query into one or more DHT keys to try.
 * Bare text → `interest:<slug>` plus `capability:<slug>` (and the raw
 * slug tag) so profile capability tags advertised as `capability:coding-help`
 * / `coding-help` are reachable from the same UI search box.
 */
export function expandDiscoveryTopicQueries(raw: string): string[] {
  const primary = normalizeDiscoveryTopicQuery(raw);
  if (!primary) return [];
  const out: string[] = [primary];
  const t = raw.trim();
  const lower = t.toLowerCase();
  const hasKnownPrefix =
    lower.startsWith("interest:") ||
    lower.startsWith("displayname:") ||
    lower.startsWith("publish:") ||
    lower.startsWith("username:") ||
    lower.startsWith("capability:") ||
    lower.startsWith("geo:") ||
    lower.startsWith("market:");
  if (!hasKnownPrefix) {
    const slug = slugifyTopic(t);
    if (slug) {
      const cap = `capability:${slug}`;
      if (!out.includes(cap)) out.push(cap);
      if (!out.includes(slug)) out.push(slug);
    }
  }
  return out;
}

/**
 * Build DHT publish topics from web-content entry tags (capped).
 */
export function buildPublishTopics(
  tags: readonly string[] | undefined | null,
  maxTopics = 16,
): string[] {
  if (!tags?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const topic = publishTopicFor(tag);
    if (!topic || seen.has(topic)) continue;
    seen.add(topic);
    out.push(topic);
    if (out.length >= maxTopics) break;
  }
  return out;
}

/**
 * Aggregate unique publish topics from a web-content manifest (top N tags by first-seen order).
 */
export function buildPublishTopicsFromManifest(
  entries: readonly { tags?: readonly string[] | null }[],
  maxTopics = 16,
): string[] {
  const all: string[] = [];
  for (const entry of entries) {
    if (entry.tags?.length) all.push(...entry.tags);
  }
  return buildPublishTopics(all, maxTopics);
}

/**
 * Phase 45 — DHT topic for nodes that serve web content.
 * Advertised when `web/web-content.json` has at least one entry.
 * Searchers look up `capability:envoymesh.web-content` via provide/find.
 */
export const WEB_CONTENT_DHT_TOPIC = "capability:envoymesh.web-content";

/** Append the web-content DHT topic if not already present. */
export function withWebContentDiscoveryTopic(topics: readonly string[]): string[] {
  if (topics.includes(WEB_CONTENT_DHT_TOPIC)) return [...topics];
  return [...topics, WEB_CONTENT_DHT_TOPIC];
}

/**
 * Phase 63C — DHT / relay rendezvous for nodes with ≥1 active/reserved public listing.
 * Searchers look up `market:shop` then fan out `market.search`.
 */
export const MARKET_SHOP_DHT_TOPIC = "market:shop";

/** Append the market shop DHT topic if not already present. */
export function withMarketShopDiscoveryTopic(topics: readonly string[]): string[] {
  if (topics.includes(MARKET_SHOP_DHT_TOPIC)) return [...topics];
  return [...topics, MARKET_SHOP_DHT_TOPIC];
}

/** Append publish:<slug> topics (deduped). */
export function withPublishDiscoveryTopics(
  topics: readonly string[],
  publishTopics: readonly string[],
): string[] {
  const out = [...topics];
  const seen = new Set(topics);
  for (const t of publishTopics) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
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

  // Early-exit when the DHT routing table is empty: every provideCapabilityTopic
  // would time out independently (~30s × N topics) for the same root cause
  // (no peers to PUT to). The relay.checkin mirror (merged by the caller)
  // carries these topics cross-NAT regardless, so skipping the DHT provide
  // loses nothing. See docs/connectivity-internals-and-design.md Solution B1.
  const routingTableSize = mesh.getRoutingTableSize();
  if (routingTableSize === 0) {
    console.log(
      `[node-service] capability discovery: DHT routing table empty — skipping DHT provide for ${topics.length} topic(s) (relay.checkin mirror carries them) source=${options.source}`,
    );
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        direction: "outbound",
        protocol: "discovery.capability.provide.skipped-empty-routing-table",
        outcome: "record",
        summary: `skipped DHT provide for ${topics.length} topic(s) — routing table empty (relay.checkin mirror carries them) source=${options.source}`,
      }),
    );
    return;
  }

  if (typeof mesh.isDialQueueCongested === "function" && mesh.isDialQueueCongested()) {
    const dq = mesh.getConnectionStats?.()?.dialQueueLength ?? "?";
    console.log(
      `[node-service] capability discovery: dialQueue congested (${dq}) — skipping DHT provide for ${topics.length} topic(s) source=${options.source}`,
    );
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        direction: "outbound",
        protocol: "discovery.capability.provide.skipped-dial-queue",
        outcome: "record",
        summary: `skipped DHT provide for ${topics.length} topic(s) — dialQueue congested source=${options.source}`,
      }),
    );
    return;
  }

  // Discovery (findProviders) runs only when explicitly requested via
  // `options.runFind: true` (on-demand search / agent / bond flow). Periodic
  // and startup cycles advertise only — never free-running findProviders.
  // See docs/connectivity-internals-and-design.md Solution B2.
  const runFind =
    options.runFind === true &&
    shouldRunCapabilityTopicFind(profile);
  const queryTimeoutMs = options.queryTimeoutMs ?? CAPABILITY_DISCOVERY_QUERY_TIMEOUT_MS;
  const limit = options.limit ?? CAPABILITY_DISCOVERY_MAX_PROVIDERS;
  const source = options.source;

  // Advertise all topics concurrently (not sequentially) to avoid blocking
  // startup for N_topics × 10s. Each provide has its own internal timeout.
  // `provideCapabilityTopic` no longer throws on timeout — it returns
  // `{ timedOut: true }` so we can audit the distinction between "the put
  // landed" and "the put stalled waiting for DHT peers".
  await Promise.allSettled(
    topics.map(async (topic) => {
      try {
        const result = await mesh.provideCapabilityTopic(topic);
        await taskStore.appendAuditEvent(
          createAuditEvent({
            type: "p2p.trace",
            direction: "outbound",
            protocol: result.timedOut
              ? "discovery.capability.provide.timeout"
              : "discovery.capability.provide.ok",
            outcome: "record",
            summary: result.timedOut
              ? `capability provide timed out topic=${topic} source=${source} (DHT may have no reachable peers)`
              : `capability provide ok topic=${topic} source=${source}`,
          }),
        );
        if (result.timedOut) {
          // Skip find if provide didn't land — we'd just be querying an
          // empty DHT and the result would be misleading.
          return;
        }
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
