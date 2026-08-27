/**
 * Phase C / Item 9 — persistent terminal public surface.
 */
export { createFakeTerminalBackend } from "./fake-backend.js";
export { createPtyTerminalBackend, isPtyAvailable, waitForQuiescence, } from "./pty-backend.js";
export { createTerminalSessionService } from "./service.js";
export { capTextUtf8, makeTerminalTools, registerTerminalTools, } from "./tools.js";
export { TerminalError } from "./types.js";
//# sourceMappingURL=index.js.map