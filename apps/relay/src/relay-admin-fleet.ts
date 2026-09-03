/**
 * Operator fleet view for the relay admin portal — this relay + known siblings.
 */
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT,
  DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR,
  peerIdFromBootstrapMultiaddr,
  relayRosterHttpUrlFromMultiaddr,
  type RelayRosterDocument,
  type RelayRosterEntry,
} from "@envoymesh/api";
import type { RelayCapacityPublicSnapshot } from "./relay-capacity-profile.js";
import type { StandaloneRelayHealthSnapshot } from "./relay-health.js";
import type { RelayBookEntry } from "./relay-roster.js";

const COMMUNITY_PRESET_RELAYS = [
  {
    presetId: "cn-relay",
    label: "CN community",
    region: "cn",
    multiaddr: DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  },
  {
    presetId: "us-relay",
    label: "US community",
    region: "us",
    multiaddr: DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR,
  },
] as const;

export type RelayAdminFleetRowSource =
  | "self"
  | "fleet-document"
  | "relay-book"
  | "community-preset";

export interface RelayAdminFleetRow {
  key: string;
  label: string;
  peerId: string;
  region?: string;
  role?: string;
  multiaddrs: string[];
  httpUrl?: string;
  source: RelayAdminFleetRowSource;
  isSelf: boolean;
  connected: boolean;
  bookState?: string;
  enabled?: boolean;
  priority?: number;
}

export interface RelayAdminFleetSnapshot {
  selfPeerId: string;
  checkedAt: string;
  fleetDocument?: {
    fleetId: string;
    issuedAt: string;
    expiresAt: string;
    relayCount: number;
  };
  self: {
    peerId: string;
    advertiseAddrs: string[];
    listenAddrs: string[];
    publicMode: boolean;
    health: StandaloneRelayHealthSnapshot;
    relayCapacity?: RelayCapacityPublicSnapshot;
  };
  relays: RelayAdminFleetRow[];
}

function primaryMultiaddr(addrs: readonly string[], peerId: string): string | null {
  for (const addr of addrs) {
    const t = addr.trim();
    if (!t || t.includes("/p2p-circuit/")) continue;
    if (t.includes("/p2p/")) {
      if (peerIdFromBootstrapMultiaddr(t) === peerId) return t;
      continue;
    }
    return `${t.replace(/\/$/, "")}/p2p/${peerId}`;
  }
  return addrs[0]?.trim() || null;
}

function httpUrlFor(addrs: readonly string[], httpPort: number): string | undefined {
  for (const addr of addrs) {
    const url = relayRosterHttpUrlFromMultiaddr(addr, httpPort);
    if (url) return url;
  }
  return undefined;
}

function upsertRow(
  map: Map<string, RelayAdminFleetRow>,
  row: RelayAdminFleetRow,
): void {
  const existing = map.get(row.peerId);
  if (!existing) {
    map.set(row.peerId, row);
    return;
  }
  map.set(row.peerId, {
    ...existing,
    ...row,
    label: row.label || existing.label,
    region: row.region ?? existing.region,
    role: row.role ?? existing.role,
    multiaddrs: row.multiaddrs.length ? row.multiaddrs : existing.multiaddrs,
    httpUrl: row.httpUrl ?? existing.httpUrl,
    bookState: row.bookState ?? existing.bookState,
    enabled: row.enabled ?? existing.enabled,
    priority: row.priority ?? existing.priority,
    source: row.isSelf ? "self" : row.source === "fleet-document" ? row.source : existing.source,
    isSelf: existing.isSelf || row.isSelf,
    connected: existing.connected || row.connected,
  });
}

function rowFromFleetEntry(
  entry: RelayRosterEntry,
  connected: Set<string>,
  selfPeerId: string,
  httpPort: number,
): RelayAdminFleetRow {
  const primary = primaryMultiaddr(entry.multiaddrs, entry.peerId) ?? entry.multiaddrs[0] ?? "";
  return {
    key: entry.id || entry.peerId,
    label: entry.id,
    peerId: entry.peerId,
    region: entry.region,
    role: entry.role,
    multiaddrs: entry.multiaddrs,
    httpUrl: httpUrlFor(entry.multiaddrs, httpPort),
    source: "fleet-document",
    isSelf: entry.peerId === selfPeerId,
    connected: connected.has(entry.peerId),
    enabled: entry.enabled,
    priority: entry.priority,
  };
}

function rowFromBookEntry(
  entry: RelayBookEntry,
  connected: Set<string>,
  selfPeerId: string,
  httpPort: number,
): RelayAdminFleetRow {
  return {
    key: entry.relayId,
    label: entry.relayId.slice(0, 12),
    peerId: entry.relayId,
    region: entry.region,
    role: entry.relation,
    multiaddrs: entry.addrs,
    httpUrl: httpUrlFor(entry.addrs, httpPort),
    source: "relay-book",
    isSelf: entry.relayId === selfPeerId,
    connected: connected.has(entry.relayId),
    bookState: entry.state,
  };
}

/** Merge community presets, fleet document, and runtime relay book into one table. */
export function buildRelayAdminFleetSnapshot(input: {
  selfPeerId: string;
  advertiseAddrs: string[];
  listenAddrs: string[];
  publicMode: boolean;
  httpPort?: number;
  connectedPeerIds: readonly string[];
  fleetDocument?: RelayRosterDocument | null;
  relayBook?: readonly RelayBookEntry[];
  rosterRegion?: string;
  health: StandaloneRelayHealthSnapshot;
  relayCapacity?: RelayCapacityPublicSnapshot;
}): RelayAdminFleetSnapshot {
  const httpPort = input.httpPort ?? DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT;
  const connected = new Set(input.connectedPeerIds);
  const byPeer = new Map<string, RelayAdminFleetRow>();

  for (const preset of COMMUNITY_PRESET_RELAYS) {
    const peerId = peerIdFromBootstrapMultiaddr(preset.multiaddr);
    if (!peerId) continue;
    upsertRow(byPeer, {
      key: preset.presetId,
      label: preset.label,
      peerId,
      region: preset.region,
      role: "hub",
      multiaddrs: [preset.multiaddr],
      httpUrl: relayRosterHttpUrlFromMultiaddr(preset.multiaddr, httpPort) ?? undefined,
      source: "community-preset",
      isSelf: peerId === input.selfPeerId,
      connected: connected.has(peerId),
    });
  }

  for (const entry of input.fleetDocument?.relays ?? []) {
    upsertRow(byPeer, rowFromFleetEntry(entry, connected, input.selfPeerId, httpPort));
  }

  for (const entry of input.relayBook ?? []) {
    upsertRow(byPeer, rowFromBookEntry(entry, connected, input.selfPeerId, httpPort));
  }

  upsertRow(byPeer, {
    key: "self",
    label: "This relay",
    peerId: input.selfPeerId,
    region: input.rosterRegion,
    role: "self",
    multiaddrs: [...input.advertiseAddrs, ...input.listenAddrs].filter(Boolean),
    httpUrl: httpUrlFor(input.advertiseAddrs.length ? input.advertiseAddrs : input.listenAddrs, httpPort),
    source: "self",
    isSelf: true,
    connected: true,
  });

  const relays = [...byPeer.values()].sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    if (a.connected !== b.connected) return a.connected ? -1 : 1;
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    if (pa !== pb) return pb - pa;
    return a.label.localeCompare(b.label);
  });

  const doc = input.fleetDocument;
  return {
    selfPeerId: input.selfPeerId,
    checkedAt: new Date().toISOString(),
    fleetDocument: doc
      ? {
          fleetId: doc.fleetId,
          issuedAt: doc.issuedAt,
          expiresAt: doc.expiresAt,
          relayCount: doc.relays.length,
        }
      : undefined,
    self: {
      peerId: input.selfPeerId,
      advertiseAddrs: input.advertiseAddrs,
      listenAddrs: input.listenAddrs,
      publicMode: input.publicMode,
      health: input.health,
      relayCapacity: input.relayCapacity,
    },
    relays,
  };
}
