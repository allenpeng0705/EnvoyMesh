/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { ChatAudioAttachment } from "../../src/components/ChatAudioAttachment.js";
import { useNodeService } from "../../src/hooks/useNodeService.js";

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: vi.fn(),
}));

afterEach(() => {
  cleanup();
  mockReadLibraryItemContent.mockClear();
});

const mockReadLibraryItemContent = vi.fn();

function mockNodeService(overrides: Partial<ReturnType<typeof useNodeService>> = {}) {
  (useNodeService as any).mockReturnValue({
    readLibraryItemContent: mockReadLibraryItemContent,
    isConnected: true,
    ...overrides,
  });
}

describe("ChatAudioAttachment — Phase 37", () => {
  it("shows loading state initially", () => {
    mockNodeService();
    mockReadLibraryItemContent.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithI18n(
      <ChatAudioAttachment
        attachment={{
          id: "test-att-1",
          filename: "voice.webm",
          mimeType: "audio/webm",
          sizeBytes: 24000,
          sensitivity: "friends",
          vaultRelativePath: "chat/out/uuid/voice.webm",
        }}
      />,
    );
    expect(screen.getByText(/loading/i)).toBeDefined();
  });

  it("renders audio element after load", async () => {
    mockNodeService();
    mockReadLibraryItemContent.mockResolvedValue({
      mimeType: "audio/webm",
      contentBase64: btoa("fake-audio-bytes"),
    });
    renderWithI18n(
      <ChatAudioAttachment
        attachment={{
          id: "test-att-2",
          filename: "voice.webm",
          mimeType: "audio/webm",
          sizeBytes: 24000,
          sensitivity: "friends",
          vaultRelativePath: "chat/out/uuid/voice.webm",
        }}
      />,
    );
    await waitFor(() => {
      const audio = document.querySelector("audio");
      expect(audio).toBeTruthy();
      expect(audio?.getAttribute("src")?.startsWith("blob:")).toBe(true);
    });
  });

  it("uses audio/mp4 blob for EnvoyGo m4a voice notes", async () => {
    mockNodeService();
    mockReadLibraryItemContent.mockResolvedValue({
      mimeType: "audio/mp4",
      contentBase64: btoa("fake-m4a-bytes"),
    });
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-m4a");
    try {
      renderWithI18n(
        <ChatAudioAttachment
          attachment={{
            id: "test-att-m4a",
            filename: "voice-note.m4a",
            mimeType: "audio/mp4",
            sizeBytes: 12000,
            sensitivity: "friends",
            vaultRelativePath: "chat/out/uuid/voice-note.m4a",
          }}
        />,
      );
      await waitFor(() => {
        expect(document.querySelector("audio")?.getAttribute("src")).toBe("blob:mock-m4a");
      });
      expect(createObjectURL).toHaveBeenCalled();
      const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("audio/mp4");
    } finally {
      createObjectURL.mockRestore();
    }
  });

  it("shows transcription captions when provided", async () => {
    mockNodeService();
    mockReadLibraryItemContent.mockResolvedValue({
      mimeType: "audio/webm",
      contentBase64: btoa("fake-audio-bytes"),
    });
    renderWithI18n(
      <ChatAudioAttachment
        attachment={{
          id: "test-att-3",
          filename: "voice.webm",
          mimeType: "audio/webm",
          sizeBytes: 24000,
          sensitivity: "friends",
          vaultRelativePath: "chat/out/uuid/voice.webm",
        }}
        transcription="Hello, this is a test."
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Hello, this is a test.")).toBeDefined();
    });
  });

  it("shows error state when load fails", async () => {
    mockNodeService();
    mockReadLibraryItemContent.mockRejectedValue(new Error("vault error"));
    renderWithI18n(
      <ChatAudioAttachment
        attachment={{
          id: "test-att-4",
          filename: "voice.webm",
          mimeType: "audio/webm",
          sizeBytes: 24000,
          sensitivity: "friends",
          vaultRelativePath: "chat/out/uuid/voice.webm",
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/unavailable/i)).toBeDefined();
    });
  });

  it("shows waiting state when vaultRelativePath is missing (transfer in progress)", () => {
    mockNodeService();
    renderWithI18n(
      <ChatAudioAttachment
        attachment={{
          id: "test-att-5",
          filename: "voice.webm",
          mimeType: "audio/webm",
          sizeBytes: 24000,
          sensitivity: "friends",
        }}
      />,
    );
    expect(mockReadLibraryItemContent).not.toHaveBeenCalled();
    expect(screen.getByText(/loading/i)).toBeDefined();
  });
});
