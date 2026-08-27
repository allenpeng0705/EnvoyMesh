/**
 * NoopMeshSubmitter — a `MeshSubmitter` that throws on
 * every call.
 *
 * **Why this exists:** the `task` tool is only
 * registered when the host provides a `MeshSubmitter`
 * (per the `AgentOptions.meshSubmitter` opt-in). If
 * the host forgets to provide one, the `task` tool
 * isn't registered at all — so the model can't even
 * call it.
 *
 * **So why a `NoopMeshSubmitter` at all?** two
 * reasons:
 *
 * 1. **Test surface.** Tests can construct a
 *    `NoopMeshSubmitter` and assert on the throw
 *    (e.g. "the test for a missing submitter
 *    doesn't accidentally pass because the tool
 *    wasn't registered").
 *
 * 2. **Forward-compat.** A future chunk may
 *    auto-register the `task` tool with a no-op
 *    submitter (so the model knows the tool exists
 *    but learns the error message). v0 doesn't do
 *    this; the host must opt in.
 *
 * **Why throw, not return a "failed" result:** a
 * silent no-op is a footgun. The model might call
 * the tool and think the sub-agent ran; the parent
 * gets a "failed" verdict and acts on it. An
 * exception is louder: the model's tool call
 * result shows the error, and the parent sees that
 * the sub-agent infrastructure isn't configured.
 *
 * **Stability:** the public surface is
 * `NoopMeshSubmitter` (class) + the error message
 * (a string constant, exported for tests). Additive.
 */
/** The error message. Exported so tests can assert
 *  on it without duplicating the string. */
export const NOOP_MESH_SUBMITTER_ERROR = "task tool called but no MeshSubmitter is configured. " +
    "Set AgentOptions.meshSubmitter to a LocalMeshSubmitter " +
    "(or a future RemoteMeshSubmitter).";
/** A `MeshSubmitter` that throws on every call. */
export class NoopMeshSubmitter {
    async submit(_input, _signal) {
        throw new Error(NOOP_MESH_SUBMITTER_ERROR);
    }
}
//# sourceMappingURL=noop-submitter.js.map