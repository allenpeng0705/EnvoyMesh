/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { LibraryItem } from "@envoymesh/api";
import { LibraryView } from "../../src/components/views/LibraryView.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const listLibraryItems = vi.fn();
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

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    listLibraryItems,
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

async function openRowMenu(scope: HTMLElement = document.body) {
  const more = within(scope).getByRole("button", { name: /More actions/i });
  fireEvent.click(more);
  return screen.findByTestId("library-row-menu");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  nodeConfig = { externalPublish: { allowIpfs: false, gatewayAllowlist: [] } };
  listLibraryItems.mockResolvedValue([sampleItem]);
  listAllLocalFiles.mockResolvedValue(unifiedList());
  getBonds.mockResolvedValue([]);
});

describe("LibraryView IPFS UI", () => {
  it("shows IPFS disabled hint and hides Export when allowIpfs is false", async () => {
    renderWithI18n(<LibraryView />);

    expect(await screen.findByText(/IPFS export is disabled/i)).toBeDefined();
    const table = await screen.findByRole("table");
    const menu = await openRowMenu(table);
    expect(within(menu).queryByRole("menuitem", { name: /^Export$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Import file/i })).toBeDefined();
  });

  it("shows Export in the overflow menu when allowIpfs is true", async () => {
    nodeConfig = { externalPublish: { allowIpfs: true, gatewayAllowlist: [] } };
    renderWithI18n(<LibraryView />);

    const table = await screen.findByRole("table");
    expect(within(table).queryByRole("button", { name: /^Export$/i })).toBeNull();
    const menu = await openRowMenu(table);
    expect(within(menu).getByRole("menuitem", { name: /^Export$/i })).toBeDefined();
    expect(screen.queryByText(/IPFS export is off/i)).toBeNull();
  });

  it("shows Helia hint on desktop when helia engine is selected", async () => {
    nodeConfig = {
      externalPublish: { allowIpfs: true, gatewayAllowlist: [], ipfsExportEngine: "helia" },
    };
    renderWithI18n(<LibraryView />);

    expect(await screen.findByText(/in-process Helia/i)).toBeDefined();
    const table = screen.getByRole("table");
    const menu = await openRowMenu(table);
    expect(within(menu).getByRole("menuitem", { name: /^Export$/i })).toBeDefined();
  });

  it("shows Private publish toggle, Open, Share, and More as the primary row actions", async () => {
    renderWithI18n(<LibraryView />);
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("button", { name: /^Private$/i })).toBeDefined();
    expect(within(table).getByRole("button", { name: /^Open$/i })).toBeDefined();
    expect(within(table).getByRole("button", { name: /Share/i })).toBeDefined();
    expect(within(table).getByRole("button", { name: /More actions/i })).toBeDefined();
    expect(within(table).queryByRole("button", { name: /Show in folder/i })).toBeNull();
  });

  it("hides chat, profile, and agent workspace files from the library list", async () => {
    listAllLocalFiles.mockResolvedValue({
      items: [
        {
          source: "vault" as const,
          relativePath: "notes.md",
          title: "notes",
          extension: ".md",
          byteLength: 12,
          updatedAt: "2026-05-20T12:00:00.000Z",
          documentId: "doc-1",
          contentHash: "hash123",
          published: false,
        },
        {
          source: "vault" as const,
          relativePath: "chat/out/att-1/voice-note.webm",
          title: "voice-note",
          extension: ".webm",
          byteLength: 4096,
          updatedAt: "2026-05-20T12:00:00.000Z",
          documentId: "doc-voice",
          contentHash: "hash-voice",
          published: false,
        },
        {
          source: "vault" as const,
          relativePath: "chat/out/att-2/Allen_Peng_resume_en.pdf",
          title: "Allen_Peng_resume_en",
          extension: ".pdf",
          byteLength: 136500,
          updatedAt: "2026-06-02T23:04:00.000Z",
          documentId: "doc-resume",
          contentHash: "hash-resume",
          published: false,
        },
        {
          source: "vault" as const,
          relativePath: "profile/thumbnail.jpg",
          title: "thumbnail",
          extension: ".jpg",
          byteLength: 49000,
          updatedAt: "2026-07-25T23:07:41.000Z",
          documentId: "doc-thumb",
          contentHash: "hash-thumb",
          published: false,
        },
        {
          source: "vault" as const,
          relativePath: "profile/gallery/0fd7139a-9596-43fa-8733-401496c7dc98.jpg",
          title: "0fd7139a-9596-43fa-8733-401496c7dc98",
          extension: ".jpg",
          byteLength: 361400,
          updatedAt: "2026-07-25T23:07:41.000Z",
          documentId: "doc-gal",
          contentHash: "hash-gal",
          published: false,
        },
        {
          source: "workspace" as const,
          relativePath: "skills/tavily/SKILL.md",
          title: "SKILL.md",
          extension: ".md",
          byteLength: 9800,
          updatedAt: "2026-06-05T19:56:46.000Z",
        },
      ],
      vaultCount: 5,
      workspaceCount: 1,
    });
    renderWithI18n(<LibraryView />);
    const table = await screen.findByRole("table");
    expect(within(table).getByText("notes")).toBeDefined();
    expect(within(table).queryByText("voice-note")).toBeNull();
    expect(within(table).queryByText("Allen_Peng_resume_en")).toBeNull();
    expect(within(table).queryByText("thumbnail")).toBeNull();
    expect(within(table).queryByText("0fd7139a-9596-43fa-8733-401496c7dc98")).toBeNull();
    expect(within(table).queryByText("SKILL.md")).toBeNull();
    expect(within(table).queryByText(/chat\/out/)).toBeNull();
    expect(within(table).queryByText(/profile\//)).toBeNull();
    expect(screen.queryByRole("tab", { name: /Agent workspace/i })).toBeNull();
  });
});
