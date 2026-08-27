/**
 * Phase C / Item 13 — composite credentials provider.
 *
 * Resolution order when `source` is omitted by callers that
 * use `resolveByName`: env → file → ask. Explicit `source`
 * skips the cascade.
 */
import { CredentialError } from "./types.js";
/** Create the default cascade provider. */
export function createCredentialsProvider(backends) {
    const revealed = new Set();
    const bySource = (source) => {
        switch (source) {
            case "env":
                return backends.env;
            case "file":
                return backends.file;
            case "ask":
                return backends.ask;
            case "mesh":
                throw new CredentialError("mesh credentials belong in the adapter (Package 3)", "MESH_FORBIDDEN");
        }
    };
    async function resolve(ref, opts) {
        if (ref.source === "mesh") {
            throw new CredentialError("mesh credentials belong in the adapter (Package 3)", "MESH_FORBIDDEN");
        }
        const value = await bySource(ref.source).resolve(ref, opts);
        if (value.length > 0)
            revealed.add(value);
        return value;
    }
    return {
        resolve,
        list() {
            const seen = new Set();
            const out = [];
            for (const p of [backends.env, backends.file, backends.ask]) {
                for (const ref of p.list()) {
                    const key = `${ref.source}:${ref.name}`;
                    if (seen.has(key))
                        continue;
                    seen.add(key);
                    out.push(ref);
                }
            }
            return out;
        },
        async resolveByName(name, opts) {
            for (const source of ["env", "file", "ask"]) {
                try {
                    return await resolve({ name, source }, opts);
                }
                catch (err) {
                    if (err instanceof CredentialError &&
                        (err.code === "NOT_FOUND" || err.code === "CANCELLED")) {
                        continue;
                    }
                    throw err;
                }
            }
            throw new CredentialError(`credential '${name}' not found in env/file/ask`, "NOT_FOUND");
        },
        revealedValues: () => revealed,
    };
}
//# sourceMappingURL=provider.js.map