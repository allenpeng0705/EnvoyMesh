/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { CodingProjectSettingsModal } from "../../src/components/CodingProjectSettingsModal.js";
import { CodingNewSessionSheet } from "../../src/components/CodingNewSessionSheet.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

afterEach(() => cleanup());

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    getExtAgentCommandCatalog: vi.fn().mockResolvedValue({ models: [] }),
  }),
}));

describe("CodingProjectSettingsModal", () => {
  it("shows saved default harness instead of Envoy", () => {
    renderWithI18n(
      <CodingProjectSettingsModal
        project={{
          path: "/projects/app",
          label: "app",
          addedAt: "2020-01-01T00:00:00.000Z",
          defaultHarness: "cursor",
        }}
        onCancel={() => {}}
        onSave={() => {}}
        onReveal={() => {}}
      />,
    );

    expect(
      (screen.getByTestId("coding-project-settings-harness") as HTMLSelectElement)
        .value,
    ).toBe("cursor");
  });

  it("saves agent, model, and compatible provider", () => {
    const onSave = vi.fn();
    renderWithI18n(
      <CodingProjectSettingsModal
        project={{
          path: "/projects/app",
          label: "app",
          addedAt: "2020-01-01T00:00:00.000Z",
        }}
        onCancel={() => {}}
        onSave={onSave}
        onReveal={() => {}}
      />,
    );

    fireEvent.change(screen.getByTestId("coding-project-settings-name"), {
      target: { value: "Demo" },
    });
    fireEvent.change(screen.getByTestId("coding-project-settings-harness"), {
      target: { value: "pi" },
    });
    fireEvent.change(screen.getByTestId("coding-project-settings-model"), {
      target: { value: "gpt-4o" },
    });
    fireEvent.change(screen.getByTestId("coding-project-settings-provider"), {
      target: { value: "openai-compatible" },
    });
    fireEvent.change(screen.getByTestId("coding-project-settings-endpoint"), {
      target: { value: "https://api.openai.com/v1" },
    });
    fireEvent.change(screen.getByTestId("coding-project-settings-apikey"), {
      target: { value: "sk-test" },
    });
    fireEvent.click(screen.getByTestId("coding-project-settings-save"));

    expect(onSave).toHaveBeenCalledWith({
      label: "Demo",
      defaultHarness: "pi",
      defaultModel: "gpt-4o",
      defaultProviderKind: "openai-compatible",
      defaultEndpoint: "https://api.openai.com/v1",
      defaultApiKey: "sk-test",
    });
  });
});

describe("CodingNewSessionSheet workspace override", () => {
  it("prefills from project and confirms override payload", () => {
    const onConfirm = vi.fn();
    renderWithI18n(
      <CodingNewSessionSheet
        open
        projects={[
          {
            path: "/projects/app",
            label: "app",
            addedAt: "2020-01-01T00:00:00.000Z",
            defaultHarness: "pi",
            defaultModel: "gpt-4o",
            defaultProviderKind: "openai-compatible",
          },
        ]}
        initialProjectPath="/projects/app"
        initialPrefill={{
          harness: "pi",
          model: "gpt-4o",
          providerKind: "openai-compatible",
          endpoint: "",
          apiKey: "",
        }}
        onClose={() => {}}
        onConfirm={onConfirm}
        onAddProject={() => {}}
      />,
    );

    const pi = screen.getByTestId("coding-harness-pi") as HTMLInputElement;
    expect(pi.checked).toBe(true);
    expect(
      (screen.getByTestId("coding-new-workspace-model") as HTMLInputElement)
        .value,
    ).toBe("gpt-4o");

    fireEvent.change(screen.getByTestId("coding-new-workspace-model"), {
      target: { value: "o4-mini" },
    });
    fireEvent.click(screen.getByTestId("coding-new-session-confirm"));
    expect(onConfirm).toHaveBeenCalledWith({
      harness: "pi",
      cwd: "/projects/app",
      model: "o4-mini",
      providerKind: "openai-compatible",
      endpoint: "",
      apiKey: "",
    });
  });
});
