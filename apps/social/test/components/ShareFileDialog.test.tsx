/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { ShareFileDialog } from "../../src/components/file-share/ShareFileDialog.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import type { BondRecord, LibraryItem } from "@envoymesh/api";

const mockGetBonds = vi.fn();
const mockListLibraryItems = vi.fn();
const mockShareFile = vi.fn();
const mockOn = vi.fn(() => () => {});

// Stable reference to prevent React re-render loops
const mockNodeService = {
  getBonds: mockGetBonds,
  listLibraryItems: mockListLibraryItems,
  shareFile: mockShareFile,
  on: mockOn,
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const sampleBonds: BondRecord[] = [
  {
    peerOwnerId: "envoy:owner:bob",
    displayName: "Bob",
    level: "direct",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    peerOwnerId: "envoy:owner:charlie",
    displayName: "Charlie",
    level: "public",
    createdAt: "2026-01-02T00:00:00.000Z",
  },
];

const sampleItems: LibraryItem[] = [
  {
    documentId: "doc-1",
    title: "My Report",
    relativePath: "documents/report.md",
    mimeType: "text/markdown",
    sizeBytes: 1024,
    indexedAt: "2026-01-01T00:00:00.000Z",
    tags: [],
    sensitivity: "friends",
    chunkCount: 1,
  },
];

describe("ShareFileDialog", () => {
  beforeEach(() => {
    mockGetBonds.mockResolvedValue(sampleBonds);
    mockListLibraryItems.mockResolvedValue(sampleItems);
    mockShareFile.mockResolvedValue(undefined);
  });

  it("renders the dialog with aria role", async () => {
    renderWithI18n(<ShareFileDialog onClose={vi.fn()} />);
    expect(await screen.findByRole("dialog")).toBeDefined();
  });

  it("shows bonded contacts in the select dropdown", async () => {
    renderWithI18n(<ShareFileDialog onClose={vi.fn()} />);
    const contactSelect = await screen.findByLabelText(/bonded contact/i);
    expect(contactSelect).toBeDefined();
    // Bob is direct, should appear
    expect(screen.getByText("Bob")).toBeDefined();
    // Charlie is public, should still appear (not blocked)
    expect(screen.getByText("Charlie")).toBeDefined();
  });

  it("shows library items in vault file select (no pre-selected item)", async () => {
    renderWithI18n(<ShareFileDialog onClose={vi.fn()} />);
    const fileSelect = await screen.findByLabelText(/vault file/i);
    expect(fileSelect).toBeDefined();
    expect(screen.getByText(/My Report/)).toBeDefined();
  });

  it("does not show vault file select when libraryItem is pre-selected", async () => {
    const libItem: LibraryItem = sampleItems[0];
    renderWithI18n(
      <ShareFileDialog onClose={vi.fn()} libraryItem={libItem} />,
    );
    await screen.findByRole("dialog");
    expect(screen.queryByLabelText(/vault file/i)).toBeNull();
    expect(screen.getByText(/My Report/)).toBeDefined(); // title shown
  });

  it("pre-selects targetOwnerId when provided", async () => {
    renderWithI18n(
      <ShareFileDialog onClose={vi.fn()} targetOwnerId="envoy:owner:bob" />,
    );
    await screen.findByRole("dialog");
    const contactSelect = screen.getByLabelText(/bonded contact/i) as HTMLSelectElement;
    expect(contactSelect.value).toBe("envoy:owner:bob");
  });

  it("disables send button when no contact selected", async () => {
    renderWithI18n(<ShareFileDialog onClose={vi.fn()} />);
    await screen.findByRole("dialog");
    const sendBtn = screen.getByText("Send share request").closest("button") as HTMLButtonElement;
    expect(sendBtn!.disabled).toBe(true);
  });

  it("disables send button when no vault file selected", async () => {
    renderWithI18n(
      <ShareFileDialog onClose={vi.fn()} targetOwnerId="envoy:owner:bob" />,
    );
    await screen.findByRole("dialog");
    const sendBtn = screen.getByText("Send share request").closest("button") as HTMLButtonElement;
    expect(sendBtn!.disabled).toBe(true);
  });

  it("calls shareFile and closes on success", async () => {
    const onClose = vi.fn();
    const onShared = vi.fn();
    const libItem: LibraryItem = sampleItems[0];

    renderWithI18n(
      <ShareFileDialog
        onClose={onClose}
        onShared={onShared}
        libraryItem={libItem}
        targetOwnerId="envoy:owner:bob"
      />,
    );

    await screen.findByRole("dialog");

    // Select sensitivity
    const sensSelect = screen.getByLabelText(/sensitivity/i) as HTMLSelectElement;
    fireEvent.change(sensSelect, { target: { value: "private" } });

    const submitBtn = screen.getByText("Send share request").closest("button")!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockShareFile).toHaveBeenCalledWith("envoy:owner:bob", {
        path: "documents/report.md",
        sensitivity: "private",
      });
    });

    await waitFor(() => {
      expect(onShared).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows error when shareFile fails", async () => {
    mockShareFile.mockRejectedValue(new Error("Network error"));
    const libItem: LibraryItem = sampleItems[0];

    renderWithI18n(
      <ShareFileDialog
        onClose={vi.fn()}
        libraryItem={libItem}
        targetOwnerId="envoy:owner:bob"
      />,
    );

    await screen.findByRole("dialog");
    const sendBtn = screen.getByText("Send share request").closest("button")!;
    fireEvent.click(sendBtn);

    expect(await screen.findByText("Network error")).toBeDefined();
  });

  it("calls onClose when cancel is clicked", async () => {
    const onClose = vi.fn();
    renderWithI18n(<ShareFileDialog onClose={onClose} />);
    await screen.findByRole("dialog");
    const cancelBtn = screen.getByText("Cancel").closest("button")!;
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
