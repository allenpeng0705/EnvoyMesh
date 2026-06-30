/**
 * Unit tests for the file sharing runtime (Step 13a).
 *
 * Covers the simple operations: list / publish / OpenClaw workspace
 * helpers. The IPFS-pipeline methods and network-driven share methods
 * will get their own tests in 13b and 13c.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  // buildVaultIndex returns a VaultIndex-like object.
  vaultIndex: { documents: [] as Array<Record<string, unknown>> },
}));

vi.mock("@envoymesh/vault", () => ({
  buildVaultIndex: async (input: { rootDir: string }) => {
    if (!input.rootDir) throw new Error("no vault dir");
    return mocks.vaultIndex;
  },
  assertPathInsideVault: (_root: string, candidate: string) => candidate,
}));

vi.mock("@envoymesh/api", async () => {
  const actual = await vi.importActual<typeof import("@envoymesh/api")>("@envoymesh/api");
  return actual;
});

const publishedStoreMocks = vi.hoisted(() => ({
  setPublished: vi.fn(async (_id: string, _published: boolean) => {}),
  loadDocumentIds: vi.fn(async () => new Set<string>()),
}));

vi.mock("../src/published-library-store.js", () => ({
  createPublishedLibraryStore: (_profileDir: string) => ({
    setPublished: publishedStoreMocks.setPublished,
    loadDocumentIds: publishedStoreMocks.loadDocumentIds,
    upsert: vi.fn(async (r: unknown) => r),
    remove: vi.fn(async () => {}),
    list: vi.fn(async () => []),
    get: vi.fn(async () => undefined),
    loadAll: vi.fn(async () => new Map()),
  }),
}));

vi.mock("../src/openclaw-workspace.js", () => ({
  openClawWorkspaceDir: (profileDir: string) => `${profileDir}/.openclaw/workspace`,
}));

vi.mock("../src/openclaw-workspace-files.js", () => ({
  assertPathInsideOpenClawWorkspace: (_dir: string, rel: string) =>
    `/abs/${rel.replace(/^[\\/]+/, "")}`,
  listOpenClawWorkspaceFilesFromDir: async (_dir: string, query?: string) => {
    if (query === "noresults") return [];
    return [
      { relativePath: "a.md", byteLength: 100, mimeType: "text/markdown" },
      { relativePath: "b.txt", byteLength: 200, mimeType: "text/plain" },
    ];
  },
  readOpenClawWorkspaceFileFromDir: async (_dir: string, params: { maxBytes?: number }) => ({
    contentBase64: Buffer.from("hello").toString("base64"),
    mimeType: "text/plain",
    sizeBytes: 5,
    truncated: false,
  }),
}));

vi.mock("../src/local-files.js", () => ({
  buildAllLocalFilesList: (_input: { vaultItems: unknown[]; workspaceItems: unknown[] }) => ({
    items: [],
    vaultCount: 0,
    workspaceCount: 0,
  }),
}));

vi.mock("../src/vault-file-open.js", () => ({
  openPathWithDefaultApp: vi.fn(async () => {}),
}));

import {
  listLibraryItemsViaRuntime,
  listOpenClawWorkspaceFilesViaRuntime,
  listAllLocalFilesViaRuntime,
  setLibraryItemPublishedViaRuntime,
  resolveOpenClawWorkspacePathViaRuntime,
  readOpenClawWorkspaceFileViaRuntime,
  openLocalFileViaRuntime,
  readLocalFileContentViaRuntime,
  type FileShareContext,
} from "../src/node-service-fileshare.js";
import type { LibraryItem } from "@envoymesh/api";

function makeContext(
  overrides: Partial<FileShareContext> = {},
): FileShareContext {
  return {
    getVaultDir: () => "/vault",
    getProfileDir: () => "/profile",
    getNodeConfig: async () => ({}),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.vaultIndex = { documents: [] };
  publishedStoreMocks.setPublished.mockClear();
  publishedStoreMocks.loadDocumentIds.mockReset();
  publishedStoreMocks.loadDocumentIds.mockResolvedValue(new Set());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("listLibraryItemsViaRuntime", () => {
  it("returns [] when vault or profile dir is missing", async () => {
    expect(
      await listLibraryItemsViaRuntime(makeContext({ getVaultDir: () => null })),
    ).toEqual([]);
    expect(
      await listLibraryItemsViaRuntime(makeContext({ getProfileDir: () => null })),
    ).toEqual([]);
  });

  it("returns docs mapped to LibraryItem shape", async () => {
    mocks.vaultIndex = {
      documents: [
        {
          documentId: "d1",
          relativePath: "docs/foo.md",
          title: "Foo",
          extension: ".md",
          byteLength: 100,
          contentHash: "abc",
          updatedAt: "2026-06-30T00:00:00Z",
        },
        {
          documentId: "d2",
          relativePath: "data/baz.json",
          title: "Baz",
          extension: ".json",
          byteLength: 200,
          contentHash: "def",
          updatedAt: "2026-06-30T00:00:01Z",
        },
      ],
    };
    publishedStoreMocks.loadDocumentIds.mockResolvedValue(new Set(["d1"]));
    const items = await listLibraryItemsViaRuntime(makeContext());
    expect(items).toEqual<LibraryItem[]>([
      {
        documentId: "d1",
        relativePath: "docs/foo.md",
        title: "Foo",
        extension: ".md",
        byteLength: 100,
        contentHash: "abc",
        updatedAt: "2026-06-30T00:00:00Z",
        published: true,
      },
      {
        documentId: "d2",
        relativePath: "data/baz.json",
        title: "Baz",
        extension: ".json",
        byteLength: 200,
        contentHash: "def",
        updatedAt: "2026-06-30T00:00:01Z",
        published: false,
      },
    ]);
  });

  it("filters by query (case-insensitive) on title or relative path", async () => {
    mocks.vaultIndex = {
      documents: [
        { documentId: "d1", relativePath: "WASM.md", title: "Wasm intro", extension: ".md", byteLength: 1, contentHash: "x", updatedAt: "t" },
        { documentId: "d2", relativePath: "data.json", title: "stats", extension: ".json", byteLength: 1, contentHash: "y", updatedAt: "t" },
      ],
    };
    const items = await listLibraryItemsViaRuntime(makeContext(), { query: "WASM" });
    expect(items.map((i) => i.documentId)).toEqual(["d1"]);
    const items2 = await listLibraryItemsViaRuntime(makeContext(), { query: "stats" });
    expect(items2.map((i) => i.documentId)).toEqual(["d2"]);
  });
});

describe("listOpenClawWorkspaceFilesViaRuntime", () => {
  it("returns [] when profile dir is missing", async () => {
    const items = await listOpenClawWorkspaceFilesViaRuntime(
      makeContext({ getProfileDir: () => null }),
    );
    expect(items).toEqual([]);
  });

  it("passes query through to the workspace-listing helper", async () => {
    const items = await listOpenClawWorkspaceFilesViaRuntime(makeContext(), {
      query: "noresults",
    });
    expect(items).toEqual([]);
    const items2 = await listOpenClawWorkspaceFilesViaRuntime(makeContext());
    expect(items2.length).toBe(2);
  });
});

describe("listAllLocalFilesViaRuntime", () => {
  it("returns the local-files response shape", async () => {
    const out = await listAllLocalFilesViaRuntime(makeContext());
    expect(out).toEqual({ items: [], vaultCount: 0, workspaceCount: 0 });
  });
});

describe("setLibraryItemPublishedViaRuntime", () => {
  it("returns silently when profile dir is missing", async () => {
    await setLibraryItemPublishedViaRuntime(
      makeContext({ getProfileDir: () => null }),
      "doc",
      true,
    );
    expect(publishedStoreMocks.setPublished).not.toHaveBeenCalled();
  });

  it("calls setPublished with the right arguments", async () => {
    await setLibraryItemPublishedViaRuntime(makeContext(), "d1", true);
    expect(publishedStoreMocks.setPublished).toHaveBeenCalledWith("d1", true);
  });
});

describe("resolveOpenClawWorkspacePathViaRuntime", () => {
  it("throws if profile dir is missing", async () => {
    await expect(
      resolveOpenClawWorkspacePathViaRuntime(
        makeContext({ getProfileDir: () => null }),
        "x.md",
      ),
    ).rejects.toThrow(/profile dir/);
  });

  it("returns the absolute path for a valid relative path", async () => {
    const out = await resolveOpenClawWorkspacePathViaRuntime(makeContext(), "docs/x.md");
    expect(out.absolutePath).toBe("/abs/docs/x.md");
  });
});

describe("readOpenClawWorkspaceFileViaRuntime", () => {
  it("returns an empty result when profile dir is missing", async () => {
    const out = await readOpenClawWorkspaceFileViaRuntime(
      makeContext({ getProfileDir: () => null }),
      { relativePath: "x.md" },
    );
    expect(out).toEqual({
      contentBase64: "",
      mimeType: "application/octet-stream",
      sizeBytes: 0,
      truncated: false,
    });
  });

  it("returns the workspace-file content when profile dir is set", async () => {
    const out = await readOpenClawWorkspaceFileViaRuntime(makeContext(), {
      relativePath: "a.md",
      maxBytes: 1024,
    });
    expect(out.contentBase64).toBe(Buffer.from("hello").toString("base64"));
    expect(out.sizeBytes).toBe(5);
  });
});

describe("openLocalFileViaRuntime", () => {
  it("opens workspace files via the absolute path", async () => {
    const openVaultFile = vi.fn(async () => {});
    const openPathWithDefaultApp = await import("../src/vault-file-open.js").then(
      (m) => m.openPathWithDefaultApp,
    );
    await openLocalFileViaRuntime(makeContext(), openVaultFile, {
      source: "workspace",
      relativePath: "docs/x.md",
    });
    expect(openPathWithDefaultApp).toHaveBeenCalled();
    expect(openVaultFile).not.toHaveBeenCalled();
  });

  it("delegates to openVaultFile for vault sources", async () => {
    const openVaultFile = vi.fn(async () => {});
    await openLocalFileViaRuntime(makeContext(), openVaultFile, {
      source: "vault",
      relativePath: "docs/x.md",
    });
    expect(openVaultFile).toHaveBeenCalledWith("docs/x.md");
  });
});

describe("readLocalFileContentViaRuntime", () => {
  it("routes workspace sources to the workspace reader", async () => {
    const readFromVault = vi.fn(async () => ({
      contentBase64: "",
      mimeType: "x",
      sizeBytes: 0,
      truncated: false,
    }));
    const readFromWorkspace = vi.fn(async () => ({
      contentBase64: "abc",
      mimeType: "text/plain",
      sizeBytes: 3,
      truncated: false,
    }));
    const listVault = vi.fn(async () => []);
    await readLocalFileContentViaRuntime(
      makeContext(),
      readFromVault,
      readFromWorkspace,
      listVault,
      { source: "workspace", relativePath: "x.md" },
    );
    expect(readFromWorkspace).toHaveBeenCalledWith({ relativePath: "x.md", maxBytes: undefined });
    expect(readFromVault).not.toHaveBeenCalled();
    expect(listVault).not.toHaveBeenCalled();
  });

  it("for vault sources, looks up document by id when relativePath is empty", async () => {
    const readFromVault = vi.fn(async () => ({
      contentBase64: "AA==",
      mimeType: "x",
      sizeBytes: 1,
      truncated: false,
    }));
    const readFromWorkspace = vi.fn(async () => ({
      contentBase64: "",
      mimeType: "x",
      sizeBytes: 0,
      truncated: false,
    }));
    const listVault = vi.fn(async () => [
      { documentId: "d1", relativePath: "data/foo.md" } as LibraryItem,
    ]);
    await readLocalFileContentViaRuntime(
      makeContext(),
      readFromVault,
      readFromWorkspace,
      listVault,
      { source: "vault", relativePath: "", documentId: "d1" },
    );
    expect(listVault).toHaveBeenCalled();
    expect(readFromVault).toHaveBeenCalledWith({ relativePath: "data/foo.md", maxBytes: undefined });
  });

  it("for vault sources, throws when documentId is unknown", async () => {
    const readFromVault = vi.fn(async () => ({
      contentBase64: "",
      mimeType: "x",
      sizeBytes: 0,
      truncated: false,
    }));
    const readFromWorkspace = vi.fn(async () => ({
      contentBase64: "",
      mimeType: "x",
      sizeBytes: 0,
      truncated: false,
    }));
    const listVault = vi.fn(async () => []);
    await expect(
      readLocalFileContentViaRuntime(
        makeContext(),
        readFromVault,
        readFromWorkspace,
        listVault,
        { source: "vault", relativePath: "", documentId: "missing" },
      ),
    ).rejects.toThrow(/Document not found: missing/);
  });

  it("for vault sources with relativePath, skips the listVault lookup", async () => {
    const readFromVault = vi.fn(async () => ({
      contentBase64: "AA==",
      mimeType: "x",
      sizeBytes: 1,
      truncated: false,
    }));
    const listVault = vi.fn(async () => []);
    await readLocalFileContentViaRuntime(
      makeContext(),
      readFromVault,
      async () => ({ contentBase64: "", mimeType: "x", sizeBytes: 0, truncated: false }),
      listVault,
      { source: "vault", relativePath: "docs/x.md" },
    );
    expect(listVault).not.toHaveBeenCalled();
    expect(readFromVault).toHaveBeenCalledWith({ relativePath: "docs/x.md", maxBytes: undefined });
  });
});