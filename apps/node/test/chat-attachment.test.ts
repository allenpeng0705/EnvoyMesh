import { describe, expect, it } from "vitest";
import { createShareRequestPayload, ShareRequestPayloadSchema } from "@envoymesh/protocol";
describe("chat attachment protocol", () => {
  it("ShareRequestPayloadSchema accepts deliveryChannel chat", () => {
    const payload = createShareRequestPayload({
      requestType: "file",
      relativePath: "chat/out/abc/photo.jpg",
      requestedSensitivity: "friends",
      fileOrigin: "sender",
      deliveryChannel: "chat",
    });
    expect(ShareRequestPayloadSchema.parse(payload).deliveryChannel).toBe("chat");
  });

  it("defaults deliveryChannel to inbox", () => {
    const payload = createShareRequestPayload({
      requestType: "file",
      relativePath: "docs/note.md",
      fileOrigin: "sender",
    });
    expect(payload.deliveryChannel).toBe("inbox");
  });
});
