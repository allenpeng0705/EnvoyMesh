/**
 * F10.3.2: `RemoteMeshSubmitter` — the cross-node `MeshSubmitter`.
 *
 * **What this is:** the standard `MeshSubmitter` implementation
 * for sub-agents that run on a remote worker node (not locally).
 * Lives in Package 3 (`envoy-harness-adapter`) because the
 * cross-node concern is at the mesh boundary — the package
 * boundary doc (`docs/boundary.{en,zh}.md`) says
 * "envoy-harness-adapter is the ONLY place that knows about
 * both envoy-harness and the mesh."
 *
 * **The transport seam:** the host injects a
 * `RemoteSubmitterTransport`. The transport is the thing that
 * actually talks to the mesh (libp2p, the wire envelope, the
 * peer routing). The submitter is a thin wrapper: it just
 * forwards `submit()` → `transport.send()` and returns the
 * result. **The transport owns all crypto** (parent request
 * signing + worker result verification); envoy-harness-adapter
 * doesn't know about Ed25519, secp256k1, etc. — same DI pattern
 * as F8's `defaultSignResult`.
 *
 * **Why the transport is opaque:** the result returned by
 * `transport.send()` is `SubagentResult` with the worker's
 * signature in `signature` (already verified by the transport).
 * The submitter doesn't re-verify. The host's transport
 * implementation closes over the worker's public key + the
 * parent's private key (for request signing).
 *
 * **No default transport.** Unlike F8's `defaultBuildAgent` /
 * `defaultSignResult`, F10.3.2 doesn't ship a default
 * `RemoteSubmitterTransport`. v0: the host (Tauri app, CLI)
 * provides one. The transport implementation lives in EnvoyMesh
 * (the sibling monorepo) — it knows the mesh protocol.
 *
 * **Result signature is mandatory.** The `SubagentResult.signature`
 * field is non-empty after the transport returns. The
 * `LocalMeshSubmitter` (Package 1) leaves it empty for local
 * sub-agents (no trust boundary); the `RemoteMeshSubmitter` only
 * works when the transport produces a signed result. The
 * transport is responsible for this.
 *
 * **Stability:** the public surface is `RemoteMeshSubmitter`
 * (class) + `RemoteMeshSubmitterOptions` (constructor opts) +
 * `RemoteSubmitterTransport` (interface). Additive; new fields
 * don't break existing callers.
 */
import type { MeshSubmitter, SubagentInput, SubagentResult } from "@envoymesh/envoy-harness";
/**
 * F10.3.2: the cross-node transport seam. The host injects an
 * implementation; envoy-harness-adapter doesn't ship one.
 *
 * **What the transport does:**
 * 1. Signs the request with the parent's private key
 *    (so the worker knows the request is from a known
 *    parent; the worker verifies with the parent's
 *    public key).
 * 2. Sends the request over the mesh to the target peer
 *    (libp2p, circuit relay, etc.).
 * 3. Receives the worker's response (a `SubagentResult`
 *    with `signature` filled in by the worker).
 * 4. Verifies the worker's signature using the worker's
 *    public key (so the parent knows the response is from
 *    the claimed worker).
 * 5. Returns the verified `SubagentResult`.
 *
 * **Why the transport does the crypto:** envoy-harness-adapter
 * is a thin bridge; it doesn't import a crypto library. The
 * transport closes over whatever crypto the host uses
 * (Ed25519, HMAC, etc.). Same pattern as F8's
 * `defaultSignResult` — the closure hides the implementation.
 *
 * **Why the result already has `signature`:** the worker signs
 * the result BEFORE returning it. The transport carries the
 * signature back as part of the `SubagentResult` (the
 * `signature` field). The parent (envoy-harness-adapter)
 * doesn't re-verify; the transport already did.
 *
 * **Abort:** the transport MUST honor the `signal`. When
 * the parent aborts, the transport should cancel the
 * in-flight send/recv and throw an `AbortError` (or
 * similar). The submitter propagates the error.
 */
export interface RemoteSubmitterTransport {
    /**
     * Send a sub-agent request to a remote worker; return
     * the verified result.
     *
     * @param input - The `SubagentInput` from the parent's
     *  `task` tool call.
     * @param targetPeerId - The worker peer's id (from
     *  `RemoteMeshSubmitterOptions.targetPeerId`).
     * @param signal - The parent's abort signal. When fired,
     *  the transport should cancel the in-flight send/recv.
     * @returns The verified `SubagentResult` (with
     *  `signature` filled in by the worker; verified by
     *  the transport).
     */
    send(input: SubagentInput, targetPeerId: string, signal: AbortSignal): Promise<SubagentResult>;
}
/**
 * Options for `RemoteMeshSubmitter`.
 */
export interface RemoteMeshSubmitterOptions {
    /**
     * The transport that actually talks to the mesh. Host-injected;
     * the adapter doesn't ship a default. The transport closes
     * over the parent's private key (for request signing) and
     * the worker's public key (for result verification).
     */
    transport: RemoteSubmitterTransport;
    /**
     * The worker peer to send the sub-agent to. The submitter
     * forwards this on every `submit()` call. v0: one peer
     * per submitter. Future: dynamic routing via
     * `SubagentInput.preferredPeerId` (the model can override
     * per-call).
     */
    targetPeerId: string;
}
/**
 * F10.3.2: a `MeshSubmitter` that runs the sub-agent on a
 * remote worker. v0: thin wrapper over `RemoteSubmitterTransport`.
 * The transport does all the work (signing, sending, verifying);
 * the submitter is the standard interface that the parent's
 * `task` tool calls.
 *
 * **Why a class, not a function:** the parent's
 * `AgentOptions.meshSubmitter` expects a `MeshSubmitter`
 * (interface with a `submit` method). A class is the
 * natural shape; future state (caching, retry, etc.) is
 * additive without breaking the interface.
 *
 * **Why so thin:** the real complexity is in the transport
 * (mesh protocol, libp2p, crypto). envoy-harness-adapter's
 * job is to PROVIDE the standard interface over whatever
 * the host's transport does. F10.4+ can add caching,
 * retry, or fallback logic here without touching the
 * transport.
 */
export declare class RemoteMeshSubmitter implements MeshSubmitter {
    private readonly transport;
    private readonly targetPeerId;
    constructor(options: RemoteMeshSubmitterOptions);
    /**
     * Send the sub-agent to the remote worker. Returns the
     * verified result.
     *
     * **What this does:** forwards to `transport.send()`
     * with the configured `targetPeerId`. The transport
     * handles signing, sending, receiving, and verifying.
     * This method is a 1-line wrapper; the value is the
     * standard `MeshSubmitter` interface that the parent's
     * `task` tool can call.
     *
     * **Error propagation:** any error from the transport
     * (network, signature mismatch, timeout) propagates
     * to the parent's agent loop, which turns it into an
     * `isError: true` tool_result.
     *
     * **Abort:** the parent's abort signal is forwarded
     * to the transport. The transport is responsible for
     * canceling the in-flight send/recv.
     */
    submit(input: SubagentInput, signal: AbortSignal): Promise<SubagentResult>;
}
//# sourceMappingURL=remote-mesh-submitter.d.ts.map