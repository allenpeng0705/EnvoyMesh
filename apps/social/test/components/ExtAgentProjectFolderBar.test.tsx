/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { ProjectFolderLink } from "../../src/components/ProjectFolderLink.js";
import { extAgentUsesProjectPath } from "@envoymesh/api";

vi.mock("../../src/lib/tauri-shell.js", () => ({
  isTauriShell: () => false,
  pickTauriDirectory: vi.fn(),
}));

vi.mock("../../src/components/HomeFolderPicker.js", () => ({
  HomeFolderPicker: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange: (path: string | undefined) => void;
  }) => (
    <input
      data-testid="home-folder-picker-mock"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  ),
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

  it("shows No folder selected when unset and opens modal on click", () => {
    const onSave = vi.fn();
    renderWithI18n(
      <div data-testid="ext-agent-project-folder">
        <ProjectFolderLink path={undefined} onSave={onSave} />
      </div>,
    );
    expect(screen.getByTestId("ext-agent-project-folder")).toBeTruthy();
    expect(screen.getByText("No folder selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /project folder/i }));
    expect(screen.getByTestId("home-folder-picker-mock")).toBeTruthy();
  });

  it("shows the path as a link when set", () => {
    renderWithI18n(
      <ProjectFolderLink path="/tmp/project" onSave={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /project folder/i }).textContent).toBe(
      "/tmp/project",
    );
  });
});
