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
      expect(audio?.getAttribute("src")).toContain("data:audio/webm;base64,");
    });
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

  it("hides placeholder transcription text", async () => {
    mockNodeService();
    mockReadLibraryItemContent.mockResolvedValue({
      mimeType: "audio/webm",
      contentBase64: btoa("fake-audio-bytes"),
    });
    renderWithI18n(
      <ChatAudioAttachment
        attachment={{
          id: "test-att-6",
          filename: "voice.webm",
          mimeType: "audio/webm",
          sizeBytes: 24000,
          sensitivity: "friends",
          vaultRelativePath: "chat/out/uuid/voice.webm",
        }}
        transcription="[Audio message — no transcription available]"
      />,
    );
    await waitFor(() => {
      expect(document.querySelector("audio")).toBeTruthy();
    });
    expect(screen.queryByText("[Audio message — no transcription available]")).toBeNull();
  });
});
