/**
 * Phase G — mesh credentials transport seam (item 13).
 *
 * Package 1 rejects `source: "mesh"`. The host injects a
 * transport that fetches secrets over the mesh; this module
 * wraps it as a `CredentialsProvider` for composition outside
 * Package 1.
 */
/**
 * CredentialsProvider that only answers `source: "mesh"`
 * (or omitted source when used behind a mesh-only cascade).
 */
export function createMeshCredentialsProvider(transport) {
    return {
        async resolve(ref, opts) {
            if (ref.source !== undefined && ref.source !== "mesh") {
                throw new Error(`mesh credentials provider cannot resolve source=${ref.source}`);
            }
            return transport.fetch(ref.name, { signal: opts.signal });
        },
        list() {
            return (transport.list?.() ??
                []).map((r) => ({ ...r, source: "mesh" }));
        },
    };
}
//# sourceMappingURL=mesh-credentials.js.map