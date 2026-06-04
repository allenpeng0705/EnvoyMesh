/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { AnswerRenderer } from "../../src/components/AnswerRenderer.js";

describe("AnswerRenderer", () => {
  it("renders markdown by default (no format)", () => {
    const { container } = render(<AnswerRenderer text="Hello **world**" />);
    // marked should produce <strong>world</strong>
    expect(container.innerHTML).toContain("<strong>world</strong>");
  });

  it("renders markdown when format is markdown", () => {
    const { container } = render(
      <AnswerRenderer text="- one\n- two" format="markdown" />,
    );
    // Lists should be parsed by marked
    expect(container.querySelector("ul")).not.toBeNull();
  });

  it("renders plain text when format is plain (no markdown parsing)", () => {
    const { container } = render(
      <AnswerRenderer text="Hello **world**" format="plain" />,
    );
    // Should NOT have parsed the bold
    expect(container.querySelector("strong")).toBeNull();
    expect(container.textContent).toContain("Hello **world**");
  });

  it("renders structured blocks when format is structured", () => {
    const { container } = render(
      <AnswerRenderer
        text="Here are your files:"
        format="structured"
        blocks={[
          { type: "paragraph", text: "Recently published" },
          {
            type: "list",
            items: ["report.pdf", "notes.md", "checklist.md"],
            style: "check",
          },
          {
            type: "card",
            title: "Quarterly Report",
            subtitle: "PDF · 1.2 MB",
            meta: ["Author: Alice", "Updated: yesterday"],
          },
          {
            type: "status",
            tone: "success",
            text: "3 items found in your vault",
          },
        ]}
      />,
    );
    expect(container.querySelector(".answer-block-paragraph")).not.toBeNull();
    expect(container.querySelector(".answer-block-list--check")).not.toBeNull();
    expect(container.textContent).toContain("report.pdf");
    expect(container.querySelector(".answer-block-card")).not.toBeNull();
    expect(container.textContent).toContain("Quarterly Report");
    expect(container.querySelector(".answer-block-status--success")).not.toBeNull();
  });

  it("falls back to markdown when structured has no blocks", () => {
    const { container } = render(
      <AnswerRenderer text="**bold**" format="structured" blocks={[]} />,
    );
    // Empty blocks should fall through to markdown rendering
    expect(container.innerHTML).toContain("<strong>bold</strong>");
  });
});
