/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { CodingNewSessionSheet } from "../../src/components/CodingNewSessionSheet.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { partialNodeService } from "../helpers/node-service-mock.js";

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => partialNodeService({
    getExtAgentCommandCatalog: vi.fn().mockResolvedValue({ models: [] }),
  }),
}));

describe("CodingNewSessionSheet Tier B (Phase 68-C3)", () => {
  afterEach(() => cleanup());

  it("lists only ready harnesses in the picker", () => {
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
    expect(screen.queryByTestId("coding-harness-opencode")).toBeNull();
    expect(screen.getByTestId("coding-harness-cursor")).toBeTruthy();
    expect(screen.getByTestId("coding-harness-codewhale")).toBeTruthy();

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

  it("snaps off a not-ready project default once ready agents load", async () => {
    function Harness() {
      const [enabled, setEnabled] = React.useState<
        readonly ("envoy-harness" | "pi" | "codex")[]
      >([]);
      return (
        <>
          <button
            type="button"
            data-testid="coding-test-ready-bump"
            onClick={() =>
              setEnabled(["envoy-harness", "pi", "codex"])
            }
          >
            ready
          </button>
          <CodingNewSessionSheet
            open
            projects={[
              {
                path: "/tmp/proj",
                label: "proj",
                addedAt: "2026-01-01T00:00:00.000Z",
                defaultHarness: "opencode",
              },
            ]}
            enabledHarnesses={enabled}
            onClose={() => {}}
            onConfirm={() => {}}
            onAddProject={() => {}}
          />
        </>
      );
    }

    renderWithI18n(<Harness />);

    // Current project default stays visible until Ready settles; Confirm stays off.
    expect(
      (screen.getByTestId("coding-harness-opencode") as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByTestId("coding-new-session-confirm") as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByTestId("coding-test-ready-bump"));

    expect(await screen.findByTestId("coding-harness-envoy-harness")).toBeTruthy();
    expect(
      (screen.getByTestId("coding-harness-envoy-harness") as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(screen.queryByTestId("coding-harness-opencode")).toBeNull();
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
      "coding-new-task-provider",
    ) as HTMLSelectElement;
    expect(provider.value).toBe("");
    expect(provider.options[0]?.textContent).toMatch(/Coding defaults/i);
    expect(
      screen.getByPlaceholderText(/Empty = Coding defaults \(openai:gpt-4o\)/i),
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId("coding-harness-pi"));
    expect(
      (screen.getByTestId("coding-new-task-provider") as HTMLSelectElement)
        .options[0]?.textContent,
    ).toMatch(/Coding defaults/i);

    fireEvent.click(screen.getByTestId("coding-harness-codex"));
    expect(
      (screen.getByTestId("coding-new-task-provider") as HTMLSelectElement)
        .options[0]?.textContent,
    ).toMatch(/Agent.?s own login/i);
    expect(screen.getByTestId("coding-model-hint-task").textContent).toMatch(
      /own login and default model/i,
    );
    expect(screen.getByTestId("coding-provider-hint-task").textContent).toMatch(
      /CLI.?s auth/i,
    );
    expect(
      screen.getByPlaceholderText(/this agent’s own login/i),
    ).toBeTruthy();
  });

  it("starts on the project's agent, not a fixed Envoy Harness default", () => {
    const onConfirm = vi.fn();
    renderWithI18n(
      <CodingNewSessionSheet
        open
        projects={[
          {
            path: "/tmp/proj",
            label: "proj",
            addedAt: "2026-01-01T00:00:00.000Z",
            defaultHarness: "codex",
            defaultModel: "gpt-5.1-codex",
          },
          {
            path: "/tmp/other",
            label: "other",
            addedAt: "2026-01-01T00:00:00.000Z",
            defaultHarness: "cursor",
          },
        ]}
        initialProjectPath="/tmp/proj"
        initialPrefill={{
          harness: "envoy-harness",
          model: "",
          providerKind: "",
          endpoint: "",
          apiKey: "",
        }}
        enabledHarnesses={[
          "envoy-harness",
          "pi",
          "codex",
          "cursor",
        ]}
        onClose={() => {}}
        onConfirm={onConfirm}
        onAddProject={() => {}}
      />,
    );

    expect(
      (screen.getByTestId("coding-harness-codex") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByTestId("coding-harness-envoy-harness") as HTMLInputElement)
        .checked,
    ).toBe(false);

    fireEvent.change(screen.getByTestId("coding-new-task-project"), {
      target: { value: "/tmp/other" },
    });
    expect(
      (screen.getByTestId("coding-harness-cursor") as HTMLInputElement).checked,
    ).toBe(true);

    fireEvent.click(screen.getByTestId("coding-harness-pi"));
    fireEvent.click(screen.getByTestId("coding-new-session-confirm"));
    expect(onConfirm).toHaveBeenCalledWith({
      harness: "pi",
      cwd: "/tmp/other",
      model: "",
      providerKind: "",
      endpoint: "",
      apiKey: "",
    });
  });
});
