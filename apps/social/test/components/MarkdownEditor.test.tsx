/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { MarkdownEditor } from "../../src/components/MarkdownEditor.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MarkdownEditor", () => {
  it("wraps selection in bold via toolbar", () => {
    const onChange = vi.fn();
    renderWithI18n(<MarkdownEditor value="hello world" onChange={onChange} />);
    const textarea = screen.getByTestId("markdown-editor-textarea") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 5);
    fireEvent.click(screen.getByTestId("markdown-editor-tool-bold"));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0] as string;
    expect(next).toContain("**hello**");
  });

  it("prefixes a Title heading", () => {
    const onChange = vi.fn();
    renderWithI18n(<MarkdownEditor value="My story" onChange={onChange} />);
    const textarea = screen.getByTestId("markdown-editor-textarea") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 8);
    fireEvent.click(screen.getByTestId("markdown-editor-tool-h1"));
    const next = onChange.mock.calls.at(-1)?.[0] as string;
    expect(next.startsWith("# ")).toBe(true);
  });

  it("inserts a markdown link from prompts", () => {
    vi.spyOn(window, "prompt")
      .mockReturnValueOnce("https://example.com")
      .mockReturnValueOnce("Example");
    const onChange = vi.fn();
    renderWithI18n(<MarkdownEditor value="" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("markdown-editor-tool-link"));
    const next = onChange.mock.calls.at(-1)?.[0] as string;
    expect(next).toContain("[Example](https://example.com)");
  });

  it("shows split preview pane", () => {
    renderWithI18n(<MarkdownEditor value="## Hello" onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("markdown-editor-split-tab"));
    expect(screen.getByTestId("markdown-editor-textarea")).toBeTruthy();
    expect(screen.getByTestId("markdown-editor-preview")).toBeTruthy();
    expect(screen.getByTestId("markdown-editor-preview").textContent).toContain("Hello");
  });

  it("localizes toolbar chrome in zh", () => {
    renderWithI18n(<MarkdownEditor value="" onChange={vi.fn()} />, { locale: "zh" });
    expect(screen.getByTestId("markdown-editor-write-tab").textContent).toBe("撰写");
    expect(screen.getByTestId("markdown-editor-preview-tab").textContent).toBe("预览");
    expect(screen.getByTestId("markdown-editor-tool-h1").textContent).toBe("标题");
  });
});
