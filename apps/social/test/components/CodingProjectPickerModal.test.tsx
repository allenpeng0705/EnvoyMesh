/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { CodingProjectPickerModal } from "../../src/components/CodingProjectPickerModal.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

afterEach(() => cleanup());

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
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
        confirmLabel="Add project"
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByTestId("coding-add-project-modal")).toBeTruthy();
    expect(
      screen.getByText(/Envoy and Pi are built in/i),
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

  it("shows install status on CLI options when probed", () => {
    renderWithI18n(
      <CodingProjectPickerModal
        open
        title="Add project"
        description="desc"
        value="/projects/demo"
        onChange={() => {}}
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
    const codex = [...select.options].find((o) => o.value === "codex");
    const opencode = [...select.options].find((o) => o.value === "opencode");
    expect(codex?.textContent).toMatch(/Install/i);
    expect(opencode?.textContent).toMatch(/Ready/i);
  });
});
