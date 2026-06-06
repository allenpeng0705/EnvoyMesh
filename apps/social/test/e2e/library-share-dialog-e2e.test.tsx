/**
 * @vitest-environment jsdom
 * E2E (UI integration): Library Share… dialog → shareFile with contact + sensitivity.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { BondRecord, LibraryItem } from "@envoymesh/api";
import { LibraryView } from "../../src/components/views/LibraryView.js";
import { ShareFileDialog } from "../../src/components/file-share/ShareFileDialog.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const listAllLocalFiles = vi.fn();
const listLibraryItems = vi.fn();
const getBonds = vi.fn();
const setLibraryItemPublished = vi.fn();
const shareFile = vi.fn();
const exportLibraryItemToIpfs = vi.fn();
const verifyLibraryItemIpfsGateway = vi.fn();
const importToLibrary = vi.fn();

let nodeConfig: {
  externalPublish?: { allowIpfs?: boolean; gatewayAllowlist?: string[] };
} = {
  externalPublish: { allowIpfs: false, gatewayAllowlist: [] },
};

const sampleItem: LibraryItem = {
  documentId: "doc-share-1",
  title: "contract",
  relativePath: "docs/contract.pdf",
  extension: ".pdf",
  byteLength: 8192,
  contentHash: "hashcontract00",
  updatedAt: "2026-05-21T12:00:00.000Z",
  published: false,
};

const alexBond: BondRecord = {
  peerOwnerId: "envoy:owner:alex",
  level: "direct",
  displayName: "Alex",
};

function unifiedList(items: LibraryItem[] = [sampleItem]) {
  return {
    items: items.map((item) => ({
      source: "vault" as const,
      relativePath: item.relativePath,
      title: item.title,
      extension: item.extension,
      byteLength: item.byteLength,
      updatedAt: item.updatedAt,
      documentId: item.documentId,
      contentHash: item.contentHash,
      published: item.published,
      publishedExternal: item.publishedExternal,
    })),
    vaultCount: items.length,
    workspaceCount: 0,
  };
}

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    listAllLocalFiles,
    listLibraryItems,
    getBonds,
    setLibraryItemPublished,
    shareFile,
    exportLibraryItemToIpfs,
    verifyLibraryItemIpfsGateway,
    importToLibrary,
  }),
  useIsInProcessMobileNode: () => false,
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: vi.fn(), toasts: [] }),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({ nodeConfig }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  nodeConfig = { externalPublish: { allowIpfs: false, gatewayAllowlist: [] } };
  listAllLocalFiles.mockResolvedValue(unifiedList([sampleItem]));
  listLibraryItems.mockResolvedValue([sampleItem]);
  getBonds.mockResolvedValue([alexBond]);
  shareFile.mockResolvedValue(undefined);
});

describe("E2E Library Share dialog", () => {
  it("opens Share dialog from Library row with pre-filled vault path", async () => {
    renderWithI18n(<LibraryView />);

    const table = await screen.findByRole("table");
    fireEvent.click(within(table).getByRole("button", { name: /^Share…$/i }));

    const dialog = await screen.findByRole("dialog", { name: /share file/i });
    expect(within(dialog).getByText(/Share “contract”/i)).toBeDefined();
    expect(within(dialog).getByLabelText(/bonded contact/i)).toBeDefined();
    expect(within(dialog).queryByLabelText(/vault file/i)).toBeNull();
  });

  it("send share request calls shareFile with contact, path, and sensitivity", async () => {
    renderWithI18n(<LibraryView />);

    const table = await screen.findByRole("table");
    fireEvent.click(within(table).getByRole("button", { name: /^Share…$/i }));

    const dialog = await screen.findByRole("dialog", { name: /share file/i });
    fireEvent.change(within(dialog).getByLabelText(/bonded contact/i), {
      target: { value: "envoy:owner:alex" },
    });
    fireEvent.change(within(dialog).getByLabelText(/sensitivity/i), {
      target: { value: "private" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Send share request$/i }));

    await waitFor(() => {
      expect(shareFile).toHaveBeenCalledWith("envoy:owner:alex", {
        path: "docs/contract.pdf",
        sensitivity: "private",
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /share file/i })).toBeNull();
    });
  });

  it("cancel closes the dialog without calling shareFile", async () => {
    renderWithI18n(<LibraryView />);

    const table = await screen.findByRole("table");
    fireEvent.click(within(table).getByRole("button", { name: /^Share…$/i }));
    const dialog = await screen.findByRole("dialog", { name: /share file/i });

    fireEvent.click(within(dialog).getByRole("button", { name: /^Cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /share file/i })).toBeNull();
    });
    expect(shareFile).not.toHaveBeenCalled();
  });

  it("standalone ShareFileDialog lists vault files when no libraryItem preset", async () => {
    const onClose = vi.fn();
    renderWithI18n(
      <ShareFileDialog
        onClose={onClose}
        onShared={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: /share file/i });
    expect(within(dialog).getByText(/Share from library/i)).toBeDefined();
    expect(await within(dialog).findByLabelText(/vault file/i)).toBeDefined();

    fireEvent.change(within(dialog).getByLabelText(/bonded contact/i), {
      target: { value: "envoy:owner:alex" },
    });
    fireEvent.change(within(dialog).getByLabelText(/vault file/i), {
      target: { value: "docs/contract.pdf" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Send share request$/i }));

    await waitFor(() => {
      expect(shareFile).toHaveBeenCalledWith("envoy:owner:alex", {
        path: "docs/contract.pdf",
        sensitivity: "friends",
      });
    });
    expect(onClose).toHaveBeenCalled();
  });
});
