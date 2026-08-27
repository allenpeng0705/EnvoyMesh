/**
 * Phase G — mesh credentials transport seam (item 13).
 *
 * Package 1 rejects `source: "mesh"`. The host injects a
 * transport that fetches secrets over the mesh; this module
 * wraps it as a `CredentialsProvider` for composition outside
 * Package 1.
 */
import type { CredentialReference, CredentialsProvider } from "@envoymesh/envoy-harness";
/** Host-supplied fetch for a named mesh credential. */
export interface MeshCredentialsTransport {
    fetch(name: string, opts: {
        signal: AbortSignal;
    }): Promise<string>;
    /** Optional: advertise refs the transport can resolve. */
    list?(): CredentialReference[];
}
/**
 * CredentialsProvider that only answers `source: "mesh"`
 * (or omitted source when used behind a mesh-only cascade).
 */
export declare function createMeshCredentialsProvider(transport: MeshCredentialsTransport): CredentialsProvider;
//# sourceMappingURL=mesh-credentials.d.ts.map