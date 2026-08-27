/**
 * Map trace events and content blocks to protocol committed messages.
 */
import type { ContentBlock } from "../tools/types.js";
import type { TraceEvent } from "../trace/types.js";
import type { ProtocolCommittedMessage } from "./session-backend.js";
/** Extract display text from message content blocks. */
export declare function messageTextFromContent(content: ReadonlyArray<ContentBlock>): string;
/**
 * Convert a live trace event to a committed message for `session/update`.
 * Returns undefined when the event should not appear in the transcript.
 */
export declare function traceEventToCommittedMessage(event: TraceEvent): ProtocolCommittedMessage | undefined;
//# sourceMappingURL=message-format.d.ts.map