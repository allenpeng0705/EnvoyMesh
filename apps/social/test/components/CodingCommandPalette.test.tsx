/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { CodingCommandPalette } from "../../src/components/CodingCommandPalette.js";
import type { CodingPaletteItem } from "../../src/lib/coding-palette-items.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const items: CodingPaletteItem[] = [
  {
    id: "action:new-task",
    kind: "action",
    label: "New task",
    detail: "Action",
    action: { type: "new-task" },
  },
  {
    id: "task:eh:c1",
    kind: "task",
    label: "Fix login",
    detail: "Envoy Harness · /repo",
    path: "/repo",
    harness: "Envoy Harness",
    action: {
      type: "select-session",
      ref: { kind: "eh", chatId: "c1", title: "Fix login" },
    },
  },
];

describe("CodingCommandPalette", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when closed", () => {
    renderWithI18n(
      <CodingCommandPalette
        open={false}
        items={items}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("coding-command-palette")).toBeNull();
  });

  it("opens, filters, selects with Enter, closes with Esc", () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    renderWithI18n(
      <CodingCommandPalette
        open
        items={items}
        onClose={onClose}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByTestId("coding-command-palette")).toBeTruthy();
    const input = screen.getByTestId("coding-palette-input");
    fireEvent.change(input, { target: { value: "login" } });
    expect(
      screen.getByTestId("coding-palette-item-task:eh:c1"),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("coding-palette-item-action:new-task"),
    ).toBeNull();

    fireEvent.keyDown(window, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task:eh:c1" }),
    );

    onSelect.mockClear();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("moves highlight with arrow keys then selects", () => {
    const onSelect = vi.fn();
    renderWithI18n(
      <CodingCommandPalette
        open
        items={items}
        onClose={vi.fn()}
        onSelect={onSelect}
      />,
    );
    const second = screen.getByTestId("coding-palette-item-task:eh:c1");
    fireEvent.mouseEnter(second);
    fireEvent.click(second);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task:eh:c1" }),
    );
  });
});
