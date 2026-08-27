/**
 * D2 — the standalone peer wire dialect (MAP-over-JSON-RPC, v1).
 *
 * JSON-RPC methods carried over the harness's existing framing
 * (`JsonRpcConnection` / Content-Length):
 *
 * - `peer/ping`     → `{ ok: true, peerId, model }` (readiness/identity)
 * - `peer/submit`   → `ExecuteInput` → `PeerSubmitResponse`
 *                     (`{ result, verdict? }` — the verdict is present
 *                     when the server ran `adapter.verify` after execute)
 * - `peer/verify`   → `VerifyInput` → `Verdict[]` (MAP verify)
 * - `peer/manifest` → `BuildManifestInput` → `CapabilityManifest`
 */
import type { SignedAgentResult, Verdict } from "@envoymesh/protocol";
export declare const PEER_PING_METHOD = "peer/ping";
export declare const PEER_SUBMIT_METHOD = "peer/submit";
export declare const PEER_VERIFY_METHOD = "peer/verify";
export declare const PEER_MANIFEST_METHOD = "peer/manifest";
/**
 * `peer/submit` response body. `verdict` is additive: present when the
 * server-side `verifyAfterExecute` is enabled, absent otherwise (the
 * client falls back to its v1 placeholder verdict).
 */
export interface PeerSubmitResponse {
    result: SignedAgentResult;
    verdict?: Verdict;
}
/** `peer/ping` response body. */
export interface PeerPingResult {
    ok: true;
    /** The peer's identity / model advertisement (v1: echo of caller). */
    peerId?: string;
    model?: string;
}
//# sourceMappingURL=messages.d.ts.map