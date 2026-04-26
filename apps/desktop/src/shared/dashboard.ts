import type {
  ApprovalRequest,
  AuditEvent,
  NodeProfile,
  TrustRecord,
} from "@envoymesh/local-store";
import type { TaskJournalEntry } from "@envoymesh/protocol";

export interface ObservedPeerSummary {
  peerId: string;
  messageCount: number;
  lastSeenAt: string;
}

export interface VaultDocumentSummary {
  documentId: string;
  relativePath: string;
  title: string;
  byteLength: number;
  chunkCount: number;
  updatedAt: string;
}

export interface VaultSummary {
  rootDir: string;
  documentCount: number;
  chunkCount: number;
  documents: VaultDocumentSummary[];
}

export interface VaultSearchHit {
  score: number;
  relativePath: string;
  chunkIndex: number;
  matches: string[];
  preview: string;
}

export interface DashboardSnapshot {
  profile: NodeProfile;
  approvals: ApprovalRequest[];
  trustRecords: TrustRecord[];
  auditEvents: AuditEvent[];
  taskJournalEntries: TaskJournalEntry[];
  observedPeers: ObservedPeerSummary[];
  vault: VaultSummary;
}

export interface DashboardConfig {
  profileDir: string;
  vaultDir: string;
}

export interface SetTrustRecordRequest {
  peerOwnerId: string;
  level: TrustRecord["level"];
  displayName?: string;
  note?: string;
}

export interface DashboardApi {
  getConfig(): Promise<DashboardConfig>;
  getDashboardSnapshot(): Promise<DashboardSnapshot>;
  approveRequest(approvalId: string): Promise<ApprovalRequest>;
  rejectRequest(approvalId: string): Promise<ApprovalRequest>;
  setTrustRecord(request: SetTrustRecordRequest): Promise<TrustRecord>;
  removeTrustRecord(peerOwnerId: string): Promise<TrustRecord>;
  searchVault(query: string): Promise<VaultSearchHit[]>;
}
