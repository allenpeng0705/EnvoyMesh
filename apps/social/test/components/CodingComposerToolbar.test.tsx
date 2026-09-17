/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { CodingComposerToolbar } from "../../src/components/CodingComposerToolbar.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

afterEach(() => cleanup());

describe("CodingComposerToolbar", () => {
  it("renders Codex agent modes and disables Full access", () => {
    const onPrefsChange = vi.fn();
    renderWithI18n(
      <CodingComposerToolbar
        harness="codex"
        prefs={{
          mode: "code",
          fast: false,
          thinking: "off",
          agentModeId: "agent",
          permissionPolicy: "safe-only",
        }}
        onPrefsChange={onPrefsChange}
        onImportSession={() => {}}
      />,
    );

    expect(screen.getByTestId("coding-composer-toolbar")).toBeTruthy();
    expect(screen.getByTestId("coding-composer-agent-mode")).toBeTruthy();
    expect(screen.queryByTestId("coding-composer-mode-plan")).toBeNull();
    fireEvent.click(screen.getByTestId("coding-composer-fast"));
    expect(onPrefsChange).toHaveBeenCalledWith({ fast: true });

    const full = screen
      .getByTestId("coding-composer-permissions")
      .querySelector('option[value="off"]') as HTMLOptionElement;
    expect(full.disabled).toBe(true);
  });

  it("shows Ask/Plan/Code for Pi and fires permission changes", () => {
    const onPrefsChange = vi.fn();
    const onPermissionPolicyChange = vi.fn();
    renderWithI18n(
      <CodingComposerToolbar
        harness="pi"
        prefs={{
          mode: "code",
          fast: false,
          thinking: "off",
          permissionPolicy: "safe-only",
        }}
        onPrefsChange={onPrefsChange}
        onPermissionPolicyChange={onPermissionPolicyChange}
      />,
    );
    expect(screen.queryByTestId("coding-composer-fast")).toBeNull();
    expect(screen.getByTestId("coding-composer-mode-ask")).toBeTruthy();
    fireEvent.change(screen.getByTestId("coding-composer-permissions"), {
      target: { value: "always-confirm" },
    });
    expect(onPrefsChange).toHaveBeenCalledWith({
      permissionPolicy: "always-confirm",
    });
    expect(onPermissionPolicyChange).toHaveBeenCalledWith("always-confirm");
  });

  it("shows EH Mode + Perms", () => {
    renderWithI18n(
      <CodingComposerToolbar
        harness="envoy-harness"
        prefs={{
          mode: "code",
          fast: false,
          thinking: "off",
          agentModeId: "default",
          permissionPolicy: "safe-only",
        }}
        onPrefsChange={() => {}}
      />,
    );
    expect(screen.getByTestId("coding-composer-agent-mode")).toBeTruthy();
    expect(screen.getByTestId("coding-composer-permissions")).toBeTruthy();
    const full = screen
      .getByTestId("coding-composer-permissions")
      .querySelector('option[value="off"]') as HTMLOptionElement;
    expect(full.disabled).toBe(false);
  });

  it("disables Ask for catalog ACP harnesses", () => {
    const onPrefsChange = vi.fn();
    renderWithI18n(
      <CodingComposerToolbar
        harness="gemini"
        prefs={{
          mode: "code",
          fast: false,
          thinking: "off",
          permissionPolicy: "safe-only",
        }}
        onPrefsChange={onPrefsChange}
      />,
    );
    const ask = screen
      .getByTestId("coding-composer-permissions")
      .querySelector('option[value="always-confirm"]') as HTMLOptionElement;
    expect(ask.disabled).toBe(true);
  });
});
