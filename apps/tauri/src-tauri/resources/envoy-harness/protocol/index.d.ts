/**
 * Phase E — protocol public surface.
 */
export { JsonRpcError, JsonRpcErrorCode, isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse, type JsonRpcErrorObject, type JsonRpcFailure, type JsonRpcId, type JsonRpcMessage, type JsonRpcNotification, type JsonRpcRequest, type JsonRpcResponse, type JsonRpcSuccess, } from "./types.js";
export { encodeFrame, FrameDecoder } from "./framing.js";
export { JsonRpcConnection, type JsonRpcConnectionOptions, type NotificationHandler, type RequestHandler, } from "./connection.js";
export { createInProcessJsonRpcPair, type InProcessPair, } from "./in-process.js";
export { createFakeSessionBackend, type ProtocolClusterStatus, type ProtocolDiscoveryEvent, type ProtocolPeerHealth, type ProtocolScoreboardEntry, type ProtocolTeamAgentStatus, type ProtocolTeamJob, type ProtocolPeerInfo, type ProtocolCommittedMessage, type ProtocolPermissionDecision, type ProtocolPermissionRequest, type ProtocolPromptResult, type ProtocolSessionBackend, type ProtocolToolInfo, type ProtocolActivityEvent, type ProtocolCompactResult, } from "./session-backend.js";
export { traceEventToActivity } from "./activity-format.js";
export { traceEventToCommittedMessage, messageTextFromContent } from "./message-format.js";
export { formatGitOutput, runGitDiff, runGitStatus } from "./git-runner.js";
export { ACP_PROTOCOL_VERSION, attachAcpServer, type AcpServerOptions, } from "./acp-server.js";
export { attachSdkServer, type SdkServerOptions } from "./sdk-server.js";
export { createAgentSessionBackend, type AgentSessionBackendOptions, } from "./agent-backend.js";
export { installToolPermissionAskHook, type ToolPermissionAskHookOptions, } from "./permission-hook.js";
//# sourceMappingURL=index.d.ts.map