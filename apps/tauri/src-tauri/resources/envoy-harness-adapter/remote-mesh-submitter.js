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
export class RemoteMeshSubmitter {
    transport;
    targetPeerId;
    constructor(options) {
        this.transport = options.transport;
        this.targetPeerId = options.targetPeerId;
    }
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
    async submit(input, signal) {
        const result = await this.transport.send(input, this.targetPeerId, signal);
        // The class contract says cross-node results are signed and
        // verified by the transport; enforce that the signature is
        // present so an unsigned result can't silently pass through.
        if (!result.signature || result.signature.length === 0) {
            throw new Error("RemoteMeshSubmitter: transport returned an unsigned SubagentResult");
        }
        return result;
    }
}
//# sourceMappingURL=remote-mesh-submitter.js.map