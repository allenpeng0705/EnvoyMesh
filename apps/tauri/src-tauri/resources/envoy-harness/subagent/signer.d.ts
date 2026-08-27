/**
 * `SubagentResultSigner` — the F10.3.1 seam for cross-node trust.
 *
 * **What this is:** a closure type that takes a `SubagentResult`
 * and returns a signature string. The host injects the
 * implementation; envoy-harness doesn't know (or care) what
 * algorithm the host uses.
 *
 * **Why a closure, not a class:** the host's signing key is
 * already a closure in the F8 pattern (`defaultSignResult` for
 * `SkillResult` in `envoy-harness-adapter`). The same pattern
 * applies here: the host injects a `(result) => string` function;
 * the function closes over the key + the algorithm. envoy-harness
 * just calls it.
 *
 * **Why envoy-harness doesn't ship a default signer:** envoy-harness
 * is a local runtime with zero EnvoyMesh-internal deps. Crypto
 * (Ed25519, secp256k1, etc.) is an EnvoyMesh concern. The host
 * (Tauri app, CLI) injects a signer built on whatever crypto
 * library it already uses.
 *
 * **v0 (F10.3.1) is additive.** The `LocalMeshSubmitter`'s
 * `signer` option is optional. When omitted, the result is
 * unsigned (the F10.1.2 v0 behavior). When provided, the result
 * is signed before returning.
 *
 * **The cross-node path (F10.3.2, envoy-harness-adapter)**
 * uses the same type. The `RemoteMeshSubmitter` will:
 * 1. Sign the *request* (so the worker knows it's from the parent)
 * 2. Receive a signed *result* (so the parent knows it's from the
 *    claimed worker)
 * 3. Verify the result's signature using the worker's public key
 *
 * **What's NOT signed:** the parent of the request also includes
 * the request's input. The host decides what to sign. The simplest
 * host impl signs the canonical JSON of the result (excluding the
 * `signature` field). The signer is opaque; envoy-harness doesn't
 * care.
 *
 * **Stability:** the type is closed (a single function shape).
 * The signature of the function is fixed: `(result) => string`.
 * New signing modes (e.g. multi-sig) are additive — a new closure
 * type, not a breaking change to this one.
 */
import type { SubagentResult } from "./types.js";
/**
 * F10.3.1: a closure that takes a `SubagentResult` and
 * returns a signature string. The host injects the
 * implementation; envoy-harness doesn't know (or care)
 * about the algorithm.
 *
 * **Empty signature = unsigned.** v0 (no signer) returns
 * the F10.1.2 default: an empty string. A signed result
 * is anything non-empty.
 *
 * **Example (host side, with Ed25519):**
 * ```ts
 * const signer: SubagentResultSigner = (result) => {
 *   const canonical = canonicalize(result); // host's choice
 *   return ed25519.sign(canonical, ownerKey).toString("base64");
 * };
 * ```
 */
export type SubagentResultSigner = (result: SubagentResult) => string;
//# sourceMappingURL=signer.d.ts.map