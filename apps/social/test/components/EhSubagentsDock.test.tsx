/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EhSubagentsDock } from "../../src/components/ehui/EhSubagentsDock.js";

vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));

describe("EhSubagentsDock (FH-P2-B)", () => {
  it("renders running and done rows", () => {
    render(
      <EhSubagentsDock
        rows={[
          { id: "a", summary: "scan src", status: "running" },
          { id: "b", summary: "lint", status: "succeeded" },
        ]}
      />,
    );
    expect(screen.getByTestId("eh-subagents-dock")).toBeTruthy();
    expect(screen.getAllByTestId("eh-subagent-row")).toHaveLength(2);
    expect(screen.getByText("scan src")).toBeTruthy();
  });

  it("renders nothing when empty", () => {
    const { container } = render(<EhSubagentsDock rows={[]} />);
    expect(container.firstChild).toBeNull();
  });
});