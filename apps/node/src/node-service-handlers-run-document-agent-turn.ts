/**
 * runDocumentAgentTurn + _runDocumentAgentTurnCore runtime (Step 27).
 *
 * Extracted from `node-service-impl.ts`. This is the legacy
 * document-agent turn pipeline (deprecated; runOwnerAgentTurn is
 * the new entry point). Kept for one release for RPC compatibility.
 */
import { stripModelThinking } from "@envoymesh/api";
import type {
  DocumentAgentTurnResult,
  LibraryItem,
} from "@envoymesh/api";

export interface RunDocumentAgentTurnContext {
  /** Get the tool-execution context (throws if not ready). */
  requireToolExecutionContext(): Promise<unknown>;
  /** List library items (document discovery). */
  listLibraryItems(query?: { query: string }): Promise<LibraryItem[]>;
  /** Get current bond list. */
  getBonds(): Promise<unknown[]>;
  /** Execute a tool by name (uses the tool-execution context). */
  executeTool(toolName: string, params: unknown): Promise<unknown>;
  /** Knowledge query (RAG / knowledge base). */
  knowledgeQuery(question: string): Promise<string>;
  /** Discover a peer's published library. */
  discoverPublishedLibrary(params: unknown): Promise<unknown>;
  /** Send a chat message to an agent. */
  sendAgentChat(targetOwnerId: string, text: string): Promise<unknown>;
  /** Record a turn to the H2A activity store (used by runDocumentAgentTurn). */
  recordH2aOwnerTurn(message: string, turn: unknown): Promise<void>;
  /** Run the core document-agent turn (used by runDocumentAgentTurn). */
  runDocumentAgentTurnCore(message: string): Promise<DocumentAgentTurnResult>;
}

/** The underlying document-agent loop (passed in to keep this runtime pure). */
export type RunDocumentAgentTurnLoop = (input: {
  message: string;
  listLibraryItems: (query: { query: string }) => Promise<LibraryItem[]>;
  getBonds: () => Promise<unknown[]>;
  executeTool: (toolName: string, params: unknown) => Promise<unknown>;
  knowledgeQuery: (question: string) => Promise<string>;
  discoverPublishedLibrary: (p: unknown) => Promise<unknown>;
  sendChat: (targetOwnerId: string, text: string) => Promise<unknown>;
}) => Promise<{ answer: string }>;

export async function runDocumentAgentTurnCoreViaRuntime(
  ctx: RunDocumentAgentTurnContext,
  loop: RunDocumentAgentTurnLoop,
  message: string,
): Promise<DocumentAgentTurnResult> {
  const context = await ctx.requireToolExecutionContext();
  const turn = await loop({
    message,
    listLibraryItems: (query) =>
      ctx.listLibraryItems(query ? { query: query.query } : undefined),
    getBonds: () => ctx.getBonds(),
    executeTool: (toolName, params) =>
      ctx.executeTool(toolName, params),
    knowledgeQuery: (question) => ctx.knowledgeQuery(question),
    discoverPublishedLibrary: (p) => ctx.discoverPublishedLibrary(p),
    sendChat: (targetOwnerId, text) => ctx.sendAgentChat(targetOwnerId, text),
  });
  return { ...turn, answer: stripModelThinking(turn.answer) } as DocumentAgentTurnResult;
}

export async function runDocumentAgentTurnViaRuntime(
  ctx: RunDocumentAgentTurnContext,
  message: string,
): Promise<DocumentAgentTurnResult> {
  console.warn(
    "[EnvoyMesh] runDocumentAgentTurn is deprecated — use runOwnerAgentTurn from Assistant; RPC retained for one release.",
  );
  const turn = await ctx.runDocumentAgentTurnCore(message);
  await ctx.recordH2aOwnerTurn(message, turn);
  return turn;
}