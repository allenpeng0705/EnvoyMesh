import type {
  ApprovalRequest,
  AuditEvent,
  MorningReportEntry,
  NodeProfile,
  TrustRecord,
} from "@envoymesh/local-store";

export type { AuditEvent };
import type { TaskJournalEntry } from "@envoymesh/protocol";

export interface ObservedPeerSummary {
  peerId: string;
  messageCount: number;
  lastSeenAt: string;
}

export interface P2pTraceSummary {
  eventId: string;
  createdAt: string;
  summary: string;
  direction?: "inbound" | "outbound";
  protocol?: string;
  remotePeerId?: string;
  latencyMs?: number;
}

export interface LiveP2pSnapshot {
  generatedAt: string;
  peerCount: number;
  inboundCount: number;
  outboundCount: number;
  protocolCounts: Array<{ protocol: string; count: number }>;
  traces: P2pTraceSummary[];
}

export interface ConnectivityHealthSnapshot {
  discoveryProfile: "lan-fast" | "wan-default" | "unknown";
  bootstrapPeerCount: number;
  discoveredPeerCount: number;
  relayDiscoveryCount: number;
  bootstrapProbeSuccessCount: number;
  bootstrapProbeFailureCount: number;
  warningCount: number;
  warnings: string[];
  lastCheckpointAt?: string;
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
  /** Recent chat.message-related audit rows for a lightweight thread view. */
  chatAuditTrail: AuditEvent[];
  /** Pairing-centric timeline merged from pairing approvals and pairing audit events. */
  pairingTimeline: Array<{
    requestId: string;
    status: "pending" | "approved" | "rejected" | "deferred" | "approved_remote";
    createdAt: string;
    summary: string;
    approvalId?: string;
    remotePeerId?: string;
  }>;
  taskJournalEntries: TaskJournalEntry[];
  observedPeers: ObservedPeerSummary[];
  liveP2p: LiveP2pSnapshot;
  connectivityHealth: ConnectivityHealthSnapshot;
  morningReport: MorningReportEntry[];
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

export interface SendChatRequest {
  target: string;
  text: string;
  correlationId?: string;
}

export interface SendTaskProposalRequest {
  target: string;
  taskId: string;
  mandateId?: string;
  objective: string;
  requestedResult: string;
  correlationId?: string;
  closeOnFirstCompletedResult?: boolean;
  collectCompletedResults?: number;
}

export interface SendTaskNegotiateRequest {
  target: string;
  taskId: string;
  mandateId: string;
  message: string;
  proposedChanges?: string[];
  negotiationId?: string;
  correlationId?: string;
}

export interface SendPairingRequest {
  target: string;
  note?: string;
  requestedDeviceProfile?: "satellite" | "full";
}

export interface OutboundSendResult {
  messageId: string;
  intent: string;
  target: string;
  latencyMs: number;
}

export interface DashboardApi {
  getConfig(): Promise<DashboardConfig>;
  getDashboardSnapshot(): Promise<DashboardSnapshot>;
  approveRequest(approvalId: string): Promise<ApprovalRequest>;
  rejectRequest(approvalId: string): Promise<ApprovalRequest>;
  setTrustRecord(request: SetTrustRecordRequest): Promise<TrustRecord>;
  removeTrustRecord(peerOwnerId: string): Promise<TrustRecord>;
  searchVault(query: string): Promise<VaultSearchHit[]>;
  sendChatMessage(request: SendChatRequest): Promise<OutboundSendResult>;
  sendTaskProposal(request: SendTaskProposalRequest): Promise<OutboundSendResult>;
  sendTaskNegotiate(request: SendTaskNegotiateRequest): Promise<OutboundSendResult>;
  sendPairingRequest(request: SendPairingRequest): Promise<OutboundSendResult>;
  exportPairingTimeline(outputPath: string): Promise<string>;
}
