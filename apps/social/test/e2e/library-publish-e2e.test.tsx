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

const listLibraryItems = vi.fn();
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
let isInProcessMobileNode = false;

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

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    listLibraryItems,
    getBonds,
    setLibraryItemPublished,
    exportLibraryItemToIpfs,
    verifyLibraryItemIpfsGateway,
    importToLibrary,
  }),
  useIsInProcessMobileNode: () => isInProcessMobileNode,
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: vi.fn(), toasts: [] }),
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
  isInProcessMobileNode = false;
  listLibraryItems.mockResolvedValue([privateItem]);
  getBonds.mockResolvedValue([]);
  setLibraryItemPublished.mockImplementation(async (_documentId, published) => {
    listLibraryItems.mockResolvedValue([published ? publishedItem : privateItem]);
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
    listLibraryItems.mockResolvedValue([publishedItem]);
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
    listLibraryItems.mockResolvedValue([
      privateItem,
      {
        ...privateItem,
        documentId: "doc-other",
        title: "other-file",
        relativePath: "docs/other.txt",
      },
    ]);
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

  it("mobile card layout exposes the same publish toggle", async () => {
    isInProcessMobileNode = true;
    renderLibrary();

    const cards = await screen.findByRole("list", { name: /library files/i });
    expect(within(cards).getByText("Private")).toBeDefined();

    const checkbox = within(cards).getByRole("checkbox") as HTMLInputElement;
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(setLibraryItemPublished).toHaveBeenCalledWith("doc-publish-1", true);
    });
    expect(await within(cards).findByText("Published")).toBeDefined();
  });
});
