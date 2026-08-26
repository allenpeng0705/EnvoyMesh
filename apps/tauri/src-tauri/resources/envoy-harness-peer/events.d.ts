/**
 * D7 — peer observability: typed lifecycle events the host can wire into
 * envoy-harness's trace/telemetry sinks (or any logger).
 */
export type PeerEvent = {
    type: "peer.request";
    method: string;
    peerId?: string;
    startedAt: number;
} | {
    type: "peer.response";
    method: string;
    peerId?: string;
    ok: boolean;
    durationMs: number;
    error?: string;
} | {
    /** U3 follow-up — a peer connection succeeded. */
    type: "peer.connected";
    peerId: string;
    at: number;
} | {
    /** U3 follow-up — a peer connection was closed / never usable. */
    type: "peer.disconnected";
    peerId: string;
    at: number;
} | {
    /** U3 follow-up — a peer connect failed (fail-open). */
    type: "peer.failed";
    peerId: string;
    error: string;
    at: number;
} | {
    /** U3 follow-up — a health ping result (RTT / down). */
    type: "peer.health";
    peerId: string;
    ok: boolean;
    rttMs?: number;
    error?: string;
    at: number;
};
export type PeerEventSink = (event: PeerEvent) => void;
//# sourceMappingURL=events.d.ts.map