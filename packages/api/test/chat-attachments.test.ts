import { describe, expect, it } from "vitest";
import {
  chatWireAttachmentsToContent,
  deferredDirectChatAttachmentKey,
  AUDIO_MESSAGE_FALLBACK_TEXT,
  isAudioPlaceholderChatText,
  resolveInboundChatDisplayText,
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

describe("resolveInboundChatDisplayText", () => {
  it("returns fallback for audio-only messages", () => {
    expect(
      resolveInboundChatDisplayText("", [
        { mimeType: "audio/mp4" },
      ]),
    ).toBe(AUDIO_MESSAGE_FALLBACK_TEXT);
  });

  it("preserves non-empty text", () => {
    expect(resolveInboundChatDisplayText("hello", [{ mimeType: "audio/webm" }])).toBe("hello");
  });
});

describe("isAudioPlaceholderChatText", () => {
  it("matches the standard voice-note placeholder", () => {
    expect(isAudioPlaceholderChatText(AUDIO_MESSAGE_FALLBACK_TEXT)).toBe(true);
    expect(isAudioPlaceholderChatText(`  ${AUDIO_MESSAGE_FALLBACK_TEXT}  `)).toBe(true);
    expect(isAudioPlaceholderChatText("Hello")).toBe(false);
    expect(isAudioPlaceholderChatText(undefined)).toBe(false);
  });
});
