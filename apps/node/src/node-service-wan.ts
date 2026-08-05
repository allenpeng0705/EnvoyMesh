import type {
  ApplyWanJoinInviteResult,
  CircuitReservationStatus,
  ConnectivityDiagnostics,
  CreateWanJoinInviteParams,
  CreateWanJoinInviteResult,
  DialableAddrMode,
  NodeConfig,
  NodeStatus,
} from "@envoymesh/api";
import {
  buildEnvoyJoinUri,
  clampWanJoinInviteExpiresInHours,
  decodeWanJoinInviteV1,
  encodeWanJoinInviteV1,
  assertWanJoinInviteNotExpired,
  isPrivateOrLoopbackMultiaddr,
  mergeWanJoinInviteBootstrap,
  parseEnvoyJoinUri,
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
} from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
import { allowsLoopbackDialHints, relayCircuitToPeer } from "@envoymesh/network";
import type { AuditEvent, LocalTaskStore } from "@envoymesh/local-store";
import type { DiscoverySeedStore } from "./discovery-seed-store.js";
import type { PersistedNodeConfig } from "./node-config-store.js";
import { buildConnectivityDiagnostics } from "./connectivity-diagnostics.js";

export interface NodeWanRuntimeDeps {
  recordOwnerActivity(): void;
  getNodeConfig(): Promise<NodeConfig>;
  loadPersistedConfig(): Promise<PersistedNodeConfig | undefined>;
  updateNodeConfig(patch: Partial<NodeConfig>): Promise<void>;
  reachableMesh(): EnvoyMesh | undefined;
  getMesh(): EnvoyMesh | undefined;
  getExternalMesh(): EnvoyMesh | undefined;
  getNodeStatus(): NodeStatus;
  getDiscoverySeedStore(): DiscoverySeedStore | null;
  getTaskStore(): LocalTaskStore | null;
}

export function buildWanRuntimeDeps(host: any): NodeWanRuntimeDeps {
  return {
    recordOwnerActivity: () => host.recordOwnerActivity(),
    getNodeConfig: () => host.getNodeConfig(),
    loadPersistedConfig: () => host._configStore.load(),
    updateNodeConfig: (patch) => host.updateNodeConfig(patch),
    reachableMesh: () => host._reachableMesh(),
    getMesh: () => host._mesh,
    getExternalMesh: () => host._externalMesh,
    getNodeStatus: () => host._nodeStatus,
    getDiscoverySeedStore: () => host._discoverySeedStore ?? null,
    getTaskStore: () => host._taskStore ?? null,
  };
}

export async function buildCompanyInviteInviteContext(host: any): Promise<{
  ownerId: string;
  ownerPublicKey?: string;
  agentPeerId?: string;
  agentName?: string;
  wsUrl: string;
  lanWsUrl?: string;
  relayWsUrl?: string;
  homeNodePeerId?: string;
}> {
  const profile = host._profile;
  const payload = await host.getPairingPayload();
  return {
    ownerId: profile?.owner?.ownerId ?? payload.ownerId ?? "",
    ownerPublicKey: profile?.owner?.publicKeyPem ?? payload.ownerPublicKey,
    agentPeerId: payload.agentPeerId,
    agentName: payload.agentName,
    wsUrl: payload.wsUrl,
    lanWsUrl: payload.lanWsUrl,
    relayWsUrl: payload.relayWsUrl ?? host._relayPublicWsUrl,
    homeNodePeerId: payload.homeNodePeerId,
  };
}

/**
 * Address filter modes for outbound invite / contact URI generation.
 * Re-exported from `@envoymesh/api` so call sites can stay generic; the
 * filter function itself lives here (it depends on private multiaddr
 * parsing helpers and isn't part of the public API).
 */
export type { DialableAddrMode };

const IPV4_OCTET_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseIpv4(addr: string): number[] | null {
  const m = addr.match(/\/ip4\/([0-9.]+)/);
  if (!m) return null;
  const parts = m[1].split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

function isLoopbackOrUnspecIpv4(parts: number[]): boolean {
  // 127.0.0.0/8 — loopback
  if (parts[0] === 127) return true;
  // 0.0.0.0 — unspecified
  if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0) return true;
  return false;
}

function isRoutablePublicIpv4(parts: number[]): boolean {
  // 10.0.0.0/8 — RFC1918 private
  if (parts[0] === 10) return false;
  // 172.16.0.0/12 — RFC1918 private (172.16-31)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
  // 192.168.0.0/16 — RFC1918 private
  if (parts[0] === 192 && parts[1] === 168) return false;
  // 169.254.0.0/16 — link-local
  if (parts[0] === 169 && parts[1] === 254) return false;
  // 100.64.0.0/10 — CGNAT (carrier-grade NAT). Even if the address is
  // technically "public-looking", it's behind the carrier's NAT and is
  // not directly dialable from outside the carrier's network.
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return false;
  // 127.0.0.0/8 and 0.0.0.0 are not public (caught by the loopback
  // check above, but belt-and-suspenders).
  if (parts[0] === 127 || parts[0] === 0) return false;
  return true;
}

function isLoopbackOrUnspec(addr: string): boolean {
  if (addr.includes("/ip6/::1") || addr.includes("/ip6/::/")) return true;
  const v4 = parseIpv4(addr);
  if (v4) return isLoopbackOrUnspecIpv4(v4);
  // Non-IP multiaddrs (DNS, etc.) — assume dialable in `"all"` mode.
  return false;
}

function isPublicRoutable(addr: string): boolean {
  if (addr.includes("/ip6/::1") || addr.includes("/ip6/::/")) return false;
  if (addr.includes("/ip6/fe80:")) return false; // IPv6 link-local
  if (addr.includes("/ip6/fc") || addr.includes("/ip6/fd")) return false; // IPv6 ULA
  const v4 = parseIpv4(addr);
  if (v4) return isRoutablePublicIpv4(v4);
  // Non-IP (DNS, etc.) — accept by default; the dial layer will fail
  // later if the hostname resolves to a private range.
  return true;
}

export function filterDialableMultiaddrs(
  addrs: readonly string[],
  mode: DialableAddrMode = "wan-public",
): string[] {
  const out: string[] = [];
  for (const addr of addrs) {
    const trimmed = addr.trim();
    if (!trimmed) continue;
    if (!allowsLoopbackDialHints() && isLoopbackOrUnspec(trimmed)) continue;
    if (mode === "wan-public" && !isPublicRoutable(trimmed)) continue;
    out.push(trimmed);
  }
  return out.slice(0, 8);
}

export async function createWanJoinInviteViaRuntime(
  deps: NodeWanRuntimeDeps,
  params?: CreateWanJoinInviteParams,
): Promise<CreateWanJoinInviteResult> {
  deps.recordOwnerActivity();
  const config = await deps.getNodeConfig();
  const reachable = deps.getMesh() ?? deps.getExternalMesh();
  const expiresInHours = clampWanJoinInviteExpiresInHours(params?.expiresInHours);
  const now = new Date();
  // WAN join invites cross network boundaries by default — strip RFC1918
  // + CGNAT addresses so the invite doesn't ship LAN-only addresses that
  // the recipient can't dial. The relay-circuit multiaddrs (e.g. via
  // 47.93.11.212) survive this filter — they are public if the relay is.
  // Callers that explicitly know the recipient is on the same LAN (e.g.
  // mobile pairing kiosk) can opt back in with `addressFilter: "lan-paired"`.
  const addressFilter: DialableAddrMode = params?.addressFilter ?? "wan-public";

  // Hard-gate WAN minting on a *live* circuit-relay reservation.
  // Prefer hasLiveRelayReservation (store currently holds a slot); fall back
  // to hasRelayReservation for older meshes. Meshes with neither API skip
  // the gate (unit fixtures). Pass forceWithoutReservation for packaging.
  if (addressFilter === "wan-public" && !params?.forceWithoutReservation) {
    let live: boolean | undefined;
    if (typeof reachable?.hasLiveRelayReservation === "function") {
      live = reachable.hasLiveRelayReservation();
    } else if (typeof reachable?.hasRelayReservation === "function") {
      live = reachable.hasRelayReservation();
    }
    if (live === false) {
      throw new Error(
        "Cannot mint WAN join invite: circuit-relay reservation is not active (relay≠RESERVED). " +
          "Wait until Settings → Network shows a live reservation, or pass forceWithoutReservation: true.",
      );
    }
  }

  let targetMultiaddrs = filterDialableMultiaddrs(
    reachable?.getRelayAdvertisedMultiaddrs?.() ?? reachable?.multiaddrs ?? [],
    addressFilter,
  );

  // Home Mac behind NAT: mesh.multiaddrs only contains /p2p-circuit/ after
  // a live reservation. If the circuit is missing (reservation pending or
  // invite minted too early), append synthetic circuits via configured /
  // community relays so WAN joiners still have a dial target. Dial still
  // fails with NO_RESERVATION until the sponsor holds a slot — but the
  // invite is no longer empty after wan-public stripping.
  const peerId = reachable?.peerId?.trim();
  const hasCircuit = targetMultiaddrs.some((a) => a.includes("/p2p-circuit/"));
  if (
    addressFilter === "wan-public" &&
    peerId &&
    !hasCircuit
  ) {
    const relayBases: string[] = [];
    for (const r of config.configuredRelays ?? []) {
      if (r.enabled && r.addr?.trim()) relayBases.push(r.addr.trim());
    }
    for (const b of config.bootstrapPeers ?? []) {
      if (b.includes("/p2p/") && !b.includes("/p2p-circuit/")) relayBases.push(b);
    }
    if (config.bootstrapPresets?.includes("cn-relay")) {
      relayBases.push(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
    }
    if (relayBases.length === 0) {
      relayBases.push(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
    }
    const synthetic: string[] = [];
    for (const base of relayBases) {
      const circuit = relayCircuitToPeer(base, peerId);
      if (circuit && !synthetic.includes(circuit)) synthetic.push(circuit);
      if (synthetic.length >= 3) break;
    }
    if (synthetic.length > 0) {
      targetMultiaddrs = [...targetMultiaddrs, ...synthetic];
      const reserved =
        typeof reachable?.hasLiveRelayReservation === "function"
          ? reachable.hasLiveRelayReservation()
          : typeof reachable?.hasRelayReservation === "function"
            ? reachable.hasRelayReservation()
            : undefined;
      if (reserved === false) {
        console.warn(
          `[wan-join] invite includes synthetic circuit(s) but local relay reservation is PENDING — ` +
            `WAN joiners cannot reach this node until reservation succeeds (check Settings → Network / relay=RESERVED)`,
        );
      } else {
        console.log(
          `[wan-join] appended ${synthetic.length} synthetic circuit multiaddr(s) (no live circuit in mesh.multiaddrs yet)`,
        );
      }
    }
  }

  const compact = params?.compact === true;
  // Same address class filter as targetMultiaddrs so joiners do not re-seed
  // RFC1918 bootstrap peers from a WAN invite. Always include configured
  // EnvoyMesh relays so joiners look up / dial the same hop set the sponsor uses.
  const configuredRelayBases = (config.configuredRelays ?? [])
    .filter((r) => r.enabled !== false && r.addr?.trim())
    .map((r) => r.addr!.trim());
  const bootstrapPeers = compact
    ? []
    : filterDialableMultiaddrs(
        [...(config.bootstrapPeers ?? []), ...configuredRelayBases],
        addressFilter,
      );
  const invite = {
    v: 1 as const,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString(),
    note: params?.note?.trim() || undefined,
    targetPeerId: reachable?.peerId,
    targetMultiaddrs: compact ? targetMultiaddrs.slice(0, 3) : targetMultiaddrs,
    bootstrapPeers,
    bootstrapPresets: [...config.bootstrapPresets],
  };
  const token = encodeWanJoinInviteV1(invite);
  return {
    token,
    uri: buildEnvoyJoinUri(token),
    invite,
  };
}

export async function applyWanJoinInviteViaRuntime(
  deps: NodeWanRuntimeDeps,
  token: string,
): Promise<ApplyWanJoinInviteResult> {
  deps.recordOwnerActivity();
  const invite = decodeWanJoinInviteV1(parseEnvoyJoinUri(token));
  assertWanJoinInviteNotExpired(invite);
  console.log(
    `[wan-join] parsed join invite: targetPeerId=${invite.targetPeerId?.slice(0, 16) ?? "unknown"}… ` +
      `bootstrapPeers=${invite.bootstrapPeers.length} presets=${invite.bootstrapPresets?.length ?? 0} ` +
      `expiresAt=${invite.expiresAt}`,
  );
  const config = await deps.getNodeConfig();
  const beforePeers = new Set(config.bootstrapPeers);
  const beforePresets = new Set(config.bootstrapPresets);
  const merged = mergeWanJoinInviteBootstrap({
    bootstrapPeers: config.bootstrapPeers,
    bootstrapPresets: config.bootstrapPresets,
    invite,
  });
  // Promote invite bootstrap relay bases into configuredRelays so the joiner
  // reserves/looks up the same EnvoyMesh hops the sponsor uses (multi-relay).
  // Never promote RFC1918 / loopback — older invites and polluted profiles
  // used to turn the sponsor's home LAN listen addr into an addRelay target
  // (EHOSTUNREACH on WAN), starving cn-relay reservation.
  const existingConfigured = new Map(
    (config.configuredRelays ?? [])
      .filter((r) => r.addr?.trim())
      .filter((r) => !isPrivateOrLoopbackMultiaddr(r.addr!.trim()))
      .map((r) => [r.addr!.trim(), r] as const),
  );
  for (const addr of merged.bootstrapPeers) {
    if (!addr.includes("/p2p/") || addr.includes("/p2p-circuit/")) continue;
    if (isPrivateOrLoopbackMultiaddr(addr)) continue;
    if (existingConfigured.has(addr)) continue;
    const peerMatch = addr.match(/\/p2p\/([^/]+)$/);
    const relayId = peerMatch?.[1] ?? addr;
    existingConfigured.set(addr, { relayId, addr, enabled: true });
  }
  const configuredRelays = [...existingConfigured.values()];
  // Also drop any leftover private bootstrap peers from a prior polluted apply.
  const bootstrapPeers = merged.bootstrapPeers.filter((a) => !isPrivateOrLoopbackMultiaddr(a));
  await deps.updateNodeConfig({
    bootstrapPeers,
    bootstrapPresets: merged.bootstrapPresets,
    configuredRelays,
  });
  const seedStore = deps.getDiscoverySeedStore();
  if (seedStore && merged.seedAddrs.length > 0) {
    await seedStore.upsertMany(merged.seedAddrs, "manual-bootstrap");
  }
  const peersAdded = merged.bootstrapPeers.filter((p) => !beforePeers.has(p)).length;
  const presetsAdded = merged.bootstrapPresets.filter((p) => !beforePresets.has(p)).length;
  console.log(
    `[wan-join] applied join invite: added ${peersAdded} bootstrap peers, ${presetsAdded} presets, ${merged.seedAddrs.length} seeds`,
  );
  return {
    ok: true,
    bootstrapPeersAdded: merged.bootstrapPeers.filter((p) => !beforePeers.has(p)).length,
    bootstrapPresetsAdded: merged.bootstrapPresets.filter((p) => !beforePresets.has(p)).length,
    seedsPersisted: merged.seedAddrs.length,
  };
}

export async function getConnectivityDiagnosticsViaRuntime(
  deps: NodeWanRuntimeDeps,
): Promise<ConnectivityDiagnostics> {
  const mesh = deps.reachableMesh();
  const taskStore = deps.getTaskStore();
  const auditEvents: readonly AuditEvent[] = taskStore ? await taskStore.readAuditEvents() : [];
  const config = await deps.loadPersistedConfig();
  return buildConnectivityDiagnostics({
    mesh,
    nodeOnline: Boolean(mesh && deps.getNodeStatus() === "running"),
    config,
    auditEvents,
  });
}

/** Thin reservation chip — no audit / WAN axis work. */
export async function getCircuitReservationStatusViaRuntime(
  deps: NodeWanRuntimeDeps,
): Promise<CircuitReservationStatus> {
  const mesh = deps.reachableMesh() ?? deps.getMesh() ?? deps.getExternalMesh();
  if (typeof mesh?.getRelayReservationStatus === "function") {
    return mesh.getRelayReservationStatus();
  }
  return {
    state: "off",
    live: false,
    everReserved: false,
    relayPeerIds: [],
    checkedAt: new Date().toISOString(),
  };
}
