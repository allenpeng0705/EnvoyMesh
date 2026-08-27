/**
 * Model-facing tool: record follow-up suggestions and deferred tasks at turn end.
 */
import type { Tool } from "../tools/types.js";
import type { TurnHints } from "./turn-hints.js";
export interface MakeSuggestFollowUpsToolOptions {
    record: (hints: TurnHints) => void;
}
export declare function makeSuggestFollowUpsTool(opts: MakeSuggestFollowUpsToolOptions): Tool;
//# sourceMappingURL=suggest-follow-ups-tool.d.ts.map