/**
 * Phase G — remote session resume transport seam (item 14b).
 *
 * Package 1 `--resume-remote` stubs with "requires mesh adapter".
 * Hosts inject a transport that fetches a durable session
 * projection from a peer; this helper hydrates local shape.
 */
export interface RemoteSessionRef {
    originNode: string;
    sessionId: string;
}
/** Opaque durable projection bytes / JSON from a remote node. */
export interface RemoteSessionProjection {
    sessionId: string;
    originNode: string;
    /** JSONL or JSON snapshot the host understands. */
    payload: string;
    checkpointAt?: string;
}
export interface RemoteSessionTransport {
    fetch(ref: RemoteSessionRef, opts: {
        signal: AbortSignal;
    }): Promise<RemoteSessionProjection>;
}
/**
 * Fetch a remote session projection. Does not write to disk —
 * the host decides how to materialize into Package 1's
 * PersistedSession / SessionStore.
 */
export declare function loadRemoteSession(transport: RemoteSessionTransport, ref: RemoteSessionRef, opts?: {
    signal?: AbortSignal;
}): Promise<RemoteSessionProjection>;
//# sourceMappingURL=remote-session.d.ts.map