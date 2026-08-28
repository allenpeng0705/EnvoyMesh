/**
 * Phase 46E — signed remote relay roster + N→K active-set selection.
 *
 * Ops publishes a signed JSON fleet list (often 10+ relays). Each home
 * verifies the signature and selects ≤ maxActiveTargets (~4) usable hops.
 */
import { z } from "zod";
import { verifyCanonicalPayload } from "@envoymesh/identity";
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDRS,
  DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT,
  DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR,
  peerIdFromBootstrapMultiaddr,
} from "./default-bootstrap.js";

/** Default HTTPS CDN URL (optional override). Prefer fetching from any fleet relay. */
export const DEFAULT_ENVOY_RELAY_ROSTER_URL =
  "https://gpt4people.online/EnvoyMesh/relay-roster.json" as const;

/** Path on every relay HTTP server that serves the shared fleet roster. */
export const RELAY_ROSTER_HTTP_PATH = "/relay-roster.json" as const;

/**
 * Build `http://<host>:<httpPort>/relay-roster.json` from a dialable multiaddr.
 * Supports `/ip4/`, `/ip6/`, `/dns4/`, `/dns6/`. Returns null if host cannot be derived.
 */
export function relayRosterHttpUrlFromMultiaddr(
  multiaddr: string,
  httpPort: number = DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT,
): string | null {
  const t = multiaddr.trim();
  if (!t) return null;
  const dns = t.match(/\/dns[46]\/([^/]+)/i);
  const ip4 = t.match(/\/ip4\/([^/]+)/);
  const ip6 = t.match(/\/ip6\/([^/]+)/);
  const host = dns?.[1] ?? ip4?.[1] ?? (ip6?.[1] ? `[${ip6[1]}]` : null);
  if (!host) return null;
  // Skip unusable bind addresses for WAN poll.
  if (host === "0.0.0.0" || host === "127.0.0.1" || host === "[::]" || host === "[::1]") {
    return null;
  }
  return `http://${host}:${httpPort}${RELAY_ROSTER_HTTP_PATH}`;
}

/** Default poll URLs: CN + US community relays' HTTP roster endpoints. */
export function defaultCommunityRelayRosterHttpUrls(
  httpPort: number = DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT,
): string[] {
  const out: string[] = [];
  for (const addr of DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDRS) {
    const url = relayRosterHttpUrlFromMultiaddr(addr, httpPort);
    if (url) out.push(url);
  }
  return out;
}

/**
 * Collect roster HTTP URLs from any known relay multiaddrs (community + configured + roster entries).
 */
export function collectRelayRosterHttpUrls(input: {
  multiaddrs?: readonly string[];
  explicitUrl?: string | null;
  includeCommunityDefaults?: boolean;
  httpPort?: number;
}): string[] {
  const port = input.httpPort ?? DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT;
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (url: string | null | undefined): void => {
    const u = url?.trim();
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };
  push(input.explicitUrl ?? null);
  if (input.includeCommunityDefaults !== false) {
    for (const u of defaultCommunityRelayRosterHttpUrls(port)) push(u);
  }
  for (const addr of input.multiaddrs ?? []) {
    push(relayRosterHttpUrlFromMultiaddr(addr, port));
  }
  return out;
}

export const RelayRosterEntrySchema = z.object({
  id: z.string().min(1).max(64),
  peerId: z.string().min(1).max(128),
  multiaddrs: z.array(z.string().min(1).max(512)).min(1).max(8),
  region: z.string().min(1).max(64).optional(),
  role: z.enum(["hub", "regional", "spare"]).default("regional"),
  priority: z.number().int().min(0).max(1000).default(50),
  enabled: z.boolean().default(true),
});

export const UnsignedRelayRosterDocumentSchema = z.object({
  v: z.literal(1),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  fleetId: z.string().min(1).max(128),
  maxActiveTargets: z.number().int().min(2).max(6).default(4),
  relays: z.array(RelayRosterEntrySchema).min(1).max(64),
});

/** Signature optional: Path C serves the same file from any fleet relay (often unsigned seed). */
export const RelayRosterDocumentSchema = UnsignedRelayRosterDocumentSchema.extend({
  signature: z.string().min(1).optional(),
});

export type RelayRosterEntry = z.infer<typeof RelayRosterEntrySchema>;
export type UnsignedRelayRosterDocument = z.infer<typeof UnsignedRelayRosterDocumentSchema>;
export type RelayRosterDocument = z.infer<typeof RelayRosterDocumentSchema>;

export function relayRosterForSigning(doc: RelayRosterDocument): UnsignedRelayRosterDocument {
  const { signature: _signature, ...unsigned } = doc;
  return unsigned;
}

export function parseRelayRosterDocument(input: unknown): RelayRosterDocument {
  return RelayRosterDocumentSchema.parse(input);
}

export function parseUnsignedRelayRosterDocument(input: unknown): UnsignedRelayRosterDocument {
  return UnsignedRelayRosterDocumentSchema.parse(input);
}

/**
 * Normalize signed-or-unsigned JSON into a roster document.
 * Accepts a bare unsigned body (seed / relay file without signature).
 */
export function coerceRelayRosterDocument(input: unknown): RelayRosterDocument {
  try {
    return parseRelayRosterDocument(input);
  } catch {
    const unsigned = parseUnsignedRelayRosterDocument(input);
    return unsigned;
  }
}

/** Verify Ed25519 signature against any configured trust public key (PEM). */
export function verifyRelayRosterDocument(
  doc: RelayRosterDocument,
  trustPublicKeyPems: readonly string[],
): boolean {
  if (!doc.signature || trustPublicKeyPems.length === 0) return false;
  const unsigned = relayRosterForSigning(doc);
  for (const pem of trustPublicKeyPems) {
    const key = pem.trim();
    if (!key) continue;
    try {
      if (verifyCanonicalPayload(unsigned, doc.signature, key)) return true;
    } catch {
      // try next key
    }
  }
  return false;
}

/**
 * Accept a roster fetched from a known relay HTTP host, or a signed doc
 * when trust keys are configured. Rejects CDN/unsigned remote unless
 * `fromKnownRelayHost` is true.
 */
export function acceptRelayRosterDocument(input: {
  doc: RelayRosterDocument;
  trustPublicKeyPems: readonly string[];
  fromKnownRelayHost: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (isRelayRosterExpired(input.doc)) {
    return { ok: false, reason: "expired" };
  }
  const keys = input.trustPublicKeyPems.map((k) => k.trim()).filter(Boolean);
  if (input.doc.signature && keys.length > 0) {
    if (!verifyRelayRosterDocument(input.doc, keys)) {
      return { ok: false, reason: "bad-signature" };
    }
    return { ok: true };
  }
  if (input.fromKnownRelayHost) {
    return { ok: true };
  }
  if (input.doc.signature && keys.length === 0) {
    return { ok: false, reason: "no-trust-keys" };
  }
  return { ok: false, reason: "unsigned-untrusted-host" };
}

/** True when `candidate` should replace `current` (strictly newer issuedAt). */
export function isRelayRosterNewer(
  candidate: Pick<UnsignedRelayRosterDocument, "issuedAt">,
  current: Pick<UnsignedRelayRosterDocument, "issuedAt"> | null | undefined,
): boolean {
  const next = Date.parse(candidate.issuedAt);
  if (!Number.isFinite(next)) return false;
  if (!current) return true;
  const prev = Date.parse(current.issuedAt);
  if (!Number.isFinite(prev)) return true;
  return next > prev;
}

/**
 * Upsert a relay entry by peerId, bump issuedAt, drop signature (body changed).
 * Used when a new relay merges itself into the fleet roster before publish.
 */
export function upsertRelayRosterEntry(
  doc: RelayRosterDocument,
  entry: RelayRosterEntry,
  nowIso = new Date().toISOString(),
): RelayRosterDocument {
  const peerId = entry.peerId.trim();
  const relays = doc.relays.filter((r) => r.peerId !== peerId);
  relays.push(RelayRosterEntrySchema.parse(entry));
  const expiresAt =
    Date.parse(doc.expiresAt) > Date.now()
      ? doc.expiresAt
      : new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString();
  return {
    v: 1,
    issuedAt: nowIso,
    expiresAt,
    fleetId: doc.fleetId,
    maxActiveTargets: doc.maxActiveTargets ?? 4,
    relays,
    // Signature invalidated by content change — Path C trusts join-token PUT / known hosts.
  };
}

export function isRelayRosterExpired(doc: Pick<UnsignedRelayRosterDocument, "expiresAt">, nowMs = Date.now()): boolean {
  const exp = Date.parse(doc.expiresAt);
  return !Number.isFinite(exp) || exp <= nowMs;
}

function primaryMultiaddr(entry: RelayRosterEntry): string | null {
  for (const addr of entry.multiaddrs) {
    const t = addr.trim();
    if (!t || t.includes("/p2p-circuit/")) continue;
    if (t.includes("/p2p/")) {
      const pid = peerIdFromBootstrapMultiaddr(t);
      if (pid === entry.peerId) return t;
      continue;
    }
    return `${t.replace(/\/$/, "")}/p2p/${entry.peerId}`;
  }
  return null;
}

export interface SelectActiveRelayTargetsInput {
  roster?: UnsignedRelayRosterDocument | null;
  /** Operator / Settings pins — always preferred. */
  pinnedAddrs?: readonly string[];
  /** Preset-vouched hint addrs (Phase 46E.3). */
  vouchedAddrs?: readonly string[];
  /** Prefer relays tagged with this region when set. */
  preferredRegion?: string | null;
  maxActive?: number;
}

/**
 * Pick ≤ K dialable multiaddrs from the fleet roster.
 * Order: pins → hubs → region match → priority → vouched spares.
 */
export function selectActiveRelayTargets(input: SelectActiveRelayTargetsInput): string[] {
  const maxActive = Math.min(6, Math.max(2, input.maxActive ?? input.roster?.maxActiveTargets ?? 4));
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (addr: string | null | undefined): void => {
    if (!addr || out.length >= maxActive) return;
    const t = addr.trim();
    if (!t || !t.includes("/p2p/") || t.includes("/p2p-circuit/") || seen.has(t)) return;
    if (t.includes("bootstrap.libp2p.io")) return;
    seen.add(t);
    out.push(t);
  };

  for (const a of input.pinnedAddrs ?? []) push(a);

  const enabled = (input.roster?.relays ?? []).filter((r) => r.enabled !== false);
  const byPriority = [...enabled].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const r of byPriority) {
    if (r.role !== "hub") continue;
    push(primaryMultiaddr(r));
  }

  const region = input.preferredRegion?.trim().toLowerCase();
  if (region) {
    for (const r of byPriority) {
      if ((r.region ?? "").toLowerCase() !== region) continue;
      push(primaryMultiaddr(r));
    }
  }

  for (const r of byPriority) {
    push(primaryMultiaddr(r));
  }

  for (const a of input.vouchedAddrs ?? []) push(a);

  // Offline / empty roster: keep community hubs as last resort when nothing else selected.
  if (out.length === 0) {
    push(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
    push(DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR);
  }

  return out.slice(0, maxActive);
}
