/**
 * Map agent trace events to protocol activity records for TUI / hosts.
 *
 * Keep summaries short: hosts show these inline during a turn, so dumping
 * tool stdout or model thinking here is pure noise.
 */
import type { TraceEvent } from "../trace/types.js";
import type { ProtocolActivityEvent } from "./session-backend.js";
/** Convert one trace event to a wire-safe activity record. */
export declare function traceEventToActivity(event: TraceEvent): ProtocolActivityEvent;
//# sourceMappingURL=activity-format.d.ts.map