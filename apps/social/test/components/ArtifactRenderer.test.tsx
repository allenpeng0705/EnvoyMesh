/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { ArtifactList } from "../../src/components/ArtifactRenderer.js";
import type { Artifact } from "@envoymesh/api";

// Toast + I18n are wired in jsdom via the global providers the rest of the
// test suite already uses; we don't have those globals here, so stub them.
vi.mock("../../src/hooks/useToast.js", () => ({
  useToastOptional: () => null,
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));

const textArtifact: Artifact = {
  kind: "text",
  content: "# Hello\n\nA small **markdown** snippet.",
  mimeType: "text/markdown",
};

const plainTextArtifact: Artifact = {
  kind: "text",
  content: "indented\n  text",
  mimeType: "text/plain",
};

const fileArtifact: Artifact = {
  kind: "file",
  vaultPath: "inbox/2026-06-16/report.pdf",
  contentHash: "0123456789abcdef0123456789abcdef01234567",
  sizeBytes: 2048,
  mimeType: "application/pdf",
  displayName: "Q2 report",
};

const structuredArtifact: Artifact = {
  kind: "structured",
  schemaRef: "envoymesh:contact-card/v1",
  data: { name: "Ada", handles: ["x", "y"] },
};

describe("ArtifactRenderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders a text artifact as markdown when mimeType=text/markdown", () => {
    render(<ArtifactList artifacts={[textArtifact]} />);
    const root = document.querySelector(".artifact-text");
    expect(root).not.toBeNull();
    // The markdown component should turn the heading into <h1> + <strong>.
    expect(root?.querySelector("h1")?.textContent).toContain("Hello");
    expect(root?.querySelector("strong")?.textContent).toContain("markdown");
  });

  it("preserves whitespace for plain text artifacts", () => {
    render(<ArtifactList artifacts={[plainTextArtifact]} />);
    const pre = document.querySelector(".artifact-plain-text");
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toBe("indented\n  text");
  });

  it("renders file metadata and an Open button (v1 stub)", () => {
    const onOpen = vi.fn().mockResolvedValue(undefined);
    render(
      <ArtifactList artifacts={[fileArtifact]} onOpenLocalFile={onOpen} />,
    );
    const item = screen.getByText("Q2 report").closest(".artifact-file");
    expect(item).not.toBeNull();
    expect(within(item as HTMLElement).getByText("application/pdf")).toBeTruthy();
    expect(within(item as HTMLElement).getByText(/2\.0 KB|2048 B/)).toBeTruthy();
    const cta = within(item as HTMLElement).getByRole("button", { name: "Open" });
    fireEvent.click(cta);
    expect(onOpen).toHaveBeenCalledWith({
      source: "vault",
      relativePath: "inbox/2026-06-16/report.pdf",
    });
  });

  it("falls back to the stub toast when no opener is wired", () => {
    render(<ArtifactList artifacts={[fileArtifact]} />);
    const cta = screen.getByRole("button", { name: "Open" });
    // No exception = the stub path is reachable.
    expect(() => fireEvent.click(cta)).not.toThrow();
  });

  it("renders structured artifacts collapsed by default with the schema label", () => {
    render(<ArtifactList artifacts={[structuredArtifact]} />);
    const root = screen.getByText("envoymesh:contact-card/v1").closest(".artifact-structured");
    expect(root).not.toBeNull();
    // Data must NOT be in the DOM yet.
    expect(root?.textContent).not.toContain("Ada");
  });

  it("expands structured artifacts on click and shows the JSON", () => {
    render(<ArtifactList artifacts={[structuredArtifact]} />);
    const toggle = document.querySelector(
      ".artifact-structured-summary",
    ) as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle);
    const pre = document.querySelector(".artifact-structured-pre");
    expect(pre?.textContent).toContain("Ada");
    expect(pre?.textContent).toContain("handles");
  });

  it("renders multiple artifacts in a list", () => {
    render(
      <ArtifactList
        artifacts={[textArtifact, fileArtifact, structuredArtifact]}
      />,
    );
    expect(document.querySelectorAll(".artifact-list-item")).toHaveLength(3);
  });

  it("renders nothing when given an empty list", () => {
    const { container } = render(<ArtifactList artifacts={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
