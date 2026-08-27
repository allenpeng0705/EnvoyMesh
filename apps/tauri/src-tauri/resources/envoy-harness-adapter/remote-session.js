/**
 * Phase G — remote session resume transport seam (item 14b).
 *
 * Package 1 `--resume-remote` stubs with "requires mesh adapter".
 * Hosts inject a transport that fetches a durable session
 * projection from a peer; this helper hydrates local shape.
 */
/**
 * Fetch a remote session projection. Does not write to disk —
 * the host decides how to materialize into Package 1's
 * PersistedSession / SessionStore.
 */
export async function loadRemoteSession(transport, ref, opts) {
    const signal = opts?.signal ?? new AbortController().signal;
    return transport.fetch(ref, { signal });
}
//# sourceMappingURL=remote-session.js.map