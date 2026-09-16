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
  it("renders Ask/Plan/Code and Fast for Codex", () => {
    const onPrefsChange = vi.fn();
    renderWithI18n(
      <CodingComposerToolbar
        harness="codex"
        prefs={{ mode: "code", fast: false, thinking: "off" }}
        onPrefsChange={onPrefsChange}
        onImportSession={() => {}}
      />,
    );

    expect(screen.getByTestId("coding-composer-toolbar")).toBeTruthy();
    fireEvent.click(screen.getByTestId("coding-composer-mode-plan"));
    expect(onPrefsChange).toHaveBeenCalledWith({ mode: "plan" });
    fireEvent.click(screen.getByTestId("coding-composer-fast"));
    expect(onPrefsChange).toHaveBeenCalledWith({ fast: true });
    expect(screen.getByTestId("coding-composer-import")).toBeTruthy();
  });

  it("hides Fast for Pi", () => {
    renderWithI18n(
      <CodingComposerToolbar
        harness="pi"
        prefs={{ mode: "code", fast: false, thinking: "off" }}
        onPrefsChange={() => {}}
      />,
    );
    expect(screen.queryByTestId("coding-composer-fast")).toBeNull();
    expect(screen.getByTestId("coding-composer-mode-ask")).toBeTruthy();
  });
});
