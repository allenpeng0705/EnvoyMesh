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
export interface PeerSigner {
    sign(payload: string): string;
}
export interface PeerVerifier {
    verify(payload: string, signature: string): boolean;
}
export interface PeerEnvelope<T> {
    payload: T;
    signature: string;
}
/** Canonical serialization the signature covers. */
export declare function canonicalPeerPayload(method: string, payload: unknown): string;
export declare function wrapEnvelope<T>(method: string, payload: T, sign: PeerSigner["sign"]): PeerEnvelope<T>;
export declare function unwrapEnvelope<T>(method: string, envelope: PeerEnvelope<T>, verify: PeerVerifier["verify"]): T;
//# sourceMappingURL=envelope.d.ts.map