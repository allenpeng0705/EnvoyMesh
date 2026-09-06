/**
 * Stable React context instance for node state.
 * Keep createContext in a .ts file (not .tsx with the Provider) so Vite Fast Refresh
 * can update NodeStateProvider without minting a new context identity — otherwise
 * long-running Social sessions can throw "useNodeState must be used within
 * NodeStateProvider" after a hot update leaves consumers on a stale context.
 */
import { createContext } from "react";
import type {
  BondRecord,
  BridgeStatus,
  ChatMessage,
  ConnectionStatus,
  HelloProfile,
  HelloRequest,
  HumanProfile,
  NodeConfig,
  NodeStatus,
  PeerSearchResult,
  SendHelloOptions,
  SocialIntroProposal,
} from "@envoymesh/api";
import type { AppSettings, AssistantMode } from "../lib/storage.js";

export interface NodeStateValue {
  // Connection
  /** WebSocket/mobile transport connected to node's API (daemon may still be stopped). */
  isConnected: boolean;
  /** False until the first getNodeStatus completes after transport is up. */
  nodeStatusHydrated: boolean;
  nodeStatus: NodeStatus;
  peerId: string;

  // Configuration
  nodeConfig: NodeConfig | null;

  // Identity
  humanProfile: HumanProfile | null;

  // Social
  bonds: BondRecord[];
  pendingHellOs: HelloRequest[];
  pendingIntroProposals: SocialIntroProposal[];
  connectionStatus: ConnectionStatus | null;

  // Discovery
  discoveredPeers: PeerSearchResult[];
  /** One-shot LAN scan; replaces the Discover nearby list (no live churn). */
  refreshDiscoveredPeers: () => Promise<{
    peered: number;
    resolved: number;
    unreachable: number;
  }>;

  // Inbox
  pendingMessages: ChatMessage[];

  // App settings (persisted)
  appSettings: AppSettings;

  // Agent bridge
  bridgeStatus: BridgeStatus | null;

  // Paired diagnostics snapshot from the home node (debug bar in MobileApp).
  // `null` when the transport is closed or the call has not yet returned.
  pairedDiag: Record<string, unknown> | null;

  // Per-contact AI modes (persisted)
  contactAiModes: Record<string, AssistantMode>;

  // Mutations
  setAppSettings: (settings: AppSettings) => void;
  refreshNodeConfig: () => Promise<void>;
  refreshHumanProfile: () => Promise<void>;
  refreshConnectionStatus: () => Promise<void>;
  acceptHello: (messageId: string) => Promise<void>;
  declineHello: (messageId: string, reason?: string) => Promise<void>;
  approveIntroCommitment: (messageId: string) => Promise<void>;
  declineIntroProposal: (messageId: string) => Promise<void>;
  setContactAiModes: (modes: Record<string, AssistantMode>) => void;
  sendHello: (
    targetOwnerId: string,
    profile: HelloProfile,
    message: string,
    opts?: SendHelloOptions,
  ) => Promise<void>;
  removePendingMessage: (messageId: string) => void;
  clearPendingMessages: () => void;
}

export const NodeStateContext = createContext<NodeStateValue | null>(null);
