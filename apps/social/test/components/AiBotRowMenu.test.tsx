/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { AiBotDefinition } from "@envoymesh/api";
import { AiBotRowMenu } from "../../src/components/AiBotRowMenu.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const bot: AiBotDefinition = {
  id: "bot-1",
  name: "Helper",
  enabled: true,
  systemPrompt: "Be helpful",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
});

describe("AiBotRowMenu", () => {
  it("shows ⋯ and opens Edit/Delete menu", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderWithI18n(<AiBotRowMenu bot={bot} onEdit={onEdit} onDelete={onDelete} />);

    const trigger = screen.getByTestId("ai-bot-row-menu-btn-bot-1");
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger);

    expect(screen.getByTestId("ai-bot-row-menu-bot-1")).toBeTruthy();
    fireEvent.click(screen.getByTestId("ai-bot-row-menu-edit-bot-1"));
    expect(onEdit).toHaveBeenCalledWith(bot);
  });

  it("calls onDelete from the menu", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderWithI18n(<AiBotRowMenu bot={bot} onEdit={onEdit} onDelete={onDelete} />);

    fireEvent.click(screen.getByTestId("ai-bot-row-menu-btn-bot-1"));
    fireEvent.click(screen.getByTestId("ai-bot-row-menu-delete-bot-1"));
    expect(onDelete).toHaveBeenCalledWith(bot);
  });
});
