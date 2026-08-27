/**
 * Phase C / Item 13 — env-var credentials backend.
 */
import { CredentialError } from "./types.js";
export function createEnvCredentialsProvider(options = {}) {
    const env = options.env ?? process.env;
    const known = options.knownNames ?? [];
    return {
        async resolve(ref) {
            if (ref.source !== "env") {
                throw new CredentialError(`env provider cannot resolve source=${ref.source}`, "INVALID");
            }
            const key = ref.key ?? ref.name;
            const value = env[key];
            if (value === undefined || value === "") {
                throw new CredentialError(`env credential '${key}' is not set`, "NOT_FOUND");
            }
            return value;
        },
        list() {
            return known.map((name) => ({ name, source: "env" }));
        },
    };
}
//# sourceMappingURL=env.js.map