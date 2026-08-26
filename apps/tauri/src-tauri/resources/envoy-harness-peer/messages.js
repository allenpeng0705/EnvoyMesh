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
export const PEER_PING_METHOD = "peer/ping";
export const PEER_SUBMIT_METHOD = "peer/submit";
export const PEER_VERIFY_METHOD = "peer/verify";
export const PEER_MANIFEST_METHOD = "peer/manifest";
//# sourceMappingURL=messages.js.map