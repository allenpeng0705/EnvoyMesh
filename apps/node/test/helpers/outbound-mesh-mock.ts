import { vi } from "vitest";
import type {
  OutboundCallDeliverMesh,
  OutboundDeliverMesh,
  OutboundExpectReplyMesh,
} from "../../src/chat-outbound-deliver.js";

/** Minimal mesh mock for outbound deliver / retry unit tests. */
export function createOutboundMeshMock(
  overrides: Partial<
    OutboundDeliverMesh &
      OutboundCallDeliverMesh & { sendExpectReply?: OutboundExpectReplyMesh["sendExpectReply"] }
  > = {},
) {
  return {
    send: vi.fn().mockResolvedValue(0),
    sendChat: vi.fn().mockResolvedValue(0),
    closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
    ensurePeerReachable: vi.fn().mockResolvedValue({ connected: true, direct: true }),
    getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    ...overrides,
  };
}
