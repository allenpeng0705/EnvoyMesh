import type {
  ApplyWanJoinInviteResult,
  ConnectivityDiagnostics,
  CreateWanJoinInviteParams,
  CreateWanJoinInviteResult,
  NodeConfig,
  NodeStatus,
} from "@envoymesh/api";
import {
  buildEnvoyJoinUri,
  decodeWanJoinInviteV1,
  encodeWanJoinInviteV1,
  assertWanJoinInviteNotExpired,
  mergeWanJoinInviteBootstrap,
  parseEnvoyJoinUri,
} from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
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

function filterDialableMultiaddrs(addrs: readonly string[]): string[] {
  const out: string[] = [];
  for (const addr of addrs) {
    const trimmed = addr.trim();
    if (!trimmed) continue;
    const ip4 = trimmed.match(/\/ip4\/([0-9.]+)/)?.[1];
    if (ip4 && (ip4.startsWith("127.") || ip4 === "0.0.0.0")) continue;
    if (trimmed.includes("/ip6/::1")) continue;
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
  const expiresInHours =
    typeof params?.expiresInHours === "number" && params.expiresInHours > 0
      ? Math.min(params.expiresInHours, 24 * 30)
      : 168;
  const now = new Date();
  const invite = {
    v: 1 as const,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString(),
    note: params?.note?.trim() || undefined,
    targetPeerId: reachable?.peerId,
    targetMultiaddrs: filterDialableMultiaddrs(reachable?.multiaddrs ?? []),
    bootstrapPeers: [...config.bootstrapPeers],
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
