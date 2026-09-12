/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { CodingNewSessionSheet } from "../../src/components/CodingNewSessionSheet.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    getExtAgentCommandCatalog: vi.fn().mockResolvedValue({ models: [] }),
  }),
}));

describe("CodingNewSessionSheet Tier B (Phase 68-C3)", () => {
  afterEach(() => cleanup());

  it("lists Tier B harness radios when enabled", () => {
    const onConfirm = vi.fn();
    renderWithI18n(
      <CodingNewSessionSheet
        open
        projects={[{ path: "/tmp/proj", label: "proj", addedAt: "2026-01-01T00:00:00.000Z" }]}
        enabledHarnesses={[
          "envoy-harness",
          "pi",
          "claudecode",
          "codex",
          "opencode",
          "cursor",
          "codewhale",
        ]}
        harnessProbe={{
          codex: "ready",
          opencode: "install",
        }}
        onClose={() => {}}
        onConfirm={onConfirm}
        onAddProject={() => {}}
      />,
    );

    expect(screen.getByTestId("coding-harness-claudecode")).toBeTruthy();
    expect(screen.getByTestId("coding-harness-codex")).toBeTruthy();
    expect(screen.getByTestId("coding-harness-opencode")).toBeTruthy();
    expect(screen.getByTestId("coding-harness-cursor")).toBeTruthy();
    expect(screen.getByTestId("coding-harness-codewhale")).toBeTruthy();
    expect(screen.getByTestId("coding-harness-probe-codex").textContent).toMatch(/Ready/i);
    expect(screen.getByTestId("coding-harness-probe-opencode").textContent).toMatch(/Install/i);

    fireEvent.click(screen.getByTestId("coding-harness-codex"));
    fireEvent.click(screen.getByTestId("coding-new-session-confirm"));
    expect(onConfirm).toHaveBeenCalledWith({
      harness: "codex",
      cwd: "/tmp/proj",
      model: "",
      providerKind: "",
      endpoint: "",
      apiKey: "",
    });
  });

  it("shows Coding defaults as fallback for Envoy and Pi", () => {
    renderWithI18n(
      <CodingNewSessionSheet
        open
        projects={[
          {
            path: "/tmp/proj",
            label: "proj",
            addedAt: "2026-01-01T00:00:00.000Z",
          },
        ]}
        initialPrefill={{
          harness: "envoy-harness",
          model: "",
          providerKind: "",
          endpoint: "",
          apiKey: "",
        }}
        codingDefaultsModelHint="openai:gpt-4o"
        enabledHarnesses={["envoy-harness", "pi", "codex"]}
        onClose={() => {}}
        onConfirm={() => {}}
        onAddProject={() => {}}
      />,
    );

    const provider = screen.getByTestId(
      "coding-new-workspace-provider",
    ) as HTMLSelectElement;
    expect(provider.value).toBe("");
    expect(provider.options[0]?.textContent).toMatch(/Coding defaults/i);
    expect(
      screen.getByPlaceholderText(/Empty = Coding defaults \(openai:gpt-4o\)/i),
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId("coding-harness-pi"));
    expect(
      (screen.getByTestId("coding-new-workspace-provider") as HTMLSelectElement)
        .options[0]?.textContent,
    ).toMatch(/Coding defaults/i);

    fireEvent.click(screen.getByTestId("coding-harness-codex"));
    expect(
      (screen.getByTestId("coding-new-workspace-provider") as HTMLSelectElement)
        .options[0]?.textContent,
    ).toMatch(/Agent default/i);
  });
});
