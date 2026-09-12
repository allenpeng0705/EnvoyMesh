/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { CodingDefaultsModal } from "../../src/components/CodingDefaultsModal.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

afterEach(() => cleanup());

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    getExtAgentCommandCatalog: vi.fn().mockResolvedValue({ models: [] }),
  }),
}));

describe("CodingDefaultsModal", () => {
  it("saves harness and model overrides", () => {
    const onSave = vi.fn();
    renderWithI18n(
      <CodingDefaultsModal
        defaults={{
          harness: "envoy-harness",
          model: "",
          providerKind: "",
          endpoint: "",
          apiKey: "",
        }}
        envoymeshAiModelHint="openai:gpt-4o"
        onCancel={() => {}}
        onSave={onSave}
      />,
    );

    expect(
      screen.getByPlaceholderText(/Empty = EnvoyMesh AI \(openai:gpt-4o\)/i),
    ).toBeTruthy();
    expect(
      (screen.getByTestId("coding-defaults-settings-provider") as HTMLSelectElement)
        .options[0]?.textContent,
    ).toMatch(/EnvoyMesh AI/i);

    fireEvent.change(screen.getByTestId("coding-defaults-settings-harness"), {
      target: { value: "pi" },
    });
    fireEvent.change(screen.getByTestId("coding-defaults-settings-model"), {
      target: { value: "gpt-4o" },
    });
    fireEvent.click(screen.getByTestId("coding-defaults-settings-save"));

    expect(onSave).toHaveBeenCalledWith({
      harness: "pi",
      model: "gpt-4o",
      providerKind: "",
      endpoint: "",
      apiKey: "",
    });
  });
});
