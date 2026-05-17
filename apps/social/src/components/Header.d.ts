import type { ConnectionStatus, HumanProfile, NodeStatus } from "@envoymesh/api";
import type { ViewName } from "../App.js";
interface HeaderProps {
    currentView: ViewName;
    onNavigate: (view: ViewName) => void;
    inboxCount: number;
    bondsCount: number;
    isPublicNetwork: boolean;
    connectionStatus: ConnectionStatus | null;
    nodeStatus: NodeStatus;
    humanProfile: HumanProfile | null;
    peerId: string;
}
export declare function Header({ currentView, onNavigate, inboxCount, bondsCount, isPublicNetwork, connectionStatus, nodeStatus, humanProfile, peerId, }: HeaderProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Header.d.ts.map