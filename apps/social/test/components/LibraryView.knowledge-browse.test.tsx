/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { LocalFileItem } from "@envoymesh/api";
import { LibraryView } from "../../src/components/views/LibraryView.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const listAllLocalFiles = vi.fn();
const getRagIndexStatus = vi.fn();
const getBonds = vi.fn();

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    listAllLocalFiles,
    getRagIndexStatus,
    getBonds,
    listLibraryItems: vi.fn().mockResolvedValue([]),
    setLibraryItemPublished: vi.fn(),
    importToLibrary: vi.fn(),
    on: () => () => {},
  }),
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: vi.fn(), toasts: [] }),
  useToastOptional: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    nodeConfig: { externalPublish: { allowIpfs: false } },
  }),
}));

vi.mock("../../src/components/discover/FriendsFilesPanel.js", () => ({
  FriendsFilesPanel: () => null,
}));

const items: LocalFileItem[] = [
  {
    source: "vault",
    relativePath: "notes/hello.md",
    title: "Hello",
    extension: ".md",
    byteLength: 10,
    updatedAt: "2026-05-20T12:00:00.000Z",
    documentId: "n1",
    contentHash: "h1",
    published: false,
  },
  {
    source: "vault",
    relativePath: "documents/resume.pdf",
    title: "Resume",
    extension: ".pdf",
    byteLength: 20,
    updatedAt: "2026-05-20T12:00:00.000Z",
    documentId: "d1",
    contentHash: "h2",
    published: false,
  },
  {
    source: "vault",
    relativePath: "notes/pub.md",
    title: "Published",
    extension: ".md",
    byteLength: 12,
    updatedAt: "2026-05-20T12:00:00.000Z",
    documentId: "n2",
    contentHash: "h3",
    published: true,
  },
  {
    source: "vault",
    relativePath: "notes/mcp/notion-hit.md",
    title: "Notion hit",
    extension: ".md",
    byteLength: 8,
    updatedAt: "2026-05-20T12:00:00.000Z",
    documentId: "n3",
    contentHash: "h4",
    published: false,
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  listAllLocalFiles.mockResolvedValue({
    items,
    vaultCount: items.length,
    workspaceCount: 0,
  });
  getRagIndexStatus.mockResolvedValue({
    isIndexing: false,
    progress: {
      phase: "idle",
      processed: 0,
      total: 0,
      indexed: 0,
      skipped: 0,
      removed: 0,
      updatedAt: new Date(0).toISOString(),
    },
    trackedDocuments: 3,
  });
  getBonds.mockResolvedValue([]);
});

describe("LibraryView Knowledge Browse filters", () => {
  it("filters Notes / Obsidian / Notion / Documents / Published when embedded", async () => {
    renderWithI18n(<LibraryView embedded />);
    await waitFor(() => {
      expect(screen.getAllByTitle("notes/hello.md").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByTitle("documents/resume.pdf").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("notes/mcp/notion-hit.md").length).toBeGreaterThan(0);
    expect(screen.getByTestId("knowledge-index-chip").textContent).toMatch(/3/);

    fireEvent.click(screen.getByTestId("knowledge-browse-filter-notes"));
    expect(screen.getAllByTitle("notes/hello.md").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("notes/mcp/notion-hit.md").length).toBeGreaterThan(0);
    expect(screen.queryAllByTitle("documents/resume.pdf")).toHaveLength(0);

    fireEvent.click(screen.getByTestId("knowledge-browse-filter-obsidian"));
    expect(screen.getAllByTitle("notes/hello.md").length).toBeGreaterThan(0);
    expect(screen.queryAllByTitle("notes/mcp/notion-hit.md")).toHaveLength(0);

    fireEvent.click(screen.getByTestId("knowledge-browse-filter-notion"));
    expect(screen.getAllByTitle("notes/mcp/notion-hit.md").length).toBeGreaterThan(0);
    expect(screen.queryAllByTitle("notes/hello.md")).toHaveLength(0);

    fireEvent.click(screen.getByTestId("knowledge-browse-filter-documents"));
    expect(screen.getAllByTitle("documents/resume.pdf").length).toBeGreaterThan(0);
    expect(screen.queryAllByTitle("notes/hello.md")).toHaveLength(0);

    fireEvent.click(screen.getByTestId("knowledge-browse-filter-published"));
    expect(screen.getAllByTitle("notes/pub.md").length).toBeGreaterThan(0);
    expect(screen.queryAllByTitle("documents/resume.pdf")).toHaveLength(0);
  });

  it("shows empty state CTAs when vault is empty", async () => {
    listAllLocalFiles.mockResolvedValue({ items: [], vaultCount: 0, workspaceCount: 0 });
    getRagIndexStatus.mockResolvedValue({
      isIndexing: false,
      progress: {
        phase: "idle",
        processed: 0,
        total: 0,
        indexed: 0,
        skipped: 0,
        removed: 0,
        updatedAt: new Date(0).toISOString(),
      },
      trackedDocuments: 0,
    });
    renderWithI18n(<LibraryView embedded />);
    await waitFor(() => {
      expect(screen.getByTestId("library-empty")).toBeTruthy();
    });
    expect(withinEmptyActions()).toBeTruthy();
  });
});

function withinEmptyActions() {
  const empty = screen.getByTestId("library-empty");
  return empty.querySelector(".library-view-empty__actions");
}
