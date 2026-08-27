/**
 * D3 — `createPeerServerHandler`: the request handler that answers the
 * MAP-over-JSON-RPC peer dialect on the server side, backed by an
 * `AgentAdapter` (for envoy-harness: the live `EnvoyHarnessAdapter`).
 *
 * - `peer/submit`   → `adapter.execute(ExecuteInput)` →
 *                     `PeerSubmitResponse` (`{ result, verdict? }`)
 * - `peer/verify`   → `adapter.verify(VerifyInput)` → `Verdict[]`
 * - `peer/manifest` → `adapter.buildManifest(BuildManifestInput)` → manifest
 * - `peer/ping`     → readiness + identity/model advertisement
 */
import { combinePeerVerdicts } from "./scoreboard.js";
import { PEER_MANIFEST_METHOD, PEER_PING_METHOD, PEER_SUBMIT_METHOD, PEER_VERIFY_METHOD, } from "./messages.js";
import { unwrapEnvelope } from "./envelope.js";
/** Build a JSON-RPC request handler for the peer dialect. */
export function createPeerServerHandler(options) {
    const { adapter, identity } = options;
    let verifyAfterExecuteCount = 0;
    const unwrap = (method, params) => {
        if (options.verifier !== undefined) {
            return unwrapEnvelope(method, params, options.verifier.verify.bind(options.verifier));
        }
        return params;
    };
    return async (method, params) => {
        const startedAt = Date.now();
        try {
            const result = await (async () => {
                switch (method) {
                    case PEER_PING_METHOD:
                        return {
                            ok: true,
                            peerId: identity.peerId,
                            ...(identity.model !== undefined
                                ? { model: identity.model }
                                : {}),
                        };
                    case PEER_SUBMIT_METHOD: {
                        const input = unwrap(method, params);
                        const executeResult = await adapter.execute(input);
                        if (!options.verifyAfterExecute) {
                            const response = { result: executeResult };
                            return response;
                        }
                        if (options.maxVerifyAfterExecute !== undefined &&
                            verifyAfterExecuteCount >= options.maxVerifyAfterExecute) {
                            // Budget exhausted: skip the verifier rather than charging
                            // the host another LLM call. The client's placeholder
                            // verdict applies (same shape as verifyAfterExecute: false).
                            const response = { result: executeResult };
                            return response;
                        }
                        try {
                            const verdicts = await adapter.verify({
                                result: executeResult,
                                objective: input.objective,
                            });
                            verifyAfterExecuteCount += 1;
                            const response = {
                                result: executeResult,
                                verdict: combinePeerVerdicts(verdicts),
                            };
                            return response;
                        }
                        catch (err) {
                            // A verifier hiccup must not discard a completed result:
                            // return it without a verdict (client placeholder applies).
                            options.onEvent?.({
                                type: "peer.response",
                                method,
                                peerId: identity.peerId,
                                ok: true,
                                durationMs: Date.now() - startedAt,
                                error: `verify-after-execute failed: ${err instanceof Error ? err.message : String(err)}`,
                            });
                            const response = { result: executeResult };
                            return response;
                        }
                    }
                    case PEER_VERIFY_METHOD:
                        return adapter.verify(unwrap(method, params));
                    case PEER_MANIFEST_METHOD: {
                        const input = (unwrap(method, params ?? {}) ??
                            {});
                        const manifest = await adapter.buildManifest({
                            peerId: identity.peerId,
                            ownerId: identity.ownerId ?? identity.peerId,
                            reputationBySkill: input.reputationBySkill ?? {},
                        });
                        return manifest;
                    }
                    default:
                        throw new Error(`unknown peer method: ${method}`);
                }
            })();
            options.onEvent?.({
                type: "peer.response",
                method,
                peerId: identity.peerId,
                ok: true,
                durationMs: Date.now() - startedAt,
            });
            return result;
        }
        catch (err) {
            options.onEvent?.({
                type: "peer.response",
                method,
                peerId: identity.peerId,
                ok: false,
                durationMs: Date.now() - startedAt,
                error: err instanceof Error ? err.message : String(err),
            });
            throw err;
        }
    };
}
//# sourceMappingURL=server.js.map