import type { BondRecord, DiscoverPublishedLibraryParams, DiscoverPublishedLibraryPeerResult, LibraryItem, SendChatResult } from "./node-service.js";
export type DocumentAgentIntentKind = "list_library" | "discover" | "publish" | "unpublish" | "share_propose" | "request_share_from" | "transfer_status" | "knowledge";
export interface DocumentAgentTurnResult {
    answer: string;
    intent: DocumentAgentIntentKind;
    toolsUsed: string[];
}
export type DocumentAgentToolParams = Record<string, unknown>;
export interface DocumentAgentToolResult {
    ok: boolean;
    error?: string;
    result?: unknown;
    toolName: string;
    correlationId: string;
    latencyMs: number;
}
export interface ClassifiedDocumentIntent {
    kind: DocumentAgentIntentKind;
    fileTitleQuery?: string;
    pathHint?: string;
    targetOwnerHint?: string;
    sensitivity?: "public" | "friends" | "private";
}
export interface DocumentAgentTurnDeps {
    message: string;
    listLibraryItems: (query?: string) => Promise<LibraryItem[]>;
    getBonds: () => Promise<BondRecord[]>;
    executeTool: (toolName: string, params: DocumentAgentToolParams) => Promise<DocumentAgentToolResult>;
    knowledgeQuery: (question: string) => Promise<string>;
    /** Required for request_share_from — queries bonded peers' published catalogs. */
    discoverPublishedLibrary?: (params?: DiscoverPublishedLibraryParams) => Promise<DiscoverPublishedLibraryPeerResult[]>;
    /** Required for request_share_from — sends chat.message to contact. */
    sendChat?: (targetOwnerId: string, text: string) => Promise<SendChatResult | void>;
}
/** Classify owner message into a document workflow (heuristic v1 — no extra LLM call). */
export declare function classifyDocumentIntent(message: string): ClassifiedDocumentIntent;
export { resolveBondTarget } from "./bond-target.js";
export declare function matchLibraryItem(items: LibraryItem[], hint: string | undefined): LibraryItem | undefined;
export declare function runDocumentAgentTurn(deps: DocumentAgentTurnDeps): Promise<DocumentAgentTurnResult>;
//# sourceMappingURL=document-agent-loop.d.ts.map