import { type ReactNode } from "react";
import { type AppSettings, type AssistantMode } from "../lib/storage.js";
import type { BondRecord, BridgeStatus, ChatMessage, ConnectionStatus, HelloProfile, HelloRequest, HumanProfile, NodeConfig, NodeStatus, PeerSearchResult } from "@envoymesh/api";
interface NodeStateValue {
    isConnected: boolean;
    nodeStatus: NodeStatus;
    peerId: string;
    nodeConfig: NodeConfig | null;
    humanProfile: HumanProfile | null;
    bonds: BondRecord[];
    pendingHellOs: HelloRequest[];
    connectionStatus: ConnectionStatus | null;
    discoveredPeers: PeerSearchResult[];
    pendingMessages: ChatMessage[];
    appSettings: AppSettings;
    bridgeStatus: BridgeStatus | null;
    contactAiModes: Record<string, AssistantMode>;
    setAppSettings: (settings: AppSettings) => void;
    refreshNodeConfig: () => Promise<void>;
    acceptHello: (messageId: string) => Promise<void>;
    declineHello: (messageId: string, reason?: string) => Promise<void>;
    setContactAiModes: (modes: Record<string, AssistantMode>) => void;
    sendHello: (targetOwnerId: string, profile: HelloProfile, message: string) => Promise<void>;
    removePendingMessage: (messageId: string) => void;
    clearPendingMessages: () => void;
}
export declare function NodeStateProvider({ children }: {
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function useNodeState(): NodeStateValue;
export {};
//# sourceMappingURL=NodeStateContext.d.ts.map