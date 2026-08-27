/**
 * Phase D / Item 16 — model-facing feedback tool.
 */
import type { Tool } from "../tools/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { FeedbackStore } from "./record.js";
/** Build `feedback_record` bound to a store. */
export declare function makeFeedbackTools(store: FeedbackStore): Tool[];
/** Register feedback tools on a registry. */
export declare function registerFeedbackTools(tools: ToolRegistry, store: FeedbackStore): void;
//# sourceMappingURL=tools.d.ts.map