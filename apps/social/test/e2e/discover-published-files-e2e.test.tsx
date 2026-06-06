/**
 * @vitest-environment jsdom
 * E2E (UI integration): Library → Friends' files → discoverPublishedLibrary results.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { DiscoverPublishedLibraryPeerResult } from "@envoymesh/api";
import { LibraryView } from "../../src/components/views/LibraryView.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const discoverPublishedLibrary = vi.fn();
const listAllLocalFiles = vi.fn().mockResolvedValue({ items: [], vaultCount: 0, workspaceCount: 0 });

const samResults: DiscoverPublishedLibraryPeerResult[] = [
  {
    peerOwnerId: "envoy:owner:sam",
    displayName: "Sam",
    bondLevel: "direct",
    bondRank: 0,
    latencyMs: 42,
    files: [
      {
        documentId: "doc-sam-1",
        title: "kubo-golden-checklist",
        relativePath: "tests/kubo-golden.md",
        contentHash: "a1b2c3d4e5f6",
        byteLength: 1200,
        cid: "bafybeigdyrzt5sfp7udm7r",
      },
    ],
  },
];

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    discoverPublishedLibrary,
    listAllLocalFiles,
  }),
  useIsInProcessMobileNode: () => false,
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: vi.fn() }),
  useToastOptional: () => ({ showToast: vi.fn() }),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    nodeConfig: { externalPublish: { allowIpfs: false } },
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  discoverPublishedLibrary.mockResolvedValue(samResults);
});

function openFriendsFilesPanel() {
  renderWithI18n(<LibraryView />);
}

describe("E2E Library friends files", () => {
  it("shows friends files panel and query controls", async () => {
    openFriendsFilesPanel();

    expect(await screen.findByRole("heading", { name: /friends' files/i })).toBeDefined();
    expect(screen.getByPlaceholderText(/optional filter on title or path/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /^Query contacts$/i })).toBeDefined();
  });

  it("query contacts calls discoverPublishedLibrary and renders file metadata", async () => {
    openFriendsFilesPanel();

    fireEvent.change(screen.getByPlaceholderText(/optional filter on title or path/i), {
      target: { value: "kubo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Query contacts$/i }));

    await waitFor(
      () => {
        expect(discoverPublishedLibrary).toHaveBeenCalledWith({
          fileTitleQuery: "kubo",
          contentHashPrefix: undefined,
          maxResultsPerPeer: 8,
          timeoutMsPerPeer: 18_000,
        });
      },
      { timeout: 3000 },
    );

    expect(await screen.findByText("Sam")).toBeDefined();
    expect(screen.getByText(/direct · 42ms/i)).toBeDefined();
    expect(screen.getByText("kubo-golden-checklist")).toBeDefined();
    expect(screen.getByText("tests/kubo-golden.md")).toBeDefined();
  });

  it("passes content-hash prefix when provided", async () => {
    openFriendsFilesPanel();

    fireEvent.change(screen.getByPlaceholderText(/content-hash prefix/i), {
      target: { value: "a1b2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Query contacts$/i }));

    await waitFor(
      () => {
        expect(discoverPublishedLibrary).toHaveBeenCalledWith(
          expect.objectContaining({ contentHashPrefix: "a1b2" }),
        );
      },
      { timeout: 3000 },
    );
  });

  it("shows empty state when no contacts return matches", async () => {
    discoverPublishedLibrary.mockResolvedValue([]);
    openFriendsFilesPanel();

    fireEvent.click(screen.getByRole("button", { name: /^Query contacts$/i }));

    expect(await screen.findByText(/no contacts returned results/i)).toBeDefined();
  });

  it("shows error when discovery fails", async () => {
    discoverPublishedLibrary.mockRejectedValue(new Error("Relay unreachable"));
    openFriendsFilesPanel();

    fireEvent.click(screen.getByRole("button", { name: /^Query contacts$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Relay unreachable");
  });

  it("shows per-contact no-match hint when peer responds with zero files", async () => {
    discoverPublishedLibrary.mockResolvedValue([
      {
        peerOwnerId: "envoy:owner:jordan",
        displayName: "Jordan",
        bondLevel: "referred",
        bondRank: 1,
        latencyMs: 88,
        files: [],
      },
    ]);
    openFriendsFilesPanel();

    fireEvent.click(screen.getByRole("button", { name: /^Query contacts$/i }));

    expect(await screen.findByText("Jordan")).toBeDefined();
    expect(screen.getByText(/no published files matched/i)).toBeDefined();
  });
});
