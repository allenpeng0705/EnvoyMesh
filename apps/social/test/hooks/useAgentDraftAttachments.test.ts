/**
 * @vitest-environment jsdom
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAgentDraftAttachments } from "../../src/hooks/useAgentDraftAttachments.js";

describe("useAgentDraftAttachments", () => {
  it("uploads browser files via uploadEnvoyAttachment", async () => {
    const uploadEnvoyAttachment = vi.fn(async () => ({
      ok: true,
      path: "/projects/app/.envoy-attachments/20260101-120000-note.txt",
      name: "20260101-120000-note.txt",
      mimeType: "text/plain",
    }));

    const { result } = renderHook(() =>
      useAgentDraftAttachments({
        projectCwd: "/projects/app",
        uploadEnvoyAttachment,
      }),
    );

    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    await act(async () => {
      await result.current.uploadBrowserFiles([file]);
    });

    await waitFor(() => expect(result.current.attachments).toHaveLength(1));
    expect(uploadEnvoyAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "note.txt",
        targetDir: "/projects/app",
      }),
    );
    expect(result.current.attachments[0]?.path).toContain(".envoy-attachments");
  });

  it("clears preview URLs on remove and clear", async () => {
    const uploadEnvoyAttachment = vi.fn(async () => ({
      ok: true,
      path: "/tmp/x.png",
      name: "x.png",
      mimeType: "image/png",
    }));
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const { result } = renderHook(() =>
      useAgentDraftAttachments({ uploadEnvoyAttachment }),
    );

    const file = new File(["x"], "x.png", { type: "image/png" });
    await act(async () => {
      await result.current.uploadBrowserFiles([file]);
    });
    const id = result.current.attachments[0]!.id;

    act(() => {
      result.current.remove(id);
    });
    expect(revoke).toHaveBeenCalled();

    await act(async () => {
      await result.current.uploadBrowserFiles([file]);
    });
    act(() => {
      result.current.clear();
    });
    expect(revoke.mock.calls.length).toBeGreaterThanOrEqual(2);
    revoke.mockRestore();
  });
});
