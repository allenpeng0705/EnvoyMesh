/**
 * Phase E — protocol public surface.
 */
export { JsonRpcError, JsonRpcErrorCode, isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse, } from "./types.js";
export { encodeFrame, FrameDecoder } from "./framing.js";
export { JsonRpcConnection, } from "./connection.js";
export { createInProcessJsonRpcPair, } from "./in-process.js";
export { createFakeSessionBackend, } from "./session-backend.js";
export { traceEventToActivity } from "./activity-format.js";
export { traceEventToCommittedMessage, messageTextFromContent } from "./message-format.js";
export { formatGitOutput, runGitDiff, runGitStatus } from "./git-runner.js";
export { ACP_PROTOCOL_VERSION, attachAcpServer, } from "./acp-server.js";
export { attachSdkServer } from "./sdk-server.js";
export { createAgentSessionBackend, } from "./agent-backend.js";
export { installToolPermissionAskHook, } from "./permission-hook.js";
//# sourceMappingURL=index.js.map