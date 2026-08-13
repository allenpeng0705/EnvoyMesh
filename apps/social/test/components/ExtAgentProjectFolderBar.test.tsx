/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { HomeFolderPicker } from "../../src/components/HomeFolderPicker.js";
import { extAgentUsesProjectPath } from "@envoymesh/api";

vi.mock("../../src/lib/tauri-shell.js", () => ({
  isTauriShell: () => false,
  pickTauriDirectory: vi.fn(),
}));

afterEach(() => cleanup());

describe("Ext Agent project folder chat chrome", () => {
  it("gates coding agents that show the chat header folder bar", () => {
    expect(extAgentUsesProjectPath("codex")).toBe(true);
    expect(extAgentUsesProjectPath("claudecode")).toBe(true);
    expect(extAgentUsesProjectPath("hermes")).toBe(true);
    expect(extAgentUsesProjectPath("openhuman")).toBe(true);
    expect(extAgentUsesProjectPath("pi")).toBe(false);
  });

  it("browser Social uses Browse → home folder modal (same as Tauri, read-only path)", () => {
    const onChange = vi.fn();
    renderWithI18n(
      <div data-testid="ext-agent-project-folder">
        <HomeFolderPicker
          className="home-folder-picker home-folder-picker--compact"
          value="/tmp/project"
          onChange={onChange}
        />
      </div>,
    );
    expect(screen.getByTestId("ext-agent-project-folder")).toBeTruthy();
    const input = screen.getByDisplayValue("/tmp/project") as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    expect(screen.getByRole("button", { name: /Browse/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Set$/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Clear$/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
