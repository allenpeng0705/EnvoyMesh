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
import type { RequestHandler } from "@envoymesh/envoy-harness";
import type { AgentAdapter } from "@envoymesh/agent-adapter";
import { type PeerVerifier } from "./envelope.js";
import type { PeerEventSink } from "./events.js";
export interface PeerServerOptions {
    /** The MAP adapter that executes + verifies + advertises this peer. */
    adapter: AgentAdapter;
    /** Identity advertisement for `peer/ping`. */
    identity: {
        peerId: string;
        model?: string;
        ownerId?: string;
    };
    /** D7 — when set, every request must carry a valid envelope signature. */
    verifier?: PeerVerifier;
    /** D7 — observability sink for request/response events. */
    onEvent?: PeerEventSink;
    /**
     * When true, every `peer/submit` runs `adapter.verify` after execute
     * and returns the combined verdict in the response (the honest-verdict
     * path). Enable only when the adapter's verify is cheap (rule-based) —
     * an LLM verifier doubles the cost per submit. When the verifier
     * throws, the submit still succeeds but the response carries no
     * verdict (the client falls back to its v1 placeholder).
     */
    verifyAfterExecute?: boolean;
    /**
     * Optional cap on how many `verifyAfterExecute` verifications run per
     * server lifetime. Once the cap is reached, subsequent submits skip
     * the automatic verify (the response carries no verdict — the client
     * falls back to its v1 placeholder). This bounds the 2× cost an LLM
     * verifier imposes on every submit. `undefined` = no cap.
     */
    maxVerifyAfterExecute?: number;
}
/** Build a JSON-RPC request handler for the peer dialect. */
export declare function createPeerServerHandler(options: PeerServerOptions): RequestHandler;
//# sourceMappingURL=server.d.ts.map