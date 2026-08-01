/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsAppTab } from "../../src/components/views/SettingsAppTab.js";
import { ThemeProvider } from "../../src/context/ThemeContext.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";
import { ToastProvider } from "../../src/hooks/useToast.js";

// SettingsAppTab calls useTheme() and useI18n(), so we wrap it in
// the providers those hooks expect.
function renderAppTab() {
  return render(
    <I18nTestProvider locale="en">
      <ThemeProvider>
        <ToastProvider>
          <SettingsAppTab />
        </ToastProvider>
      </ThemeProvider>
    </I18nTestProvider>,
  );
}

// ActivityView (embedded in the App tab) reads these from the node service.
const listAgentActivity = vi.fn();
const listAuditEvents = vi.fn();
const listTaskJournalEntries = vi.fn();
const getTaskResult = vi.fn();
const getBonds = vi.fn();
const on = vi.fn();

// AuthorizedDevicesSection (also embedded in the App tab) reads these.
const listAuthorizedDevices = vi.fn();
const revokeAuthorizedDevice = vi.fn();
const mergeAuthorizedDevices = vi.fn();
const pruneRevokedDevices = vi.fn();
const refreshNodeConfig = vi.fn();

let isMobileNode = false;

const mockNodeService = {
  listAgentActivity,
  listAuditEvents,
  listTaskJournalEntries,
  getTaskResult,
  getBonds,
  on,
  listAuthorizedDevices,
  revokeAuthorizedDevice,
  mergeAuthorizedDevices,
  pruneRevokedDevices,
  refreshNodeConfig,
};

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(async () => null),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(async () => undefined),
}));

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
  useIsInProcessMobileNode: () => isMobileNode,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    refreshNodeConfig,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom does not implement window.matchMedia; the ThemeProvider
  // calls it to resolve the initial "system" theme.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  isMobileNode = false;
  listAgentActivity.mockResolvedValue([]);
  listAuditEvents.mockResolvedValue([]);
  listTaskJournalEntries.mockResolvedValue([]);
  getTaskResult.mockResolvedValue(undefined);
  getBonds.mockResolvedValue([]);
  on.mockReturnValue(() => {});
  listAuthorizedDevices.mockResolvedValue({ devices: [] });
  revokeAuthorizedDevice.mockResolvedValue({
    deviceId: "d-1",
    certificateId: "cert-1",
    revokedAt: new Date().toISOString(),
  });
  mergeAuthorizedDevices.mockResolvedValue({ revocations: [] });
  pruneRevokedDevices.mockResolvedValue({ prunedDeviceIds: [] });
  refreshNodeConfig.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("SettingsAppTab (Language / Appearance / Authorized Devices / Activity)", () => {
  it("renders all four sections", async () => {
    renderAppTab();
    await waitFor(() => {
      expect(screen.getByText("Language")).toBeDefined();
    });
    expect(screen.getByText("Appearance")).toBeDefined();
    expect(screen.getByText("Authorized Devices")).toBeDefined();
    expect(screen.getByText("Activity")).toBeDefined();
  });

  it("shows the empty state for devices when the list is empty", async () => {
    renderAppTab();
    await waitFor(() => {
      expect(screen.getByText("No authorized devices yet.")).toBeDefined();
    });
  });

  it("renders a Revoke button for each non-revoked device", async () => {
    listAuthorizedDevices.mockResolvedValue({
      devices: [
        {
          deviceId: "d-1",
          certificateId: "cert-1",
          deviceProfile: "satellite",
          displayName: "Phone",
          pairedAt: "2024-01-01T00:00:00.000Z",
          revoked: false,
        },
      ],
    });
    renderAppTab();
    await waitFor(() => {
      expect(screen.getByText("Phone")).toBeDefined();
    });
    const revokeBtn = screen.getByRole("button", { name: "Revoke" });
    fireEvent.click(revokeBtn);
    // ConfirmDialog appears — click the confirm button
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(revokeAuthorizedDevice).toHaveBeenCalledWith({
        deviceId: "d-1",
        reason: "retired",
      });
    });
  });

  it("hides the devices list and shows the mobile message on mobile nodes", async () => {
    isMobileNode = true;
    renderAppTab();
    await waitFor(() => {
      expect(
        screen.getByText("Device management is not available on mobile devices."),
      ).toBeDefined();
    });
  });

  it("disables the Clean up button when there is nothing to clean up", async () => {
    listAuthorizedDevices.mockResolvedValue({
      devices: [
        {
          deviceId: "d-1",
          certificateId: "cert-1",
          deviceProfile: "satellite",
          displayName: "Phone",
          pairedAt: "2024-01-01T00:00:00.000Z",
          revoked: false,
        },
      ],
    });
    renderAppTab();
    await waitFor(() => {
      expect(screen.getByText("Phone")).toBeDefined();
    });
    const cleanupBtn = screen.getByRole("button", { name: "Clean up" });
    expect(cleanupBtn).toBeDefined();
    expect((cleanupBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("merges older duplicates into the most-recently-paired record on confirm", async () => {
    listAuthorizedDevices.mockResolvedValue({
      devices: [
        // Same displayName "Phone" ×3. The middle entry has the latest
        // pairedAt — it is the canonical "keep" target. The other two
        // are merged into it.
        {
          deviceId: "d-old",
          certificateId: "cert-old",
          deviceProfile: "satellite",
          displayName: "Phone",
          pairedAt: "2024-01-01T00:00:00.000Z",
          revoked: false,
        },
        {
          deviceId: "d-new",
          certificateId: "cert-new",
          deviceProfile: "satellite",
          displayName: "Phone",
          pairedAt: "2024-06-01T00:00:00.000Z",
          revoked: false,
        },
        {
          deviceId: "d-mid",
          certificateId: "cert-mid",
          deviceProfile: "satellite",
          displayName: "Phone",
          pairedAt: "2024-03-01T00:00:00.000Z",
          revoked: false,
        },
      ],
    });
    renderAppTab();
    await waitFor(() => {
      expect(screen.getAllByText("Phone").length).toBeGreaterThan(0);
    });

    // The cleanup button should be enabled because there are duplicates.
    const cleanupBtn = screen.getByRole("button", { name: "Clean up" });
    expect((cleanupBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(cleanupBtn);
    // ConfirmDialog appears — click the confirm button
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(mergeAuthorizedDevices).toHaveBeenCalledTimes(1);
    });
    expect(mergeAuthorizedDevices).toHaveBeenCalledWith({
      keepDeviceId: "d-new", // latest pairedAt
      mergeDeviceIds: ["d-old", "d-mid"].sort((a, b) => a.localeCompare(b)),
      reason: "deduplicated",
    });
    // (the above isn't strictly equal because array order — use deep check)
    const call = mergeAuthorizedDevices.mock.calls[0]?.[0];
    expect(call.keepDeviceId).toBe("d-new");
    expect(call.reason).toBe("deduplicated");
    expect(new Set(call.mergeDeviceIds)).toEqual(new Set(["d-old", "d-mid"]));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Cleaned up 2 duplicate record(s) and removed 0 revoked record(s).",
        ),
      ).toBeDefined();
    });
  });

  it("also prunes already-revoked entries from the list", async () => {
    listAuthorizedDevices.mockResolvedValue({
      devices: [
        {
          deviceId: "d-1",
          certificateId: "c-1",
          deviceProfile: "satellite",
          displayName: "Phone-A",
          pairedAt: "2024-01-01T00:00:00.000Z",
          revoked: false,
        },
        {
          deviceId: "d-2",
          certificateId: "c-2",
          deviceProfile: "satellite",
          displayName: "Phone-B",
          pairedAt: "2024-02-01T00:00:00.000Z",
          revoked: true, // already revoked — should be pruned
        },
      ],
    });
    pruneRevokedDevices.mockResolvedValue({ prunedDeviceIds: ["d-2"] });
    renderAppTab();
    await waitFor(() => {
      expect(screen.getByText("Phone-A")).toBeDefined();
    });

    // The cleanup button is enabled because there's a revoked record to prune.
    const cleanupBtn = screen.getByRole("button", { name: "Clean up" });
    expect((cleanupBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(cleanupBtn);
    // ConfirmDialog appears — click the confirm button
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(pruneRevokedDevices).toHaveBeenCalledTimes(1);
    });
    // No duplicates, so mergeAuthorizedDevices is not called.
    expect(mergeAuthorizedDevices).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(
        screen.getByText(
          "Cleaned up 0 duplicate record(s) and removed 1 revoked record(s).",
        ),
      ).toBeDefined();
    });
  });

  it("does not call the RPC when the user cancels the confirm dialog", async () => {
    listAuthorizedDevices.mockResolvedValue({
      devices: [
        {
          deviceId: "d-1",
          certificateId: "c-1",
          deviceProfile: "satellite",
          displayName: "Phone",
          pairedAt: "2024-01-01T00:00:00.000Z",
          revoked: false,
        },
        {
          deviceId: "d-2",
          certificateId: "c-2",
          deviceProfile: "satellite",
          displayName: "Phone",
          pairedAt: "2024-02-01T00:00:00.000Z",
          revoked: false,
        },
      ],
    });
    renderAppTab();
    await waitFor(() => {
      expect(screen.getAllByText("Phone").length).toBeGreaterThan(0);
    });
    const cleanupBtn = screen.getByRole("button", { name: "Clean up" });
    fireEvent.click(cleanupBtn);
    // ConfirmDialog appears — click the cancel button
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);
    // give the click handler a chance to run
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mergeAuthorizedDevices).not.toHaveBeenCalled();
    expect(pruneRevokedDevices).not.toHaveBeenCalled();
  });

  it("shows an error message if the merge RPC fails", async () => {
    listAuthorizedDevices.mockResolvedValue({
      devices: [
        {
          deviceId: "d-1",
          certificateId: "c-1",
          deviceProfile: "satellite",
          displayName: "Phone",
          pairedAt: "2024-01-01T00:00:00.000Z",
          revoked: false,
        },
        {
          deviceId: "d-2",
          certificateId: "c-2",
          deviceProfile: "satellite",
          displayName: "Phone",
          pairedAt: "2024-02-01T00:00:00.000Z",
          revoked: false,
        },
      ],
    });
    mergeAuthorizedDevices.mockRejectedValue(new Error("disk is on fire"));
    renderAppTab();
    await waitFor(() => {
      expect(screen.getAllByText("Phone").length).toBeGreaterThan(0);
    });
    const cleanupBtn = screen.getByRole("button", { name: "Clean up" });
    fireEvent.click(cleanupBtn);
    // ConfirmDialog appears — click the confirm button
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(screen.getByText("Cleanup failed: disk is on fire")).toBeDefined();
    });
  });
});
