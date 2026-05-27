import { describe, expect, it } from "vitest";
import { createSyncStatePayload, parseSyncStatePayload, SyncStatePayloadSchema } from "../src/index.js";

describe("sync.state payload", () => {
  it("round-trips scope and update", () => {
    const payload = createSyncStatePayload({
      scope: "assistant-draft:v1",
      updateBase64: "AQID",
      senderOwnerId: "envoy:owner:abc",
    });
    expect(parseSyncStatePayload(payload)).toEqual(payload);
  });

  it("rejects oversized update", () => {
    expect(() =>
      SyncStatePayloadSchema.parse({
        scope: "x",
        updateBase64: "a".repeat(600_000),
        senderOwnerId: "envoy:owner:abc",
      }),
    ).toThrow();
  });
});
