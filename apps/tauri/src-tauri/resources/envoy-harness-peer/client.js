/**
 * D2 — `PeerClient`: a typed JSON-RPC client for a standalone
 * envoy-harness peer. Wraps a `JsonRpcConnection` (the shared framing
 * from the ACP/SDK codec) and exposes the peer dialect.
 */
import { JsonRpcConnection, } from "@envoymesh/envoy-harness";
import { PEER_MANIFEST_METHOD, PEER_PING_METHOD, PEER_SUBMIT_METHOD, PEER_VERIFY_METHOD, } from "./messages.js";
import { signedResultToSubagentResult, subagentInputToExecuteInput, } from "./mapping.js";
import { wrapEnvelope } from "./envelope.js";
export class PeerClient {
    #connection;
    #requestTimeoutMs;
    #submitResponseBufferMs;
    #signer;
    #onEvent;
    constructor(options) {
        this.#connection = options.connection;
        this.#requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
        this.#submitResponseBufferMs = options.submitResponseBufferMs ?? 5_000;
        this.#signer = options.signer;
        this.#onEvent = options.onEvent;
    }
    /** `peer/ping` — readiness + identity advertisement. */
    async ping() {
        return this.#send(PEER_PING_METHOD, {}, this.#requestTimeoutMs, undefined, "peer ping aborted");
    }
    /** `peer/submit` — submit a task to the peer and await the result. */
    async submit(input, signal) {
        // Convenience: MeshSubmitter-shaped submit → MAP execute → map back.
        const wire = await this.executeWithVerdict(subagentInputToExecuteInput(input, signal ?? new AbortController().signal), signal);
        return signedResultToSubagentResult(wire.result, wire.verdict);
    }
    /**
     * `peer/submit` — MAP `ExecuteInput` → the submit response (signed
     * result + optional server verdict).
     */
    async executeWithVerdict(input, signal) {
        return this.#send(PEER_SUBMIT_METHOD, input, input.deadlineMs + this.#submitResponseBufferMs, signal, "peer submit aborted");
    }
    /** `peer/submit` — MAP `ExecuteInput` → `SignedAgentResult` (verdict dropped). */
    async execute(input, signal) {
        return (await this.executeWithVerdict(input, signal)).result;
    }
    /** `peer/verify` — ask the peer to verify a result. */
    async verify(input, signal) {
        return this.#send(PEER_VERIFY_METHOD, input, this.#requestTimeoutMs, signal, "peer verify aborted");
    }
    /** `peer/manifest` — the peer's capability manifest. */
    async manifest(input, signal) {
        return this.#send(PEER_MANIFEST_METHOD, input, this.#requestTimeoutMs, signal, "peer manifest aborted");
    }
    async #send(method, payload, timeoutMs, signal, abortMessage) {
        const startedAt = Date.now();
        this.#onEvent?.({ type: "peer.request", method, startedAt });
        const params = this.#signer !== undefined
            ? wrapEnvelope(method, payload, this.#signer.sign.bind(this.#signer))
            : payload;
        const requestPromise = this.#connection.request(method, params, timeoutMs);
        try {
            const result = await this.#race(requestPromise, signal, abortMessage);
            this.#onEvent?.({
                type: "peer.response",
                method,
                ok: true,
                durationMs: Date.now() - startedAt,
            });
            return result;
        }
        catch (err) {
            this.#onEvent?.({
                type: "peer.response",
                method,
                ok: false,
                durationMs: Date.now() - startedAt,
                error: err instanceof Error ? err.message : String(err),
            });
            throw err;
        }
    }
    async #race(requestPromise, signal, abortMessage) {
        if (signal === undefined)
            return requestPromise;
        if (signal.aborted)
            throw new Error(abortMessage);
        return new Promise((resolve, reject) => {
            const onAbort = () => reject(new Error(abortMessage));
            signal.addEventListener("abort", onAbort, { once: true });
            requestPromise.then((value) => {
                signal.removeEventListener("abort", onAbort);
                resolve(value);
            }, (err) => {
                signal.removeEventListener("abort", onAbort);
                reject(err);
            });
        });
    }
}
//# sourceMappingURL=client.js.map