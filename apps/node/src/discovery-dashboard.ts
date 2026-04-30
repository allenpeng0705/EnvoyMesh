#!/usr/bin/env node
import "./dom-event-polyfill.js";
import { loadOrCreateNodeProfile } from "@envoymesh/local-store";
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import { DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME, EnvoyMesh, type DiscoveredMeshPeer } from "@envoymesh/network";
import {
  createRelayCheckinPayload,
  createRelayLookupPayload,
  createUnsignedEnvelope,
  parseRelayLookupResponsePayload,
} from "@envoymesh/protocol";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { parseNodeArgs, printHelp } from "./args.js";
import { createDiscoverySeedStore } from "./discovery-seed-store.js";
import { expandCircuitDialCandidates } from "./discovery-inbound.js";

const CLEAR = "\x1b[2J\x1b[H";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const RELAY_CONTROL_TTL_MS = 90_000;
const RELAY_LOOKUP_INTERVAL_MS = 10_000;

function color(badge: "ok" | "warn" | "start" | "err"): string {
  switch (badge) {
    case "ok": return GREEN;
    case "warn": return YELLOW;
    case "start": return CYAN;
    case "err": return RED;
  }
}

interface PeerInfo {
  peerId: string;
  addrs: string[];
  discoveredAt: number;
  relayed: boolean;
}

function parseArgs(argv: string[]): {
  profileDir: string;
  discoveryProfile: "lan-fast" | "wan-default";
  bootstrapPeers: string[];
  enableMdns: boolean;
  enableDht: boolean;
  enableRelay: boolean;
  enableAutoNat: boolean;
  enableDcutr: boolean;
  p2pDebug: boolean;
  autoRelayPeersQuery: boolean;
} {
  const nodeArgs = parseNodeArgs(argv);

  return {
    profileDir: nodeArgs.profileDir,
    discoveryProfile: nodeArgs.discoveryProfile,
    bootstrapPeers: nodeArgs.bootstrapPeers,
    enableMdns: nodeArgs.enableMdns,
    enableDht: nodeArgs.enableDht,
    enableRelay: nodeArgs.enableRelay,
    enableAutoNat: nodeArgs.enableAutoNat,
    enableDcutr: nodeArgs.enableDcutr,
    p2pDebug: nodeArgs.p2pDebug,
    autoRelayPeersQuery: nodeArgs.autoRelayPeersQuery,
  };
}

async function main(argv: string[]): Promise<void> {
  const helpArg = argv.includes("--help") || argv.includes("-h");
  if (helpArg) {
    console.log(`EnvoyMesh Discovery Dashboard

Usage:
  npm run discovery:dashboard -- [options]

Options:
  --profile <dir>              Profile directory. Default: ./data/default
  --discovery-profile <p>     Discovery mode: lan-fast|wan-default. Default: lan-fast
  --bootstrap <multiaddr>      Add bootstrap peer. Repeatable.
  --bootstrap-preset <preset>  Use bootstrap preset (public-libp2p, public-libp2p-am6, public-libp2p-am7)
  --no-mdns                    Disable mDNS discovery
  --auto-relay-peers-query     Periodically send relay.checkin and relay.lookup to bootstrap relays
  --p2p-debug                  Enable P2P debug tracing

Examples:
  # LAN mDNS discovery (same network)
  npm run discovery:dashboard -- --profile ~/envoymesh/mac_node

  # WAN discovery with bootstrap
  npm run discovery:dashboard -- --profile ~/envoymesh/mac_wan --discovery-profile wan-default --bootstrap-preset public-libp2p

  # Windows
  npm run discovery:dashboard -- --profile "%USERPROFILE%\\envoymesh\\win_node"

  # Cross-network with explicit bootstrap
  npm run discovery:dashboard -- --discovery-profile wan-default --bootstrap "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN"
`);
    return;
  }

  const args = parseArgs(argv);
  const profile = await loadOrCreateNodeProfile(args.profileDir);
  const discoverySeedStore = createDiscoverySeedStore(args.profileDir);

  const peers = new Map<string, PeerInfo>();
  let relayCount = 0;
  let relayCheckinOk = 0;
  let relayCheckinFail = 0;
  let relayLookupOk = 0;
  let relayLookupFail = 0;
  let relayLookupResponses = 0;
  let relayCandidates = 0;
  let relayDialOk = 0;
  let relayDialFailed = 0;
  let bootstrapDialOk = 0;
  let bootstrapDialFailed = 0;
  let relayDiscoveryCycleRunning = false;
  let lastEventAt = Date.now();
  let startedAt = Date.now();

  const mesh = new EnvoyMesh({
    listen: ["/ip4/0.0.0.0/tcp/0"],
    enableMdns: args.enableMdns,
    enableDht: args.enableDht,
    dhtClientMode: args.discoveryProfile === "wan-default" ? true : undefined,
    bootstrapPeers: args.bootstrapPeers,
    enableRelay: args.enableRelay || args.discoveryProfile === "wan-default",
    enableAutoNat: args.enableAutoNat || args.discoveryProfile === "wan-default",
    enableDcutr: args.enableDcutr || args.discoveryProfile === "wan-default",
    enableP2pDebug: args.p2pDebug,
    libp2pPrivateKeyPath: join(args.profileDir, DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME),
    onP2pDebug: (event) => {
      // Suppress debug output to keep dashboard clean
    },
  });

  mesh.onPeerDiscovered((peer: DiscoveredMeshPeer) => {
    const isRelayed = peer.multiaddrs.some((a) => a.includes("/p2p-circuit"));
    peers.set(peer.peerId, {
      peerId: peer.peerId,
      addrs: peer.multiaddrs.map((a) => a.toString()),
      discoveredAt: Date.now(),
      relayed: isRelayed,
    });
    if (isRelayed) relayCount++;
    lastEventAt = Date.now();
  });

  // Handle relay.lookup.response from EnvoyMesh relay nodes and dial returned /p2p-circuit candidates.
  mesh.onMessage(async ({ envelope }) => {
    if (envelope.intent === "relay.lookup.response") {
      let payload;
      try {
        payload = parseRelayLookupResponsePayload(envelope.payload);
      } catch (error) {
        console.log(`[auto-relay-query] relay.lookup.response parse failed error=${error}`);
        return;
      }
      relayLookupResponses++;
      relayCandidates += payload.peers.length;
      console.log(
        `[auto-relay-query] received relay.lookup.response query=${payload.queryId} peers=${payload.peers.length} hints=${payload.relayHints.length}`,
      );
      for (const relayPeer of payload.peers) {
        const alreadyKnown = peers.has(relayPeer.peerId);
        peers.set(relayPeer.peerId, {
          peerId: relayPeer.peerId,
          addrs: relayPeer.multiaddrs,
          discoveredAt: Date.now(),
          relayed: true,
        });
        if (!alreadyKnown) relayCount++;
        lastEventAt = Date.now();
      }

      const relayedAddrs = dedupeAddrs(payload.peers.flatMap((peer) => peer.multiaddrs));
      if (relayedAddrs.length > 0) {
        await discoverySeedStore.upsertMany(relayedAddrs, "relay-peers");
      }
      for (const addr of relayedAddrs) {
        const candidates = expandCircuitDialCandidates(addr, args.bootstrapPeers);
        let dialOkForAddr = false;
        for (const cand of candidates) {
          try {
            console.log(`[auto-relay-query] dialing relay.lookup candidate: ${cand}`);
            await mesh.dial(cand);
            relayDialOk++;
            dialOkForAddr = true;
            console.log(`[auto-relay-query] relay.lookup candidate dial ok: ${cand}`);
            break;
          } catch (err) {
            console.log(`[auto-relay-query] relay.lookup candidate dial failed: ${cand} error=${err}`);
          }
        }
        if (!dialOkForAddr) {
          relayDialFailed++;
        }
      }
    }
  });

  await mesh.start();
  startedAt = Date.now();

  const hasDht = args.enableDht;

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    process.stdout.write("\n");
    mesh.stop().then(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    process.stdout.write("\n");
    mesh.stop().then(() => process.exit(0));
  });

  // Initial render
  renderDashboard({
    mesh,
    peers,
    relayCount,
    lastEventAt,
    startedAt,
    selfMultiaddrs: mesh.multiaddrs.map((a) => a.toString()),
    hasDht,
    args,
    relayStats: () => ({
      relayCheckinOk,
      relayCheckinFail,
      relayLookupOk,
      relayLookupFail,
      relayLookupResponses,
      relayCandidates,
      relayDialOk,
      relayDialFailed,
      bootstrapDialOk,
      bootstrapDialFailed,
    }),
  });

  // Auto check in with relay nodes and query for relay-discoverable peers if enabled.
  if (args.autoRelayPeersQuery && args.bootstrapPeers.length > 0) {
    await runRelayDiscoveryCycle();
    setInterval(async () => {
      await runRelayDiscoveryCycle();
    }, RELAY_LOOKUP_INTERVAL_MS);
  }

  // Update every 2 seconds
  const interval = setInterval(() => {
    renderDashboard({
      mesh,
      peers,
      relayCount,
      lastEventAt,
      startedAt,
      selfMultiaddrs: mesh.multiaddrs.map((a) => a.toString()),
      hasDht,
      args,
      relayStats: () => ({
        relayCheckinOk,
        relayCheckinFail,
        relayLookupOk,
        relayLookupFail,
        relayLookupResponses,
        relayCandidates,
        relayDialOk,
        relayDialFailed,
        bootstrapDialOk,
        bootstrapDialFailed,
      }),
    });
  }, 2000);

  // Keep process alive
  await new Promise(() => {});
  async function runRelayDiscoveryCycle(): Promise<void> {
    if (relayDiscoveryCycleRunning) {
      console.log("[auto-relay-query] previous relay discovery cycle still running; skipping this tick");
      return;
    }
    relayDiscoveryCycleRunning = true;
    try {
      const result = await dialBootstrapRelays(mesh, args.bootstrapPeers);
      bootstrapDialOk += result.ok;
      bootstrapDialFailed += result.failed;
      const checkins = await sendRelayCheckin({ mesh, profile, bootstrapPeers: args.bootstrapPeers });
      relayCheckinOk += checkins.ok;
      relayCheckinFail += checkins.failed;
      const lookups = await queryRelayLookup({ mesh, profile, bootstrapPeers: args.bootstrapPeers });
      relayLookupOk += lookups.ok;
      relayLookupFail += lookups.failed;
    } finally {
      relayDiscoveryCycleRunning = false;
    }
  }
}

async function sendRelayCheckin(input: {
  mesh: EnvoyMesh;
  profile: Awaited<ReturnType<typeof loadOrCreateNodeProfile>>;
  bootstrapPeers: string[];
}): Promise<{ ok: number; failed: number }> {
  const { mesh, profile, bootstrapPeers } = input;
  let ok = 0;
  let failed = 0;
  const expiresAt = expiresAtFromNow(RELAY_CONTROL_TTL_MS);
  const capabilities = relayCheckinCapabilities(profile.deviceCertificate.capabilities);
  const payload = createRelayCheckinPayload({
    peerId: mesh.peerId,
    ownerId: profile.owner.ownerId,
    relayReachableAddrs: mesh.multiaddrs,
    capabilities,
    advertisements: [{ capability: "mesh.discovery", visibility: "public", expiresAt }],
    relayHints: bootstrapPeers.map((addr) => ({
      relayId: relayIdFromAddr(addr),
      multiaddrs: [addr],
      expiresAt,
    })),
    expiresAt,
  });
  for (const bootstrapPeer of bootstrapPeers) {
    try {
      console.log(`[auto-relay-query] sending relay.checkin to ${bootstrapPeer}`);
      const signedEnvelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: derivePeerId(profile.device.publicKeyPem),
          senderPublicKey: profile.device.publicKeyPem,
          senderRole: "system",
          recipientPeerId: bootstrapPeer.startsWith("/") ? undefined : bootstrapPeer,
          intent: "relay.checkin",
          payload,
        }),
        profile.device.privateKeyPem,
      );
      await mesh.send(bootstrapPeer, signedEnvelope);
      ok++;
      console.log(`[auto-relay-query] sent relay.checkin to ${bootstrapPeer}`);
    } catch (err) {
      failed++;
      console.log(`[auto-relay-query] relay.checkin ERROR target=${bootstrapPeer} error=${err}`);
    }
  }
  return { ok, failed };
}

function relayCheckinCapabilities(capabilities: readonly string[]): string[] {
  return [...new Set(["mesh.discovery", ...capabilities])];
}

async function queryRelayLookup(input: {
  mesh: EnvoyMesh;
  profile: Awaited<ReturnType<typeof loadOrCreateNodeProfile>>;
  bootstrapPeers: string[];
}): Promise<{ ok: number; failed: number }> {
  const { mesh, profile, bootstrapPeers } = input;
  let ok = 0;
  let failed = 0;
  for (const bootstrapPeer of bootstrapPeers) {
    try {
      const payload = createRelayLookupPayload({
        queryId: `dashboard_relay_lookup_${randomUUID()}`,
        capability: "mesh.discovery",
        maxResults: 32,
        maxHops: 2,
        maxFanout: 2,
        visibilityScope: "public",
        expiresAt: expiresAtFromNow(RELAY_CONTROL_TTL_MS),
      });
      console.log(`[auto-relay-query] sending relay.lookup query=${payload.queryId} to ${bootstrapPeer}`);
      const signedEnvelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: derivePeerId(profile.device.publicKeyPem),
          senderPublicKey: profile.device.publicKeyPem,
          senderRole: "system",
          recipientPeerId: bootstrapPeer.startsWith("/") ? undefined : bootstrapPeer,
          intent: "relay.lookup",
          payload,
        }),
        profile.device.privateKeyPem,
      );
      await mesh.send(bootstrapPeer, signedEnvelope);
      ok++;
      console.log(`[auto-relay-query] sent relay.lookup query=${payload.queryId} to ${bootstrapPeer}`);
    } catch (err) {
      failed++;
      console.log(`[auto-relay-query] relay.lookup ERROR target=${bootstrapPeer} error=${err}`);
    }
  }
  return { ok, failed };
}

async function dialBootstrapRelays(mesh: EnvoyMesh, bootstrapPeers: string[]): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  if (bootstrapPeers.length === 0) {
    return { ok, failed };
  }
  console.log(`[relay-dial] checking bootstrap relay reachability...`);
  for (const bootstrapPeer of bootstrapPeers) {
    try {
      console.log(`[relay-dial] dialing bootstrap relay: ${bootstrapPeer}`);
      await mesh.dial(bootstrapPeer);
      ok++;
      console.log(`[relay-dial] bootstrap relay dial ok`);
    } catch (err) {
      failed++;
      console.error(`[relay-dial] failed target=${bootstrapPeer} error=${err}`);
    }
  }
  return { ok, failed };
}

function dedupeAddrs(addrs: string[]): string[] {
  return [...new Set(addrs.map((addr) => addr.trim()).filter(Boolean))];
}

function renderDashboard(ctx: {
  mesh: EnvoyMesh;
  peers: Map<string, PeerInfo>;
  relayCount: number;
  lastEventAt: number;
  startedAt: number;
  selfMultiaddrs: string[];
  hasDht: boolean;
  args: ReturnType<typeof parseArgs>;
  relayStats: () => {
    relayCheckinOk: number;
    relayCheckinFail: number;
    relayLookupOk: number;
    relayLookupFail: number;
    relayLookupResponses: number;
    relayCandidates: number;
    relayDialOk: number;
    relayDialFailed: number;
    bootstrapDialOk: number;
    bootstrapDialFailed: number;
  };
}): void {
  const peerList = Array.from(ctx.peers.values());
  const relayStats = ctx.relayStats();
  const upSec = Math.floor((Date.now() - ctx.startedAt) / 1000);
  const idleSec = Math.floor((Date.now() - ctx.lastEventAt) / 1000);
  const hasCircuitListenAddr = ctx.selfMultiaddrs.some((addr) => addr.includes("/p2p-circuit"));

  const peerBadge = peerList.length === 0
    ? { text: "0", cls: "start" as const }
    : { text: String(peerList.length), cls: "ok" as const };

  const relayBadge = hasCircuitListenAddr
    ? { text: "YES", cls: "ok" as const }
    : { text: "NO", cls: "warn" as const };

  let relayApiBadge: { text: string; cls: "ok" | "warn" | "start" | "err" };
  if (!ctx.args.autoRelayPeersQuery) {
    relayApiBadge = { text: "OFF", cls: "warn" };
  } else if (relayStats.relayLookupFail > 0 && relayStats.relayLookupOk === 0) {
    relayApiBadge = { text: "LOOKUP-FAIL", cls: "err" };
  } else if (relayStats.relayCheckinFail > 0 && relayStats.relayCheckinOk === 0) {
    relayApiBadge = { text: "CHECKIN-FAIL", cls: "err" };
  } else if (relayStats.relayLookupResponses > 0 && relayStats.relayCandidates > 0) {
    relayApiBadge = { text: "FOUND", cls: "ok" };
  } else if (relayStats.relayLookupResponses > 0) {
    relayApiBadge = { text: "NO-CANDIDATES", cls: "warn" };
  } else if (relayStats.relayLookupOk > 0) {
    relayApiBadge = { text: "WAITING", cls: "start" };
  } else {
    relayApiBadge = { text: "STARTING", cls: "start" };
  }

  const dhtBadge = ctx.hasDht
    ? { text: "ON", cls: "ok" as const }
    : { text: "OFF", cls: "warn" as const };

  const statusBadge = peerList.length === 0 && idleSec > 30
    ? { text: "SEARCHING", cls: "start" as const }
    : peerList.length > 0
      ? { text: "CONNECTED", cls: "ok" as const }
      : { text: "STARTING", cls: "start" as const };

  const lines: string[] = [];

  lines.push(CLEAR);
  lines.push(`${BOLD}${CYAN}╔════════════════════════════════════════════════════════════════╗${RESET}`);
  lines.push(`${BOLD}${CYAN}║          EnvoyMesh Discovery Dashboard                         ║${RESET}`);
  lines.push(`${BOLD}${CYAN}╚════════════════════════════════════════════════════════════════╝${RESET}`);
  lines.push("");
  lines.push(`  ${BOLD}Status:${RESET}    ${color(statusBadge.cls)}${BOLD}[${statusBadge.text}]${RESET}${RESET}  ${DIM}(updated ${idleSec}s ago)${RESET}`);
  lines.push(`  ${BOLD}Uptime:${RESET}    ${upSec}s`);
  lines.push("");
  lines.push(`  ${BOLD}Discovery:${RESET}  ${dhtBadge.cls === "ok" ? GREEN : YELLOW}[DHT ${dhtBadge.text}]${RESET}  ${ctx.args.enableMdns ? GREEN : DIM}[mDNS]${RESET}`);
  lines.push(`  ${BOLD}Circuit Addr:${RESET} ${relayBadge.cls === "ok" ? GREEN : YELLOW}[${relayBadge.text}]${RESET}  ${BOLD}Peers:${RESET} ${peerBadge.cls === "ok" ? GREEN : CYAN}[${peerBadge.text}]${RESET}`);
  if (ctx.args.autoRelayPeersQuery) {
    lines.push(
      `  ${BOLD}Relay API:${RESET} ${color(relayApiBadge.cls)}[${relayApiBadge.text}]${RESET} bootstrapDialOk=${relayStats.bootstrapDialOk} bootstrapDialFail=${relayStats.bootstrapDialFailed} checkinOk=${relayStats.relayCheckinOk} checkinFail=${relayStats.relayCheckinFail} lookupOk=${relayStats.relayLookupOk} lookupFail=${relayStats.relayLookupFail} responses=${relayStats.relayLookupResponses} candidates=${relayStats.relayCandidates} dialOk=${relayStats.relayDialOk} dialFail=${relayStats.relayDialFailed}`,
    );
  }
  lines.push("");
  lines.push(`${BOLD}  My PeerID:${RESET} ${GREEN}${ctx.mesh.peerId}${RESET}`);
  lines.push(`${BOLD}  Listen:${RESET}`);

  for (const addr of ctx.selfMultiaddrs.slice(0, 4)) {
    lines.push(`    ${DIM}${addr}${RESET}`);
  }
  if (ctx.selfMultiaddrs.length > 4) {
    lines.push(`    ${DIM}... and ${ctx.selfMultiaddrs.length - 4} more${RESET}`);
  }

  lines.push("");
  lines.push(`${BOLD}  Discovered Peers (${peerList.length}):${RESET}`);

  if (peerList.length === 0) {
    lines.push(`    ${DIM}Waiting for peers...${RESET}`);
  } else {
    for (const peer of peerList.slice(0, 10)) {
      const relayTag = peer.relayed ? ` ${YELLOW}[relay]${RESET}` : "";
      const age = Math.floor((Date.now() - peer.discoveredAt) / 1000);
      lines.push(`    ${GREEN}●${RESET} ${peer.peerId.slice(0, 16)}...${relayTag} ${DIM}(${age}s ago)${RESET}`);
    }
    if (peerList.length > 10) {
      lines.push(`    ${DIM}... and ${peerList.length - 10} more${RESET}`);
    }
  }

  lines.push("");
  lines.push(`${DIM}  Press Ctrl+C to stop${RESET}`);

  process.stdout.write(lines.join("\n") + "\n");
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});

function expiresAtFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function relayIdFromAddr(addr: string): string {
  const match = addr.match(/\/p2p\/([^/]+)$/);
  return match?.[1] ?? addr;
}