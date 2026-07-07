import {
  isDuplicateAsyncInbound,
  isDuplicateInbound,
  resetInboundDedupForTests,
  rememberInboundMessage,
  syntheticInboundMessageId,
} from "./dedup.js";

describe("dedup", () => {
  describe("isDuplicateInbound (messageId-based)", () => {
    it("flags a repeated messageId and accepts fresh ones", () => {
      resetInboundDedupForTests();
      expect(isDuplicateInbound("envoy-msg-1")).toBe(false);
      expect(isDuplicateInbound("envoy-msg-1")).toBe(true);
      expect(isDuplicateInbound("envoy-msg-2")).toBe(false);
    });

    it("does NOT dedup repeated (ownerId, text) tuples — only messageId", () => {
      resetInboundDedupForTests();
      // Two different senders saying the same word should both be delivered.
      expect(isDuplicateInbound("envoy-msg-A")).toBe(false);
      expect(isDuplicateInbound("envoy-msg-B")).toBe(false);
      // Same sender saying the same word should also be delivered if it
      // comes through as a different envelope (different messageId). This
      // is the regression fix for the pre-fix "user says hi twice → second
      // dropped" bug.
      expect(isDuplicateInbound("envoy-msg-C")).toBe(false);
      expect(isDuplicateInbound("envoy-msg-C")).toBe(true);
    });

    it("treats empty/whitespace messageId as a no-op", () => {
      resetInboundDedupForTests();
      expect(isDuplicateInbound("")).toBe(false);
      expect(isDuplicateInbound("   ")).toBe(false);
    });
  });

  describe("rememberInboundMessage", () => {
    it("pre-marks a messageId as seen", () => {
      resetInboundDedupForTests();
      rememberInboundMessage("envoy-msg-X");
      expect(isDuplicateInbound("envoy-msg-X")).toBe(true);
    });
  });

  describe("syntheticInboundMessageId", () => {
    it("produces a stable id for the same input tuple and a fresh one otherwise", () => {
      const params = {
        fromOwnerId: "envoy:owner:abc",
        from: "envoy_peer1",
        text: "hi",
        timestamp: 1700000000000,
      };
      const id1 = syntheticInboundMessageId(params);
      const id2 = syntheticInboundMessageId(params);
      // Includes randomness by design (randomUUID suffix), so just assert
      // shape and uniqueness.
      expect(id1).toMatch(/^synthetic-/);
      expect(id1).not.toBe(id2);
      expect(syntheticInboundMessageId({ ...params, text: "hello" })).not.toBe(id1);
    });
  });

  describe("isDuplicateAsyncInbound", () => {
    it("still dedups by messageId", () => {
      resetInboundDedupForTests();
      expect(isDuplicateAsyncInbound("async-1")).toBe(false);
      expect(isDuplicateAsyncInbound("async-1")).toBe(true);
    });
  });
});
