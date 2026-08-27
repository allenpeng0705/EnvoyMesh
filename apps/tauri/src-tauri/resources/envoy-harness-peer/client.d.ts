/**
 * D2 — `PeerClient`: a typed JSON-RPC client for a standalone
 * envoy-harness peer. Wraps a `JsonRpcConnection` (the shared framing
 * from the ACP/SDK codec) and exposes the peer dialect.
 */
import { JsonRpcConnection, type SubagentInput, type SubagentResult } from "@envoymesh/envoy-harness";
import type { BuildManifestInput, ExecuteInput, VerifyInput } from "@envoymesh/agent-adapter";
import type { CapabilityManifest, SignedAgentResult, Verdict } from "@envoymesh/protocol";
import { type PeerSubmitResponse } from "./messages.js";
import { type PeerSigner } from "./envelope.js";
import type { PeerEventSink } from "./events.js";
export interface PeerClientOptions {
    connection: JsonRpcConnection;
    /** Request timeout for each call (default 30s). */
    requestTimeoutMs?: number;
    /**
     * Extra budget added to `peer/submit`'s timeout on top of the task's
     * `deadlineMs` (default 5s). The peer runs its own model under the
     * deadline; the buffer covers transport + JSON-RPC framing. Widen it
     * for hosts on slow links / busy nodes with short-deadline tasks.
     */
    submitResponseBufferMs?: number;
    /** D7 — when set, every request is enveloped with a signature. */
    signer?: PeerSigner;
    /** D7 — observability sink for request/response events. */
    onEvent?: PeerEventSink;
}
export declare class PeerClient {
    #private;
    constructor(options: PeerClientOptions);
    /** `peer/ping` — readiness + identity advertisement. */
    ping(): Promise<{
        ok: true;
        peerId?: string;
        model?: string;
    }>;
    /** `peer/submit` — submit a task to the peer and await the result. */
    submit(input: SubagentInput, signal?: AbortSignal): Promise<SubagentResult>;
    /**
     * `peer/submit` — MAP `ExecuteInput` → the submit response (signed
     * result + optional server verdict).
     */
    executeWithVerdict(input: ExecuteInput, signal?: AbortSignal): Promise<PeerSubmitResponse>;
    /** `peer/submit` — MAP `ExecuteInput` → `SignedAgentResult` (verdict dropped). */
    execute(input: ExecuteInput, signal?: AbortSignal): Promise<SignedAgentResult>;
    /** `peer/verify` — ask the peer to verify a result. */
    verify(input: VerifyInput, signal?: AbortSignal): Promise<Verdict[]>;
    /** `peer/manifest` — the peer's capability manifest. */
    manifest(input: BuildManifestInput, signal?: AbortSignal): Promise<CapabilityManifest>;
}
//# sourceMappingURL=client.d.ts.map