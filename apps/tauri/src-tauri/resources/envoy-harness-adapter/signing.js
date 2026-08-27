/**
 * F8.4+ — `defaultSignResult` helper.
 *
 * The adapter takes `signResult` as a DI closure (per
 * the `AgentAdapter` contract). v0's tests inject a
 * fake that stamps a SHA-256 of the canonical JSON.
 * Production needs real Ed25519 — that's what this
 * module provides.
 *
 * **Why a helper, not a built-in default:** the adapter
 * is runtime-agnostic. It does not import any app-level
 * module. The host provides the signing key. This
 * helper is the *convenience* — call `defaultSignResult(key.privateKeyPem)`
 * once when constructing the adapter, get a closure
 * that does real Ed25519.
 *
 * **What gets signed:** `signCanonicalPayload(input, key)`
 * signs the canonical JSON of `input`. The protocol
 * doc says "the signature covers it so a malicious
 * adapter cannot retroactively edit it" — meaning
 * `raw` is part of what's signed. The full unsigned
 * `AgentResult` (with `raw`) is what we pass to
 * `signCanonicalPayload`, so the signature covers
 * everything.
 *
 * **Stability:** the public surface is `defaultSignResult`.
 * Additive; the helper is in addition to the adapter's
 * existing DI surface.
 */
import { signCanonicalPayload } from "@envoymesh/identity";
/**
 * Build a `signResult` closure that signs with the given
 * Ed25519 private key (PEM). The closure calls
 * `signCanonicalPayload(unsigned)` and returns the
 * `SignedAgentResult` with the signature field.
 *
 * **Host pattern:**
 * ```ts
 * const ownerKey = await generateAgentIdentity(ownerId);
 * const adapter = new EnvoyHarnessAdapter({
 *   ...,
 *   signResult: defaultSignResult(ownerKey.privateKeyPem),
 * });
 * ```
 *
 * **The host controls the key** — the adapter does not
 * generate or hold one. Per the AgentAdapter contract:
 * "the adapter is the **only** place that knows the
 * runtime's specifics" + "the node provisions the
 * adapter with a signing key that the *node* controls
 * (the adapter does not invent one)".
 */
export function defaultSignResult(privateKeyPem) {
    return (unsigned) => {
        const signature = signCanonicalPayload(unsigned, privateKeyPem);
        return { ...unsigned, signature };
    };
}
/**
 * Convenience: build a `signResult` from a key pair object
 * (e.g. the return value of `generateAgentIdentity()`).
 * Equivalent to `defaultSignResult(keyPair.privateKeyPem)`.
 */
export function defaultSignResultFromKeyPair(keyPair) {
    return defaultSignResult(keyPair.privateKeyPem);
}
//# sourceMappingURL=signing.js.map