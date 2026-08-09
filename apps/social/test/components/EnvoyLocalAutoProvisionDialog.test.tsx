/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EnvoyLocalAutoProvisionDialog } from "../../src/components/EnvoyLocalAutoProvisionDialog.js";

vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string, vars?: Record<string, string>) => {
    if (!vars) return key;
    return Object.entries(vars).reduce(
      (s, [k, v]) => s.replace(`{${k}}`, v),
      key,
    );
  },
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToastOptional: () => ({ showToast: vi.fn() }),
}));

const getEnvoyLocalStatus = vi.fn();
const enableEnvoyLocal = vi.fn();
const declineEnvoyLocalAutoProvision = vi.fn();

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    getEnvoyLocalStatus,
    enableEnvoyLocal,
    declineEnvoyLocalAutoProvision,
  }),
}));

describe("EnvoyLocalAutoProvisionDialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows consent when suggestAutoProvision is true", async () => {
    getEnvoyLocalStatus.mockResolvedValue({
      suggestAutoProvision: true,
      recommendedModelLabel: "Qwen3.5 4B (Q4_K_M)",
      recommendedModelApproxBytes: 2_740_000_000,
      hardwareSummary: "CPU · 16 GB RAM",
    });
    render(<EnvoyLocalAutoProvisionDialog />);
    await waitFor(() => {
      expect(
        screen.getByText("settings.ai.envoyLocal.autoProvisionTitle"),
      ).toBeTruthy();
    });
    expect(
      screen.getByText("settings.ai.envoyLocal.autoProvisionConfirm"),
    ).toBeTruthy();
  });

  it("stays hidden when suggestAutoProvision is false", async () => {
    getEnvoyLocalStatus.mockResolvedValue({ suggestAutoProvision: false });
    render(<EnvoyLocalAutoProvisionDialog />);
    await waitFor(() => expect(getEnvoyLocalStatus).toHaveBeenCalled());
    expect(
      screen.queryByText("settings.ai.envoyLocal.autoProvisionTitle"),
    ).toBeNull();
  });

  it("retries probe after transient RPC failure", async () => {
    getEnvoyLocalStatus
      .mockRejectedValueOnce(new Error("not ready"))
      .mockResolvedValueOnce({
        suggestAutoProvision: true,
        recommendedModelLabel: "Qwen3.5 4B (Q4_K_M)",
        hardwareSummary: "CPU",
      });
    render(<EnvoyLocalAutoProvisionDialog />);
    await waitFor(
      () => {
        expect(
          screen.getByText("settings.ai.envoyLocal.autoProvisionTitle"),
        ).toBeTruthy();
      },
      { timeout: 5_000 },
    );
    expect(getEnvoyLocalStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("declines on Not now", async () => {
    getEnvoyLocalStatus.mockResolvedValue({
      suggestAutoProvision: true,
      recommendedModelLabel: "Qwen3.5 0.8B (Q4_K_M)",
      hardwareSummary: "CPU",
    });
    declineEnvoyLocalAutoProvision.mockResolvedValue({
      suggestAutoProvision: false,
    });
    render(<EnvoyLocalAutoProvisionDialog />);
    await waitFor(() => {
      expect(
        screen.getByText("settings.ai.envoyLocal.autoProvisionCancel"),
      ).toBeTruthy();
    });
    fireEvent.click(
      screen.getByText("settings.ai.envoyLocal.autoProvisionCancel"),
    );
    expect(declineEnvoyLocalAutoProvision).toHaveBeenCalled();
  });
});
