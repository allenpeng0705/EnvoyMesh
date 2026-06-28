/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { ExtAgentSetupGuides } from "../../src/components/views/settings/ExtAgentSetupGuides.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

describe("ExtAgentSetupGuides", () => {
  it("shows install & run section for registry agents (English)", () => {
    renderWithI18n(
      <ExtAgentSetupGuides registryAgentIds={["homeclaw", "hermes"]} profileDir="/data/myprofile" />,
    );
    expect(screen.getByText(/How to install & run external agents/i)).toBeDefined();
    expect(screen.getAllByText("HomeClaw").length).toBeGreaterThan(0);
    expect(screen.getByText(/\/data\/myprofile\/bridge-config\.json/)).toBeDefined();
  });

  it("shows Chinese guide content when locale is zh", () => {
    renderWithI18n(
      <ExtAgentSetupGuides registryAgentIds={["homeclaw"]} profileDir="/data/myprofile" />,
      { locale: "zh" },
    );
    expect(screen.getByText(/如何安装并运行外部智能体/)).toBeDefined();
    expect(screen.getByText(/快速步骤/)).toBeDefined();
    expect(screen.getByText(/在本机安装 HomeClaw/)).toBeDefined();
  });

  it("shows operator guides only when registry is empty", () => {
    renderWithI18n(<ExtAgentSetupGuides registryAgentIds={[]} />);
    expect(screen.getByText("OpenHuman")).toBeDefined();
    expect(screen.queryByText(/Pi \(coding\)/)).toBeNull();
  });

  it("shows Pi guide when pi is registered", () => {
    renderWithI18n(<ExtAgentSetupGuides registryAgentIds={["pi"]} />);
    expect(screen.getAllByText(/Pi \(coding\)/).length).toBeGreaterThan(0);
  });
});
