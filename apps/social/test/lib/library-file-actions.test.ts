/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isBrowserInlineViewableMime,
  openContentInBrowser,
  openLocalFile,
  openVaultLibraryFile,
  vaultFilenameFromRelativePath,
  withUtf8Charset,
} from "../../src/lib/library-file-actions.js";

describe("library-file-actions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("withUtf8Charset adds charset for text and markdown", () => {
    expect(withUtf8Charset("text/markdown")).toBe("text/markdown; charset=utf-8");
    expect(withUtf8Charset("text/plain")).toBe("text/plain; charset=utf-8");
    expect(withUtf8Charset("text/plain; charset=utf-8")).toBe("text/plain; charset=utf-8");
    expect(withUtf8Charset("application/pdf")).toBe("application/pdf");
  });

  it("vaultFilenameFromRelativePath returns basename", () => {
    expect(vaultFilenameFromRelativePath("docs/report.pdf")).toBe("report.pdf");
    expect(vaultFilenameFromRelativePath("\\vault\\note.txt")).toBe("note.txt");
  });

  it("isBrowserInlineViewableMime recognizes common viewable types", () => {
    expect(isBrowserInlineViewableMime("text/plain")).toBe(true);
    expect(isBrowserInlineViewableMime("image/png")).toBe(true);
    expect(isBrowserInlineViewableMime("application/pdf")).toBe(true);
    expect(isBrowserInlineViewableMime("application/octet-stream")).toBe(false);
  });

  it("openContentInBrowser opens inline types in a new tab", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);
    const pdfBase64 = btoa("%PDF-1.4");
    openContentInBrowser({
      contentBase64: pdfBase64,
      mimeType: "application/pdf",
      filename: "report.pdf",
    });
    expect(openSpy).toHaveBeenCalledWith(expect.stringMatching(/^blob:/), "_blank", "noopener,noreferrer");
  });

  it("openContentInBrowser downloads non-inline types", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    openContentInBrowser({
      contentBase64: btoa("binary"),
      mimeType: "application/octet-stream",
      filename: "data.bin",
    });
    expect(openSpy).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });

  it("openLocalFile falls back to node openLocalFile when preview is too large", async () => {
    const readLocalFileContent = vi
      .fn()
      .mockRejectedValue(new Error("File too large for preview (9000000 bytes, max 5242880)"));
    const openLocalFileRpc = vi.fn().mockResolvedValue(undefined);
    const openLibraryItem = vi.fn();

    await openLocalFile(
      {
        readLocalFileContent,
        openLocalFile: openLocalFileRpc,
        openLibraryItem,
        readLibraryItemContent: readLocalFileContent,
      },
      { source: "vault", relativePath: "big.zip" },
    );

    expect(openLocalFileRpc).toHaveBeenCalledWith({ source: "vault", relativePath: "big.zip" });
  });

  it("openLocalFile reads content and opens in browser", async () => {
    const readLocalFileContent = vi.fn().mockResolvedValue({
      contentBase64: btoa("hello"),
      mimeType: "text/plain",
      sizeBytes: 5,
      truncated: false,
    });
    const openLocalFileRpc = vi.fn();
    const openLibraryItem = vi.fn();
    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);

    await openLocalFile(
      {
        readLocalFileContent,
        openLocalFile: openLocalFileRpc,
        openLibraryItem,
        readLibraryItemContent: readLocalFileContent,
      },
      { source: "workspace", relativePath: "IDENTITY.md" },
    );

    expect(readLocalFileContent).toHaveBeenCalledWith({
      source: "workspace",
      relativePath: "IDENTITY.md",
    });
    expect(openSpy).toHaveBeenCalled();
    expect(openLocalFileRpc).not.toHaveBeenCalled();
  });

  it("openVaultLibraryFile reads content and opens in browser", async () => {
    const readLocalFileContent = vi.fn().mockResolvedValue({
      contentBase64: btoa("hello"),
      mimeType: "text/plain",
      sizeBytes: 5,
      truncated: false,
    });
    const openLocalFileRpc = vi.fn();
    const openLibraryItem = vi.fn();
    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);

    await openVaultLibraryFile(
      {
        readLocalFileContent,
        openLocalFile: openLocalFileRpc,
        openLibraryItem,
        readLibraryItemContent: readLocalFileContent,
      },
      "notes/hello.txt",
    );

    expect(readLocalFileContent).toHaveBeenCalledWith({
      source: "vault",
      relativePath: "notes/hello.txt",
    });
    expect(openSpy).toHaveBeenCalled();
    expect(openLocalFileRpc).not.toHaveBeenCalled();
  });
});
