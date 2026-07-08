import type { ChatDiagnostics, PeerConnectionInfo } from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
import { filterRelayControlTargets, isPublicLibp2pBootstrapMultiaddr } from "@envoymesh/network";
import type { LocalPeerDirectoryStore } from "@envoymesh/local-store";
import { buildOutboundDialHints } from "./outbound-dial-hints.js";
import type { DiscoverySeedStore } from "./discovery-seed-store.js";
import type { NodeConfigStore, PersistedNodeConfig } from "./node-config-store.js";
import { getRelayDiagnosticsSnapshot } from "./relay-diagnostics-state.js";

const SAMPLE_HINT_LIMIT = 5;

export interface BuildChatDiagnosticsInput {
  mesh: EnvoyMesh | undefined;
  nodeOnline: boolean;
  localPeerId: string;
  profileDir: string;
  config: PersistedNodeConfig | undefined;
  relayEnabled: boolean;
  relayClientSchedulerActive: boolean;
  relayBootstrapPeers: string[];
  configStore: NodeConfigStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  discoverySeedStore: DiscoverySeedStore | undefined;
  peerOwnerId?: string;
}

function truncateAddr(addr: string, max = 96): string {
  const t = addr.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function buildHints(input: {
  nodeOnline: boolean;
  relayEnabled: boolean;
  relayControlTargets: string[];
  relayClientSchedulerActive: boolean;
  relaySnapshot: ReturnType<typeof getRelayDiagnosticsSnapshot>;
  contact?: ChatDiagnostics["contact"];
}): string[] {
  const hints: string[] = [];
  if (!input.nodeOnline) {
    hints.push("Node is offline — start the node before sending chat.");
  }
  if (!input.relayEnabled) {
    hints.push("Relay transport is disabled in node config; cross-NAT chat needs relay enabled.");
  }
  if (input.relayControlTargets.length === 0) {
    hints.push("No Envoy relay control targets — enable the cn-relay bootstrap preset or add a relay bootstrap addr.");
  }
  if (!input.relaySnapshot?.checkinResults.length) {
    hints.push("No relay.checkin recorded yet — wait 30–60s after start for the relay client cycle.");
  } else if (input.relaySnapshot.checkinResults.every((r) => !r.ok)) {
    hints.push("relay.checkin is failing for all targets — check firewall and that the community relay is reachable.");
  }
  if (!input.relaySnapshot?.lookup) {
    hints.push("No relay.lookup recorded yet — circuit dial hints may be missing for cross-NAT contacts.");
  } else if (!input.relaySnapshot.lookup.ok) {
    hints.push(
      input.relaySnapshot.lookup.error
        ? `relay.lookup failed: ${input.relaySnapshot.lookup.error}`
        : "relay.lookup failed — chat may not find /p2p-circuit paths.",
    );
  } else if (input.relaySnapshot.lookup.peerCount === 0) {
    hints.push("relay.lookup returned 0 peers — contacts may be offline or not checked in to the same relay.");
  }
  if (!input.relayClientSchedulerActive && input.relayEnabled) {
    hints.push("Relay client scheduler is not active on this path (CLI/Tauri may still run relay cycles in the node process).");
  }
  if (input.contact && !input.contact.peerFound) {
    hints.push("Contact not found in peer directory — complete bonding or have them send a message first.");
  }
  if (input.contact?.badPublicBootstrapHints) {
    hints.push(
      "Dial hints include public libp2p bootstrap addresses — cross-NAT chat will fail until EnvoyMesh is updated.",
    );
  }
  if (input.contact?.peerFound && input.contact.dialHintCount === 0) {
    hints.push("No dial hints for this contact — relay.lookup may not have stored circuit paths yet.");
  }
  if (input.contact?.connection && !input.contact.connection.connected) {
    hints.push("Not currently connected to this contact; send will attempt fresh dials via dial hints.");
  }
  if (hints.length === 0) {
    hints.push("Relay path looks configured; if chat still fails, check both nodes share the same relay and recent relay.lookup logs.");
  }
  return hints;
}

export async function buildChatDiagnostics(input: BuildChatDiagnosticsInput): Promise<ChatDiagnostics> {
  const relaySnapshot = getRelayDiagnosticsSnapshot();
  const relayControlTargets = filterRelayControlTargets([
    ...input.relayBootstrapPeers,
    ...(input.config?.bootstrapPeers ?? []),
  ]);

  let discoverySeedCount = 0;
  let circuitSeedCount = 0;
  if (input.discoverySeedStore) {
    const seeds = await input.discoverySeedStore.listSeedAddrs();
    discoverySeedCount = seeds.length;
    circuitSeedCount = seeds.filter((s) => s.includes("/p2p-circuit/")).length;
  }

  const connStats = input.mesh?.getConnectionStats() ?? {
    totalPeerIds: 0,
    totalConnections: 0,
    circuitPeerIds: [],
    circuitConnections: 0,
  };

  let contact: ChatDiagnostics["contact"];
  const peerOwnerId = input.peerOwnerId?.trim();
  if (peerOwnerId) {
    let peerRecord = await input.peerDirectoryStore.getPeerByOwnerId(peerOwnerId);
    if (!peerRecord) {
      const records = await input.peerDirectoryStore.listPeerRecords();
      peerRecord =
        records.find((r) => r.ownerId === peerOwnerId) ??
        records.find((r) => r.peerId === peerOwnerId);
    }

    if (peerRecord?.peerId && !peerRecord.peerId.startsWith("envoy_")) {
      const config = (await input.configStore.load()) ?? input.config;
      const dialHints = await buildOutboundDialHints({
        recipientPeerId: peerRecord.peerId,
        peerListenAddrs: peerRecord.listenAddrs,
        discoverySeedStore: input.discoverySeedStore,
        config,
        profileDir: input.profileDir,
        localListenAddrs: input.mesh?.multiaddrs,
      });
      // `buildOutboundDialHints` strips /p2p-circuit/ hints when a direct TCP
      // path exists; merge them back so the diagnostics panel can show whether
      // a relay fallback is available.
      const seedCircuitHints = input.discoverySeedStore
        ? (await input.discoverySeedStore.listSeedAddrs())
            .filter((a) => a.includes("/p2p-circuit/") && a.includes(peerRecord.peerId))
        : [];
      const merged = Array.from(new Set([...dialHints, ...seedCircuitHints]));
      const badPublicBootstrapHints = merged.filter((h) => isPublicLibp2pBootstrapMultiaddr(h)).length;
      let connection: PeerConnectionInfo | undefined;
      if (input.mesh) {
        connection = input.mesh.getPeerConnectionInfo(peerRecord.peerId);
      }
      contact = {
        peerOwnerId,
        peerFound: true,
        transportPeerId: peerRecord.peerId,
        storedListenAddrs: (peerRecord.listenAddrs ?? []).length,
        dialHintCount: merged.length,
        sampleDialHints: merged.slice(0, SAMPLE_HINT_LIMIT).map((h) => truncateAddr(h)),
        badPublicBootstrapHints,
        connection,
      };
    } else {
      contact = {
        peerOwnerId,
        peerFound: false,
        storedListenAddrs: 0,
        dialHintCount: 0,
        sampleDialHints: [],
        badPublicBootstrapHints: 0,
      };
    }
  }

  const diagnostics: ChatDiagnostics = {
    checkedAt: new Date().toISOString(),
    nodeOnline: input.nodeOnline,
    localPeerId: input.localPeerId,
    relayEnabled: input.relayEnabled,
    relayClientSchedulerActive: input.relayClientSchedulerActive,
    relayControlTargets,
    lastRelayCheckin: relaySnapshot
      ? {
          at: relaySnapshot.at,
          source: relaySnapshot.source,
          results: relaySnapshot.checkinResults,
        }
      : undefined,
    lastRelayLookup: relaySnapshot?.lookup
      ? {
          at: relaySnapshot.at,
          source: relaySnapshot.source,
          peerCount: relaySnapshot.lookup.peerCount,
          circuitAddrsStored: relaySnapshot.lookup.circuitAddrsStored,
          ok: relaySnapshot.lookup.ok,
          error: relaySnapshot.lookup.error,
        }
      : undefined,
    connectionStats: {
      totalPeers: connStats.totalPeerIds,
      totalConnections: connStats.totalConnections,
      circuitPeers: connStats.circuitPeerIds.length,
      circuitConnections: connStats.circuitConnections,
    },
    discoverySeedCount,
    circuitSeedCount,
    contact,
    hints: [],
  };

  diagnostics.hints = buildHints({
    nodeOnline: diagnostics.nodeOnline,
    relayEnabled: diagnostics.relayEnabled,
    relayControlTargets: diagnostics.relayControlTargets,
    relayClientSchedulerActive: diagnostics.relayClientSchedulerActive,
    relaySnapshot,
    contact: diagnostics.contact,
  });

  return diagnostics;
}
