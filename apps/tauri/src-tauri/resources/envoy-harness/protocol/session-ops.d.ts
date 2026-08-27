/**
 * Shared session operations for protocol + REPL parity
 * (review, init, summarize, plan, memory formatting).
 */
import type { Agent } from "../agent.js";
import type { MemoryStore } from "../memories/store.js";
import { type PlanState } from "../plan/index.js";
import type { Message } from "../tools/types.js";
import type { SubagentRecord } from "../subagent/types.js";
import type { Session } from "../session.js";
/** LLM summarizer for compact --summarize (REPL parity). */
export declare function summarizeDroppedMessages(agent: Agent, dropped: ReadonlyArray<Message>): Promise<string>;
/** Model review of git diff (REPL /review parity). */
export declare function runSessionReview(agent: Agent, cwd: string, staged: boolean): Promise<string>;
/** Generate AGENTS.md (REPL /init parity). */
export declare function runSessionInit(agent: Agent, cwd: string): Promise<{
    path: string;
    lines: number;
    preview: string;
}>;
export type PlanAction = "enter" | "show" | "edit" | "propose" | "approve" | "reject" | "exit";
/** Plan lifecycle (REPL /plan parity). */
export declare function runPlanAction(session: Session, action: PlanAction, text?: string, reason?: string): string;
export declare function formatSubagentRecords(records: ReadonlyArray<SubagentRecord>): string;
export declare function runMemoryOp(store: MemoryStore, op: "list" | "read" | "add", name?: string, body?: string): Promise<string>;
export declare function formatPlanState(plan: PlanState | undefined): string;
//# sourceMappingURL=session-ops.d.ts.map