import {
  createLocalTaskStore,
  createLocalTrustStore,
  loadOrCreateNodeProfile,
  type ApprovalRequest,
  type AuditEvent,
  type TrustRecord,
} from "@envoymesh/local-store";
import {
  buildVaultIndex,
  searchVault,
  type VaultIndex,
} from "@envoymesh/vault";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  DashboardConfig,
  DashboardSnapshot,
  ObservedPeerSummary,
  SetTrustRecordRequest,
  VaultSearchHit,
  VaultSummary,
} from "../shared/dashboard.js";

export function createDashboardConfig(env: NodeJS.ProcessEnv = process.env): DashboardConfig {
  const workspaceRoot = findEnvoyMeshWorkspaceRoot(env);

  return {
    profileDir: resolvePathOrWorkspaceRelative(env.ENVOYMESH_PROFILE, "data/default", workspaceRoot),
    vaultDir: resolvePathOrWorkspaceRelative(env.ENVOYMESH_VAULT, "shared_vault", workspaceRoot),
  };
}

function resolvePathOrWorkspaceRelative(
  value: string | undefined,
  workspaceRelativeDefault: string,
  workspaceRoot: string,
): string {
  if (!value) {
    return join(workspaceRoot, workspaceRelativeDefault);
  }

  return resolve(value);
}

function findEnvoyMeshWorkspaceRoot(env: NodeJS.ProcessEnv): string {
  const explicit = env.ENVOYMESH_WORKSPACE;
  if (explicit) {
    return resolve(explicit);
  }

  const mainDirname = typeof __dirname !== "undefined" ? __dirname : process.cwd();
  const searchRoots = [
    process.cwd(),
    resolve(join(mainDirname, "..", "..", "..")),
    resolve(join(mainDirname, "..", "..", "..", "..")),
  ];

  for (const start of searchRoots) {
    const root = walkUpForPackageRoot(start);
    if (root) {
      return root;
    }
  }

  return process.cwd();
}

function walkUpForPackageRoot(startDir: string): string | undefined {
  let current = resolve(startDir);

  for (let depth = 0; depth < 12; depth += 1) {
    const packagePath = join(current, "package.json");
    if (existsSync(packagePath)) {
      try {
        const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as { name?: string };
        if (parsed.name === "envoy-mesh") {
          return current;
        }
      } catch {
        // ignore invalid package.json
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }

  return undefined;
}

export async function getDashboardSnapshot(config: DashboardConfig): Promise<DashboardSnapshot> {
  const profile = await loadOrCreateNodeProfile(config.profileDir);
  const taskStore = createLocalTaskStore(config.profileDir);
  const trustStore = createLocalTrustStore(config.profileDir);
  const [approvals, trustRecords, auditEvents, taskJournalEntries, vaultIndex] = await Promise.all([
    taskStore.readApprovalRequests(),
    trustStore.listTrustRecords(),
    taskStore.readAuditEvents(),
    taskStore.readTaskJournalEntries(),
    buildVaultIndexOrEmpty(config.vaultDir),
  ]);

  return {
    profile,
    approvals,
    trustRecords,
    auditEvents: auditEvents.slice(-50),
    taskJournalEntries: taskJournalEntries.slice(-50),
    observedPeers: summarizeObservedPeers(auditEvents),
    vault: summarizeVault(vaultIndex),
  };
}

export function updateApprovalStatus(
  config: DashboardConfig,
  approvalId: string,
  status: ApprovalRequest["status"],
): Promise<ApprovalRequest> {
  if (!approvalId.trim()) {
    throw new Error("approvalId is required");
  }

  return createLocalTaskStore(config.profileDir).updateApprovalRequestStatus(approvalId, status);
}

export function setTrustRecord(
  config: DashboardConfig,
  request: SetTrustRecordRequest,
): Promise<TrustRecord> {
  if (!request.peerOwnerId.trim()) {
    throw new Error("peerOwnerId is required");
  }

  return createLocalTrustStore(config.profileDir).setTrustRecord(request);
}

export function removeTrustRecord(config: DashboardConfig, peerOwnerId: string): Promise<TrustRecord> {
  return createLocalTrustStore(config.profileDir).removeTrustRecord(peerOwnerId);
}

export async function searchSharedVault(
  config: DashboardConfig,
  query: string,
): Promise<VaultSearchHit[]> {
  if (!query.trim()) {
    return [];
  }

  const index = await buildVaultIndexOrEmpty(config.vaultDir);

  return searchVault(index, query, { limit: 10 }).map((result) => ({
    score: result.score,
    relativePath: result.document.relativePath,
    chunkIndex: result.chunk.index,
    matches: result.matches,
    preview: result.chunk.text.slice(0, 240),
  }));
}

async function buildVaultIndexOrEmpty(vaultDir: string): Promise<VaultIndex> {
  if (!existsSync(vaultDir)) {
    return {
      rootDir: vaultDir,
      documents: [],
      chunks: [],
    };
  }

  return buildVaultIndex({ rootDir: vaultDir });
}

function summarizeVault(index: VaultIndex): VaultSummary {
  return {
    rootDir: index.rootDir,
    documentCount: index.documents.length,
    chunkCount: index.chunks.length,
    documents: index.documents.slice(0, 20).map((document) => ({
      documentId: document.documentId,
      relativePath: document.relativePath,
      title: document.title,
      byteLength: document.byteLength,
      updatedAt: document.updatedAt,
      chunkCount: index.chunks.filter((chunk) => chunk.documentId === document.documentId).length,
    })),
  };
}

function summarizeObservedPeers(events: AuditEvent[]): ObservedPeerSummary[] {
  const byPeer = new Map<string, { messageCount: number; lastSeenAt: string }>();

  for (const event of events) {
    if (!event.remotePeerId) {
      continue;
    }

    const current = byPeer.get(event.remotePeerId);
    byPeer.set(event.remotePeerId, {
      messageCount: (current?.messageCount ?? 0) + 1,
      lastSeenAt: maxIsoDate(current?.lastSeenAt, event.createdAt),
    });
  }

  return [...byPeer.entries()]
    .map(([peerId, summary]) => ({ peerId, ...summary }))
    .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
    .slice(0, 20);
}

function maxIsoDate(left: string | undefined, right: string): string {
  if (!left) {
    return right;
  }

  return left.localeCompare(right) > 0 ? left : right;
}
