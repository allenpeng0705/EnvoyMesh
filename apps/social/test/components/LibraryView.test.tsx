/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { LibraryItem } from "@envoymesh/api";
import { LibraryView } from "../../src/components/views/LibraryView.js";

const listLibraryItems = vi.fn();
const getBonds = vi.fn();
const setLibraryItemPublished = vi.fn();
const exportLibraryItemToIpfs = vi.fn();
const verifyLibraryItemIpfsGateway = vi.fn();

let nodeConfig: { externalPublish?: { allowIpfs?: boolean; gatewayAllowlist?: string[] } } = {
  externalPublish: { allowIpfs: false, gatewayAllowlist: [] },
};
let isInProcessMobileNode = false;

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    listLibraryItems,
    getBonds,
    setLibraryItemPublished,
    exportLibraryItemToIpfs,
    verifyLibraryItemIpfsGateway,
  }),
  useIsInProcessMobileNode: () => isInProcessMobileNode,
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
  it("shows IPFS disabled hint and hides IPFS column when allowIpfs is false", async () => {
    render(<LibraryView />);

    expect(await screen.findByText(/IPFS export is off/i)).toBeDefined();
    expect(screen.queryByRole("columnheader", { name: /^IPFS$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Export$/i })).toBeNull();
  });

  it("shows IPFS column and Export button when allowIpfs is true", async () => {
    nodeConfig = { externalPublish: { allowIpfs: true, gatewayAllowlist: [] } };
    render(<LibraryView />);

    await screen.findByRole("columnheader", { name: /^IPFS$/i });
    const table = screen.getByRole("table");
    expect(within(table).getByRole("button", { name: /^Export$/i })).toBeDefined();
    expect(screen.queryByText(/IPFS export is off/i)).toBeNull();
  });

  it("hides IPFS export actions on in-process mobile even when allowIpfs is true", async () => {
    nodeConfig = { externalPublish: { allowIpfs: true, gatewayAllowlist: ["https://ipfs.io"] } };
    isInProcessMobileNode = true;
    render(<LibraryView />);

    expect(await screen.findByText(/home desktop node/i)).toBeDefined();
    expect(screen.queryByRole("columnheader", { name: /^IPFS$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Export$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Verify gateway/i })).toBeNull();
  });
});
