import { vi } from "vitest";
import type { OutboundDeliverMesh, OutboundExpectReplyMesh } from "../../src/chat-outbound-deliver.js";

/** Minimal mesh mock for `sendEnvelopeWithRetry` / `sendExpectReplyWithRetry` unit tests. */
export function createOutboundMeshMock(
  overrides: Partial<OutboundDeliverMesh & { sendExpectReply?: OutboundExpectReplyMesh["sendExpectReply"] }> = {},
) {
  return {
    send: vi.fn().mockResolvedValue(0),
    closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
    ensurePeerReachable: vi.fn().mockResolvedValue({ connected: true, direct: true }),
    getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    ...overrides,
  };
}
