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
  mockReadFamilyAttachment.mockClear();
});

const mockReadLibraryItemContent = vi.fn();
const mockReadFamilyAttachment = vi.fn();

function mockNodeService(overrides: Partial<ReturnType<typeof useNodeService>> = {}) {
  (useNodeService as any).mockReturnValue({
    readLibraryItemContent: mockReadLibraryItemContent,
    readFamilyAttachment: mockReadFamilyAttachment,
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
      const source = audio?.querySelector("source");
      expect(source?.getAttribute("src")?.startsWith("blob:")).toBe(true);
      expect(source?.getAttribute("type")).toBe("audio/webm");
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
        const source = document.querySelector("audio source");
        expect(source?.getAttribute("src")).toBe("blob:mock-m4a");
        expect(source?.getAttribute("type")).toBe("audio/mp4");
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

  it("fetches family-media audio by id and plays a blob (no vault path)", async () => {
    mockNodeService();
    mockReadFamilyAttachment.mockResolvedValue({
      contentBase64: btoa("family-audio-bytes"),
      sizeBytes: "family-audio-bytes".length,
      truncated: false,
    });
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-family-audio");
    try {
      renderWithI18n(
        <ChatAudioAttachment
          attachment={{
            id: "fam-att-1",
            filename: "voice.webm",
            mimeType: "audio/webm",
            sizeBytes: "family-audio-bytes".length,
            sensitivity: "private",
            contentHash: "abc123",
          }}
        />,
      );
      await waitFor(() => {
        const source = document.querySelector("audio source");
        expect(source?.getAttribute("src")).toBe("blob:mock-family-audio");
        expect(source?.getAttribute("type")).toBe("audio/webm");
      });
      // Family-media audio must never hit the vault reader.
      expect(mockReadLibraryItemContent).not.toHaveBeenCalled();
      expect(mockReadFamilyAttachment).toHaveBeenCalled();
      expect(createObjectURL).toHaveBeenCalled();
      const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("audio/webm");
    } finally {
      createObjectURL.mockRestore();
    }
  });

  it("shows unavailable when the family-media read fails", async () => {
    mockNodeService();
    mockReadFamilyAttachment.mockRejectedValue(new Error("family read failed"));
    renderWithI18n(
      <ChatAudioAttachment
        attachment={{
          id: "fam-att-2",
          filename: "note.m4a",
          mimeType: "audio/mp4",
          sizeBytes: 1024,
          sensitivity: "private",
          contentHash: "def456",
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/unavailable/i)).toBeDefined();
    });
    expect(mockReadFamilyAttachment).toHaveBeenCalled();
  });

  it("still waits when vaultRelativePath is missing WITHOUT contentHash", async () => {
    mockNodeService();
    renderWithI18n(
      <ChatAudioAttachment
        attachment={{
          id: "mesh-pending-1",
          filename: "voice.webm",
          mimeType: "audio/webm",
          sizeBytes: 24000,
          sensitivity: "friends",
        }}
      />,
    );
    // A no-path row that is NOT family-media (no contentHash) is a pending
    // mesh upload — the family reader must not be invoked.
    expect(mockReadFamilyAttachment).not.toHaveBeenCalled();
    expect(mockReadLibraryItemContent).not.toHaveBeenCalled();
    expect(screen.getByText(/loading/i)).toBeDefined();
  });
});
