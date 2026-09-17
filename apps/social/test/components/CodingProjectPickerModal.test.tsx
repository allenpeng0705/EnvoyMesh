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
    // The probe's raw `install` badge is deliberately collapsed to `not-ready`
    // for display (`harnessProbeLabelKey`, pinned by
    // test/lib/coding-harness-probe.test.ts), so the option speaks the picker's
    // Ready / Not ready vocabulary rather than the probe's internal badge.
    // Anchored on `· ` so `/Ready/` cannot also match "Not ready".
    expect(codex?.textContent).toMatch(/· Not ready$/);
    expect(opencode?.textContent).toMatch(/· Ready$/);
  });
});
