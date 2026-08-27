/**
 * Model-only user-role context (skill catalog, memory index, plan)
 * must not appear as human chat bubbles in EH / Social / EnvoyGo.
 */
import type { Message } from "../tools/types.js";
/** True when `text` is turn-context injection, not a human prompt. */
export declare function isEphemeralUserContextText(text: string): boolean;
/** Skip model-only user messages when building chat transcripts. */
export declare function isEphemeralUserMessage(msg: Message): boolean;
/**
 * Insert ephemeral turn context immediately before this turn's user
 * prompt (the trailing user message). Not persisted to the session.
 */
export declare function injectEphemeralUserContext(messages: readonly Message[], ephemeralText: string): Message[];
//# sourceMappingURL=ephemeral-user-context.d.ts.map