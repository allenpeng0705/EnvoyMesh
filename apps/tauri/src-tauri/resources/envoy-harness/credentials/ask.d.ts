/**
 * Phase C / Item 13 — ask-user credentials backend.
 */
import type { UserQuestionService } from "../interaction/user-questions.js";
import type { CredentialsProvider } from "./types.js";
export interface AskCredentialsOptions {
    questions: UserQuestionService;
    /** Names this backend is willing to ask for. */
    knownNames?: readonly string[];
}
export declare function createAskCredentialsProvider(options: AskCredentialsOptions): CredentialsProvider;
//# sourceMappingURL=ask.d.ts.map