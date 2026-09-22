/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { CodingProjectPickerModal } from "../../src/components/CodingProjectPickerModal.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { partialNodeService } from "../helpers/node-service-mock.js";

afterEach(() => cleanup());

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => partialNodeService({
    getExtAgentCommandCatalog: vi.fn().mockResolvedValue({ models: [] }),
  }),
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
      data-testid="coding-add-project-path"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  ),
}));

describe("CodingProjectPickerModal", () => {
  it("saves default agent with the new project", () => {
    const onConfirm = vi.fn();
    renderWithI18n(
      <CodingProjectPickerModal
        open
        title="Add project"
        description="desc"
        value="/projects/demo"
        onChange={() => {}}
        initialPrefill={{
          harness: "envoy-harness",
          model: "",
          providerKind: "",
          endpoint: "",
          apiKey: "",
        }}
        enabledHarnesses={["envoy-harness", "pi", "codex"]}
        confirmLabel="Add project"
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByTestId("coding-add-project-modal")).toBeTruthy();
    expect(
      screen.getByText(/Only agents that are ready/i),
    ).toBeTruthy();
    fireEvent.change(screen.getByTestId("coding-project-settings-harness"), {
      target: { value: "codex" },
    });
    fireEvent.click(screen.getByTestId("coding-add-project-confirm"));

    expect(onConfirm).toHaveBeenCalledWith({
      path: "/projects/demo",
      harness: "codex",
      model: "",
      providerKind: "",
      endpoint: "",
      apiKey: "",
    });
  });

  it("lists only ready agents (install others in Settings)", () => {
    renderWithI18n(
      <CodingProjectPickerModal
        open
        title="Add project"
        description="desc"
        value="/projects/demo"
        onChange={() => {}}
        enabledHarnesses={["envoy-harness", "opencode"]}
        harnessProbe={{
          codex: "install",
          opencode: "ready",
        }}
        confirmLabel="Add project"
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );

    const select = screen.getByTestId(
      "coding-project-settings-harness",
    ) as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    expect(values).toContain("opencode");
    expect(values).toContain("envoy-harness");
    expect(values).not.toContain("codex");
  });
});
