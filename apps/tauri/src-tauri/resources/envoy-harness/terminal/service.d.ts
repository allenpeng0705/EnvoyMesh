/**
 * Phase C / Item 9 — owner-fenced terminal session registry.
 *
 * Backends own PTY mechanics; this service owns ids,
 * publication, authorization, exclusive sends, and cleanup.
 * Owner is an opaque string (typically `session.id`).
 */
import type { TerminalSessionService } from "./types.js";
/** Create an in-process {@link TerminalSessionService}. */
export declare function createTerminalSessionService(): TerminalSessionService;
//# sourceMappingURL=service.d.ts.map