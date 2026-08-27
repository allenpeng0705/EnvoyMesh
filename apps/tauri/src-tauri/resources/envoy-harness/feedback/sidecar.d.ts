/**
 * Phase D / Item 16 — per-message feedback sidecar CRUD.
 *
 * Sidecar lives next to the session JSONL as
 * `<sessionId>.feedback.json`.
 */
import type { MessageFeedback } from "./types.js";
export interface FeedbackSidecar {
    list(): Promise<readonly MessageFeedback[]>;
    put(entry: Omit<MessageFeedback, "updatedAt"> & {
        updatedAt?: string;
    }): Promise<MessageFeedback>;
    delete(messageIndex: number): Promise<boolean>;
    readonly filePath: string;
}
export interface FeedbackSidecarOptions {
    /** Session JSONL path OR session id + dir. */
    sessionFilePath: string;
}
/**
 * Open a CRUD sidecar next to a session file.
 */
export declare function createFeedbackSidecar(options: FeedbackSidecarOptions): FeedbackSidecar;
//# sourceMappingURL=sidecar.d.ts.map