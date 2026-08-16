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
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: vi.fn() }),
  useToastOptional: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
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
  it("shows a one-click primary action without requiring inputs", async () => {
    openFriendsFilesPanel();

    expect(await screen.findByRole("heading", { name: /friends' files/i })).toBeDefined();
    expect(screen.getByText(/tip: a contact must turn on published/i)).toBeDefined();
    expect(screen.getByTestId("friends-files-show")).toBeDefined();
    expect(screen.getByRole("button", { name: /Show published files/i })).toBeDefined();
  });

  it("show published files calls discoverPublishedLibrary with no filters by default", async () => {
    openFriendsFilesPanel();

    fireEvent.click(screen.getByRole("button", { name: /Show published files/i }));

    await waitFor(
      () => {
        expect(discoverPublishedLibrary).toHaveBeenCalledWith({
          fileTitleQuery: undefined,
          contentHashPrefix: undefined,
          maxResultsPerPeer: 8,
          timeoutMsPerPeer: 10_000,
          overallTimeoutMs: 50_000,
        });
      },
      { timeout: 3000 },
    );

    expect(await screen.findByText("Sam")).toBeDefined();
    expect(screen.getByText(/^Friend$/i)).toBeDefined();
    expect(screen.getByText("kubo-golden-checklist")).toBeDefined();
    expect(screen.getByText("tests/kubo-golden.md")).toBeDefined();
  });

  it("optional filter passes title query when provided", async () => {
    openFriendsFilesPanel();

    fireEvent.click(screen.getByText(/Filter results \(optional\)/i));
    fireEvent.change(screen.getByLabelText(/Filter by name or path/i), {
      target: { value: "kubo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Show published files/i }));

    await waitFor(
      () => {
        expect(discoverPublishedLibrary).toHaveBeenCalledWith({
          fileTitleQuery: "kubo",
          contentHashPrefix: undefined,
          maxResultsPerPeer: 8,
          timeoutMsPerPeer: 10_000,
          overallTimeoutMs: 50_000,
        });
      },
      { timeout: 3000 },
    );
  });

  it("passes content-hash prefix from Advanced when provided", async () => {
    openFriendsFilesPanel();

    fireEvent.click(screen.getByText(/Filter results \(optional\)/i));
    fireEvent.click(screen.getByText(/^Advanced$/i));
    fireEvent.change(screen.getByPlaceholderText(/Content-hash prefix/i), {
      target: { value: "a1b2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Show published files/i }));

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

    fireEvent.click(screen.getByRole("button", { name: /Show published files/i }));

    expect(await screen.findByText(/No published files found/i)).toBeDefined();
  });

  it("shows a friendly timeout message instead of raw RPC text", async () => {
    discoverPublishedLibrary.mockRejectedValue(
      new Error("Request discoverPublishedLibrary timed out after 30000ms"),
    );
    openFriendsFilesPanel();

    fireEvent.click(screen.getByRole("button", { name: /Show published files/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn’t reach your contacts|offline|try again/i);
    expect(alert.textContent).not.toMatch(/discoverPublishedLibrary/i);
  });

  it("shows error when discovery fails", async () => {
    discoverPublishedLibrary.mockRejectedValue(new Error("Relay unreachable"));
    openFriendsFilesPanel();

    fireEvent.click(screen.getByRole("button", { name: /Show published files/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Relay unreachable|Couldn’t look up/i);
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

    fireEvent.click(screen.getByRole("button", { name: /Show published files/i }));

    expect(await screen.findByText("Jordan")).toBeDefined();
    expect(screen.getByText(/nothing published/i)).toBeDefined();
  });
});
