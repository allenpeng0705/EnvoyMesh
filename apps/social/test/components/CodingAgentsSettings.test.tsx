/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import { CodingAgentsSettings } from "../../src/components/views/settings/CodingAgentsSettings.js";

const probeCodingHarness = vi.fn();

vi.mock("../../src/lib/coding-harness-probe.js", () => ({
  probeCodingHarness: (...args: unknown[]) => probeCodingHarness(...args),
}));

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    isConnected: true,
    getEnvoyHarnessStatus: vi.fn(),
    getPiStatus: vi.fn(),
    probeExtAgent: vi.fn(),
  }),
}));

vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));

describe("CodingAgentsSettings", () => {
  beforeEach(() => {
    cleanup();
    probeCodingHarness.mockReset();
    probeCodingHarness.mockImplementation(async (_c: unknown, id: string) => {
      if (id === "pi" || id === "envoy-harness") {
        return { badge: "ready", line: "Ready on this home computer." };
      }
      return {
        badge: "not-ready",
        line: "npm i -g example",
        installCommand: "npm i -g example",
        hint: "Install on the home computer.",
      };
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("lists agents with Ready / Not ready and opens a guide", async () => {
    render(<CodingAgentsSettings />);

    await waitFor(() => {
      expect(screen.getByTestId("coding-agents-verdict-pi").textContent).toMatch(
        /Ready/i,
      );
    });

    const notReady = await screen.findAllByText("Not ready");
    expect(notReady.length).toBeGreaterThan(0);
    fireEvent.click(notReady[0]!);

    await waitFor(() => {
      expect(screen.getByText(/Install on the home computer/i)).toBeTruthy();
      expect(screen.getByText("Copy command")).toBeTruthy();
    });
  });

  it("labels first-run recipes in the Not-ready guide", async () => {
    probeCodingHarness.mockImplementation(async (_c: unknown, id: string) => {
      if (id === "pi" || id === "envoy-harness") {
        return { badge: "ready", line: "Ready on this home computer." };
      }
      return {
        badge: "not-ready",
        line: "npx -y @compass-ai/nova acp",
        installCommand: "npx -y @compass-ai/nova acp",
        hint: "Nova is fetched from npm on the first run (@compass-ai/nova).",
        installLink: "https://example.com",
      };
    });
    render(<CodingAgentsSettings />);
    const notReady = await screen.findAllByText("Not ready");
    fireEvent.click(notReady[0]!);
    await waitFor(() => {
      expect(
        screen.getByText(/First-run command \(run on this computer\)/i),
      ).toBeTruthy();
    });
  });
});
