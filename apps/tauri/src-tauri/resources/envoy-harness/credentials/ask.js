/**
 * Phase C / Item 13 — ask-user credentials backend.
 */
import { CredentialError } from "./types.js";
export function createAskCredentialsProvider(options) {
    const known = options.knownNames ?? [];
    return {
        async resolve(ref, opts) {
            if (ref.source !== "ask") {
                throw new CredentialError(`ask provider cannot resolve source=${ref.source}`, "INVALID");
            }
            const answer = await options.questions.ask({
                prompt: `Enter credential '${ref.name}' (input is not stored in session):`,
                signal: opts.signal,
            });
            if (answer.cancelled || answer.value === "") {
                throw new CredentialError(`credential '${ref.name}' cancelled by user`, "CANCELLED");
            }
            return answer.value;
        },
        list() {
            return known.map((name) => ({ name, source: "ask" }));
        },
    };
}
//# sourceMappingURL=ask.js.map