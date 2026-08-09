/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { hasUsableModelProvider } from "@envoymesh/api";
import { ConfigureAiBanner } from "../../src/components/views/ConfigureAiBanner.js";

vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string) => key,
}));

let nodeConfig: unknown = { modelProviders: { mode: "disabled" } };
vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({ nodeConfig }),
}));

describe("ConfigureAiBanner", () => {
  afterEach(() => {
    cleanup();
  });

  it("hasUsableModelProvider matches banner visibility rules", () => {
    expect(hasUsableModelProvider({ mode: "disabled" })).toBe(false);
    expect(hasUsableModelProvider({ mode: "mock" })).toBe(false);
    expect(
      hasUsableModelProvider({
        mode: "openai-compatible",
        presetId: "openai",
        modelName: "gpt-4o-mini",
        apiKey: "k",
      }),
    ).toBe(true);
  });

  it("shows when modelProviders are disabled", () => {
    nodeConfig = { modelProviders: { mode: "disabled" } };
    render(<ConfigureAiBanner onOpenSettingsAi={() => {}} />);
    expect(screen.getByTestId("configure-ai-banner")).toBeTruthy();
  });

  it("hides when a cloud model is configured", () => {
    nodeConfig = {
      modelProviders: {
        mode: "openai-compatible",
        presetId: "openai",
        modelName: "gpt-4o-mini",
        apiKey: "k",
      },
    };
    render(<ConfigureAiBanner onOpenSettingsAi={() => {}} />);
    expect(screen.queryByTestId("configure-ai-banner")).toBeNull();
  });

  it("shows for mock mode", () => {
    nodeConfig = { modelProviders: { mode: "mock" } };
    render(<ConfigureAiBanner onOpenSettingsAi={() => {}} />);
    expect(screen.getByTestId("configure-ai-banner")).toBeTruthy();
  });
});
