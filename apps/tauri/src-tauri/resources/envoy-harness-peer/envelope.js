/**
 * D7 — signed peer envelopes.
 *
 * v1 used a shared-token transport with no per-message integrity. D7
 * adds an OPTIONAL Ed25519-style sign/verify seam: when both sides
 * configure signing, every request travels as `{ payload, signature }`
 * where the signature covers the canonical JSON of `{ method, payload }`.
 * The host injects the actual crypto (e.g. EnvoyMesh's
 * `signCanonicalPayload` / verify over the node's Ed25519 key).
 */
/** Canonical serialization the signature covers. */
export function canonicalPeerPayload(method, payload) {
    return JSON.stringify({ method, payload });
}
export function wrapEnvelope(method, payload, sign) {
    return {
        payload,
        signature: sign(canonicalPeerPayload(method, payload)),
    };
}
export function unwrapEnvelope(method, envelope, verify) {
    if (!verify(canonicalPeerPayload(method, envelope.payload), envelope.signature)) {
        throw new Error(`peer envelope signature verification failed (${method})`);
    }
    return envelope.payload;
}
//# sourceMappingURL=envelope.js.map