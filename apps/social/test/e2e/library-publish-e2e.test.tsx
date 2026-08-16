/**
 * @vitest-environment jsdom
 * E2E (UI integration): Library publish toggle → setLibraryItemPublished + list refresh.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { LibraryItem } from "@envoymesh/api";
import { LibraryView } from "../../src/components/views/LibraryView.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const listAllLocalFiles = vi.fn();
const getBonds = vi.fn();
const setLibraryItemPublished = vi.fn();
const exportLibraryItemToIpfs = vi.fn();
const verifyLibraryItemIpfsGateway = vi.fn();
const importToLibrary = vi.fn();

let nodeConfig: {
  externalPublish?: { allowIpfs?: boolean; gatewayAllowlist?: string[]; ipfsExportEngine?: string };
} = {
  externalPublish: { allowIpfs: false, gatewayAllowlist: [] },
};

const privateItem: LibraryItem = {
  documentId: "doc-publish-1",
  title: "research-notes",
  relativePath: "docs/research-notes.md",
  extension: ".md",
  byteLength: 2048,
  contentHash: "abc123hash0000",
  updatedAt: "2026-05-21T12:00:00.000Z",
  published: false,
};

const publishedItem: LibraryItem = {
  ...privateItem,
  published: true,
};

function unifiedList(items: LibraryItem[] = [privateItem]) {
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
    getBonds,
    setLibraryItemPublished,
    exportLibraryItemToIpfs,
    verifyLibraryItemIpfsGateway,
    importToLibrary,
  }),
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: vi.fn(), toasts: [] }),
  useToastOptional: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({ nodeConfig }),
}));

function renderLibrary() {
  return renderWithI18n(<LibraryView />);
}

async function tableCheckbox() {
  const table = await screen.findByRole("table");
  return within(table).getByRole("checkbox");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  nodeConfig = { externalPublish: { allowIpfs: false, gatewayAllowlist: [] } };
  listAllLocalFiles.mockResolvedValue(unifiedList([privateItem]));
  getBonds.mockResolvedValue([]);
  setLibraryItemPublished.mockImplementation(async (_documentId, published) => {
    listAllLocalFiles.mockResolvedValue(unifiedList([published ? publishedItem : privateItem]));
  });
});

describe("E2E Library publish toggle", () => {
  it("renders unpublished file with Private label and unchecked toggle", async () => {
    renderLibrary();

    const table = await screen.findByRole("table");
    expect(within(table).getByText("research-notes")).toBeDefined();
    expect(within(table).getByText("docs/research-notes.md")).toBeDefined();
    expect(within(table).getByText("Private")).toBeDefined();

    const checkbox = within(table).getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(setLibraryItemPublished).not.toHaveBeenCalled();
  });

  it("publish toggle calls setLibraryItemPublished(true) and refreshes to Published", async () => {
    renderLibrary();

    const checkbox = (await tableCheckbox()) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(setLibraryItemPublished).toHaveBeenCalledWith("doc-publish-1", true);
    });

    const table = screen.getByRole("table");
    expect(await within(table).findByText("Published")).toBeDefined();
    expect((within(table).getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });

  it("unpublish toggle calls setLibraryItemPublished(false) and refreshes to Private", async () => {
    listAllLocalFiles.mockResolvedValue(unifiedList([publishedItem]));
    renderLibrary();

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Published")).toBeDefined();

    const checkbox = within(table).getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(setLibraryItemPublished).toHaveBeenCalledWith("doc-publish-1", false);
    });

    expect(await within(table).findByText("Private")).toBeDefined();
    expect((within(table).getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("publish toggle works on filtered row after search", async () => {
    listAllLocalFiles.mockResolvedValue(
      unifiedList([
        privateItem,
        {
          ...privateItem,
          documentId: "doc-other",
          title: "other-file",
          relativePath: "docs/other.txt",
        },
      ]),
    );
    renderLibrary();

    fireEvent.change(screen.getByLabelText(/filter library/i), {
      target: { value: "research" },
    });

    const table = await screen.findByRole("table");
    expect(within(table).getByText("research-notes")).toBeDefined();
    expect(within(table).queryByText("other-file")).toBeNull();

    fireEvent.click(within(table).getByRole("checkbox"));

    await waitFor(() => {
      expect(setLibraryItemPublished).toHaveBeenCalledWith("doc-publish-1", true);
    });
    expect(await within(table).findByText("Published")).toBeDefined();
  });
});
