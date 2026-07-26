/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { AuthorAiDraftField } from "../../src/components/AuthorAiDraftField.js";

const draftAuthorContent = vi.fn();
let mockNodeConfig: { modelProviders: { mode: string } } = {
  modelProviders: { mode: "openai-compatible" },
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({ draftAuthorContent }),
  useIsInProcessMobileNode: () => false,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    nodeConfig: mockNodeConfig,
    humanProfile: { displayName: "Alice", hobbies: ["music"] },
  }),
}));

describe("AuthorAiDraftField", () => {
  beforeEach(() => {
    draftAuthorContent.mockReset();
    draftAuthorContent.mockResolvedValue({ ok: true, text: "Drafted bio about music." });
    mockNodeConfig = { modelProviders: { mode: "openai-compatible" } };
  });

  afterEach(() => cleanup());

  it("disables Draft with AI when Settings → AI provider is disabled", () => {
    mockNodeConfig = { modelProviders: { mode: "disabled" } };
    renderWithI18n(
      <AuthorAiDraftField surface="bio" label="Bio" htmlFor="bio" value="" onApply={() => undefined}>
        <textarea id="bio" />
      </AuthorAiDraftField>,
    );

    const trigger = screen.getByTestId("author-ai-draft-trigger-bio") as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    expect(trigger.title).toMatch(/Settings → AI|设置 → AI/i);
    fireEvent.click(trigger);
    expect(screen.queryByTestId("author-ai-draft-sheet-bio")).toBeNull();
    expect(draftAuthorContent).not.toHaveBeenCalled();
  });

  it("opens sheet, generates, and inserts into empty field", async () => {
    const onApply = vi.fn();
    renderWithI18n(
      <AuthorAiDraftField
        surface="bio"
        label="Bio"
        htmlFor="bio"
        value=""
        onApply={onApply}
      >
        <textarea id="bio" />
      </AuthorAiDraftField>,
    );

    fireEvent.click(screen.getByTestId("author-ai-draft-trigger-bio"));
    expect(screen.getByTestId("author-ai-draft-sheet-bio")).toBeTruthy();
    fireEvent.click(screen.getByTestId("author-ai-draft-generate-bio"));

    await waitFor(() => {
      expect(draftAuthorContent).toHaveBeenCalledWith(
        expect.objectContaining({ surface: "bio", mode: "write" }),
      );
    });

    expect(await screen.findByTestId("author-ai-draft-card-bio")).toBeTruthy();
    fireEvent.click(screen.getByTestId("author-ai-draft-insert-bio"));
    expect(onApply).toHaveBeenCalledWith("Drafted bio about music.", "insert");
  });

  it("offers rewrite/expand/shorten when field has text", async () => {
    renderWithI18n(
      <AuthorAiDraftField
        surface="blog"
        label="Story"
        htmlFor="story"
        value="Existing post"
        onApply={() => undefined}
      >
        <textarea id="story" />
      </AuthorAiDraftField>,
    );

    fireEvent.click(screen.getByTestId("author-ai-draft-trigger-blog"));
    expect(screen.getByText("Rewrite")).toBeTruthy();
    expect(screen.getByText("Expand")).toBeTruthy();
    expect(screen.getByText("Shorten")).toBeTruthy();
  });
});
