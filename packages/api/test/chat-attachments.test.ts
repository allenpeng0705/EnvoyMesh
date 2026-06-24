import { describe, expect, it } from "vitest";
import {
  chatWireAttachmentsToContent,
  deferredDirectChatAttachmentKey,
} from "../src/chat-attachments.js";

describe("chatWireAttachmentsToContent", () => {
  it("maps wire attachments without vault paths by default", () => {
    const wire = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        filename: "voice-note.webm",
        mimeType: "audio/webm;codecs=opus",
        sizeBytes: 12_345,
        sensitivity: "friends" as const,
      },
    ];
    expect(chatWireAttachmentsToContent(wire)).toEqual([
      {
        id: wire[0]!.id,
        filename: "voice-note.webm",
        mimeType: "audio/webm;codecs=opus",
        sizeBytes: 12_345,
        sensitivity: "friends",
      },
    ]);
  });
});

describe("deferredDirectChatAttachmentKey", () => {
  it("normalizes whitespace in key parts", () => {
    expect(
      deferredDirectChatAttachmentKey(" envoy:owner:abc ", " msg-id ", " att-id "),
    ).toBe("envoy:owner:abc\nmsg-id\natt-id");
  });
});
