import type {
  ApplyWanJoinInviteResult,
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
  mergeWanJoinInviteBootstrap,
  parseEnvoyJoinUri,
} from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
import { allowsLoopbackDialHints } from "@envoymesh/network";
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
  const targetMultiaddrs = filterDialableMultiaddrs(
    reachable?.multiaddrs ?? [],
    addressFilter,
  );
  const compact = params?.compact === true;
  const invite = {
    v: 1 as const,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString(),
    note: params?.note?.trim() || undefined,
    targetPeerId: reachable?.peerId,
    targetMultiaddrs: compact ? targetMultiaddrs.slice(0, 3) : targetMultiaddrs,
    bootstrapPeers: compact ? [] : [...config.bootstrapPeers],
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
  await deps.updateNodeConfig({
    bootstrapPeers: merged.bootstrapPeers,
    bootstrapPresets: merged.bootstrapPresets,
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
