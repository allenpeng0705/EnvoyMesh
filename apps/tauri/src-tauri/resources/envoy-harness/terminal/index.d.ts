/**
 * Phase C / Item 9 — persistent terminal public surface.
 */
export type { FakeTerminalBackendOptions, FakeTerminalSessionState, } from "./fake-backend.js";
export { createFakeTerminalBackend } from "./fake-backend.js";
export { createPtyTerminalBackend, isPtyAvailable, waitForQuiescence, } from "./pty-backend.js";
export { createTerminalSessionService } from "./service.js";
export { capTextUtf8, makeTerminalTools, registerTerminalTools, } from "./tools.js";
export type { TerminalBackend, TerminalBackendSession, TerminalBackendSpawnSpec, TerminalErrorCode, TerminalReadRequest, TerminalReadResult, TerminalSendOperation, TerminalSendRequest, TerminalSendResult, TerminalSessionService, TerminalSessionSnapshot, TerminalSessionStatus, TerminalSignal, TerminalSpawnRequest, TerminalWaitReason, } from "./types.js";
export { TerminalError } from "./types.js";
//# sourceMappingURL=index.d.ts.map