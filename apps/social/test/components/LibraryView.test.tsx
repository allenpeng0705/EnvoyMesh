/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
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

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    listLibraryItems,
    getBonds,
    setLibraryItemPublished,
    exportLibraryItemToIpfs,
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

const sampleItem: LibraryItem = {
  documentId: "doc-1",
  title: "notes",
  relativePath: "notes.md",
  extension: ".md",
  byteLength: 12,
  contentHash: "hash123",
  updatedAt: "2026-05-20T12:00:00.000Z",
  published: false,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  nodeConfig = { externalPublish: { allowIpfs: false, gatewayAllowlist: [] } };
  isInProcessMobileNode = false;
  listLibraryItems.mockResolvedValue([sampleItem]);
  getBonds.mockResolvedValue([]);
});

describe("LibraryView IPFS UI", () => {
  it("shows IPFS disabled hint and hides Export when allowIpfs is false", async () => {
    renderWithI18n(<LibraryView />);

    expect(await screen.findByText(/IPFS export is disabled/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /^Export$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Import file/i })).toBeDefined();
  });

  it("shows Export button when allowIpfs is true", async () => {
    nodeConfig = { externalPublish: { allowIpfs: true, gatewayAllowlist: [] } };
    renderWithI18n(<LibraryView />);

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("button", { name: /^Export$/i })).toBeDefined();
    expect(screen.queryByText(/IPFS export is off/i)).toBeNull();
  });

  it("hides IPFS export actions on in-process mobile when allowIpfs is false", async () => {
    nodeConfig = { externalPublish: { allowIpfs: false, gatewayAllowlist: ["https://ipfs.io"] } };
    isInProcessMobileNode = true;
    renderWithI18n(<LibraryView />);

    expect(await screen.findByText(/in-process Helia/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /^Export$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Verify gateway/i })).toBeNull();
  });

  it("shows IPFS export on in-process mobile when allowIpfs is true (Helia)", async () => {
    nodeConfig = {
      externalPublish: { allowIpfs: true, gatewayAllowlist: [], ipfsExportEngine: "helia" },
    };
    isInProcessMobileNode = true;
    renderWithI18n(<LibraryView />);

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("button", { name: /^Export$/i })).toBeDefined();
    expect(screen.queryByRole("button", { name: /Verify gateway/i })).toBeNull();
  });

  it("shows Verify gateway on mobile when allowlist is configured", async () => {
    nodeConfig = {
      externalPublish: {
        allowIpfs: true,
        gatewayAllowlist: ["https://ipfs.io"],
        ipfsExportEngine: "helia",
      },
    };
    isInProcessMobileNode = true;
    listLibraryItems.mockResolvedValue([
      {
        ...sampleItem,
        publishedExternal: {
          exportRevision: 1,
          exportedAt: "2026-05-20T12:00:00.000Z",
          cid: "bafytest",
          ipfsInteropRecipe: "v1",
          kuboVersion: "",
          contentHash: "hash123",
        },
      },
    ]);
    renderWithI18n(<LibraryView />);

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("button", { name: /Verify gateway/i })).toBeDefined();
  });

  it("shows Helia hint on desktop when helia engine is selected", async () => {
    nodeConfig = {
      externalPublish: { allowIpfs: true, gatewayAllowlist: [], ipfsExportEngine: "helia" },
    };
    renderWithI18n(<LibraryView />);

    expect(await screen.findByText(/in-process Helia/i)).toBeDefined();
    const table = screen.getByRole("table");
    expect(within(table).getByRole("button", { name: /^Export$/i })).toBeDefined();
  });
});
