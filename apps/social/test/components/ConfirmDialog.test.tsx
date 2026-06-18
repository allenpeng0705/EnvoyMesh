/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { ConfirmDialog } from "../../src/components/ConfirmDialog.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

describe("ConfirmDialog", () => {
  afterEach(() => cleanup());

  it("renders title and message", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithI18n(
      <ConfirmDialog
        title="Delete this item?"
        message="This action cannot be undone."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Delete this item?")).toBeDefined();
    });
    expect(screen.getByText("This action cannot be undone.")).toBeDefined();
  });

  it("calls onConfirm when the confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithI18n(
      <ConfirmDialog
        title="Are you sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the cancel button is clicked", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithI18n(
      <ConfirmDialog
        title="Are you sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onCancel when the overlay is clicked", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithI18n(
      <ConfirmDialog title="Overlay test" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    const overlay = screen.getByRole("presentation");
    fireEvent.click(overlay);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("uses custom confirmLabel when provided", async () => {
    const onConfirm = vi.fn();
    renderWithI18n(
      <ConfirmDialog
        title="Delete?"
        confirmLabel="Delete forever"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const confirmBtn = screen.getByRole("button", { name: "Delete forever" });
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("dismisses with Escape key", async () => {
    const onCancel = vi.fn();
    renderWithI18n(
      <ConfirmDialog title="Press Escape" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    const panel = screen.getByRole("alertdialog");
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("applies the destructive class to the confirm button when variant is destructive", async () => {
    renderWithI18n(
      <ConfirmDialog
        title="Delete this item?"
        variant="destructive"
        confirmLabel="Delete forever"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const confirmBtn = screen.getByRole("button", { name: "Delete forever" });
    expect(confirmBtn.className).toContain("danger");
    // Default variant must NOT include the danger class
    cleanup();
    renderWithI18n(
      <ConfirmDialog title="Safe action" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    const safeBtn = screen.getByRole("button", { name: "Confirm" });
    expect(safeBtn.className).not.toContain("danger");
  });

  it("traps Tab focus inside the dialog", async () => {
    renderWithI18n(
      <ConfirmDialog title="Trap test" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    const panel = screen.getByRole("alertdialog");
    // Focus the last button (confirm), then Tab — focus should wrap to the first
    const buttons = panel.querySelectorAll("button");
    const lastBtn = buttons[buttons.length - 1];
    if (!lastBtn) throw new Error("expected focusable buttons in dialog");
    lastBtn.focus();
    expect(document.activeElement).toBe(lastBtn);
    fireEvent.keyDown(panel, { key: "Tab" });
    const firstBtn = buttons[0];
    expect(document.activeElement).toBe(firstBtn);
    // Shift+Tab from first should wrap to last
    if (!firstBtn) throw new Error("expected first button");
    firstBtn.focus();
    fireEvent.keyDown(panel, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastBtn);
  });
});
