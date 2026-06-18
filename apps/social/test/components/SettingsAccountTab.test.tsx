/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { SettingsAccountTab } from "../../src/components/views/SettingsAccountTab.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const updateHumanProfile = vi.fn();
const advertiseTopic = vi.fn();
const getProfile = vi.fn();
const refreshNodeConfig = vi.fn();
const refreshHumanProfile = vi.fn();
const updateNodeConfig = vi.fn();
const clearAllUserData = vi.fn();

let humanProfile: Record<string, unknown> | null = {
  displayName: "Alice",
  username: "alice",
  profileVisibility: "private",
};
let nodeStatus: "running" | "starting" | "stopping" | "offline" = "running";
let nodeConfig: Record<string, unknown> = {
  autonomousKillSwitch: false,
  trustModeEnabled: false,
  knowledgeSyndicationMaxSensitivity: undefined,
};

const mockNodeService = {
  updateHumanProfile,
  advertiseTopic,
  getProfile,
  refreshNodeConfig,
  refreshHumanProfile,
  updateNodeConfig,
  clearAllUserData,
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    humanProfile,
    peerId: "envoy_test123",
    nodeStatus,
    nodeConfig,
    refreshNodeConfig,
    refreshHumanProfile,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  humanProfile = {
    displayName: "Alice",
    username: "alice",
    profileVisibility: "private",
  };
  nodeStatus = "running";
  nodeConfig = {
    autonomousKillSwitch: false,
    trustModeEnabled: false,
    knowledgeSyndicationMaxSensitivity: undefined,
  };
  updateHumanProfile.mockResolvedValue(undefined);
  advertiseTopic.mockResolvedValue(undefined);
  getProfile.mockResolvedValue({ owner: { ownerId: "envoy:owner:abc" } });
  updateNodeConfig.mockResolvedValue(undefined);
  clearAllUserData.mockResolvedValue(undefined);
  refreshNodeConfig.mockResolvedValue(undefined);
  refreshHumanProfile.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("SettingsAccountTab (Profile / Identity / Privacy)", () => {
  it("renders all sections: profile, identity, privacy", async () => {
    renderWithI18n(<SettingsAccountTab />);
    await waitFor(() => {
      expect(screen.getByText("Your profile")).toBeDefined();
    });
    expect(screen.getByText("Identity")).toBeDefined();
    // Privacy section headings (formerly the standalone Privacy tab)
    expect(screen.getByText("Autonomy Controls")).toBeDefined();
    expect(screen.getByText("Trust Mode")).toBeDefined();
    expect(screen.getByText("Data Management")).toBeDefined();
    expect(screen.getByText("Knowledge Sharing")).toBeDefined();
    // Authorized Devices is no longer rendered here — it now lives in
    // the App tab.
    expect(screen.queryByText("Authorized Devices")).toBeNull();
  });

  it("registers a DID name when the Register button is clicked", async () => {
    renderWithI18n(<SettingsAccountTab />);
    await waitFor(() => {
      expect(screen.getByText("Identity")).toBeDefined();
    });
    const input = screen.getByPlaceholderText("your-name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "alice" } });
    const registerBtn = screen.getByRole("button", { name: "Register" });
    fireEvent.click(registerBtn);
    await waitFor(() => {
      expect(advertiseTopic).toHaveBeenCalledWith("did:envoy:alice");
    });
  });

  it("rejects DID names that are too short", async () => {
    renderWithI18n(<SettingsAccountTab />);
    const input = screen.getByPlaceholderText("your-name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ab" } });
    // The Register button is disabled for < 3 chars, so we click and
    // verify the underlying advertiseTopic is never called.
    const registerBtn = screen.getByRole("button", { name: "Register" }) as HTMLButtonElement;
    expect(registerBtn.disabled).toBe(true);
    fireEvent.click(registerBtn);
    expect(advertiseTopic).not.toHaveBeenCalled();
  });

  it("renders the ownerId from getProfile", async () => {
    renderWithI18n(<SettingsAccountTab />);
    await waitFor(() => {
      expect(screen.getByText("envoy:owner:abc")).toBeDefined();
    });
  });

  it("toggles the autonomy kill switch and persists it", async () => {
    renderWithI18n(<SettingsAccountTab />);
    await waitFor(() => {
      expect(screen.getByText("Autonomy Controls")).toBeDefined();
    });
    const autonomySection = screen.getByText("Autonomy Controls").closest("section");
    expect(autonomySection).toBeDefined();
    const checkboxes = autonomySection!.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);
    fireEvent.click(checkboxes[0]!);
    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledWith({ autonomousKillSwitch: true });
    });
  });

  it("toggles trust mode and persists it", async () => {
    renderWithI18n(<SettingsAccountTab />);
    await waitFor(() => {
      expect(screen.getByText("Trust Mode")).toBeDefined();
    });
    const trustModeSection = screen.getByText("Trust Mode").closest("section");
    expect(trustModeSection).toBeDefined();
    const checkboxes = trustModeSection!.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);
    fireEvent.click(checkboxes[0]!);
    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledWith({ trustModeEnabled: true });
    });
  });

  it("calls clearAllUserData when the user confirms the Clear All Data dialog", async () => {
    renderWithI18n(<SettingsAccountTab />);
    await waitFor(() => {
      expect(screen.getByText("Data Management")).toBeDefined();
    });
    const clearBtn = screen.getByRole("button", { name: "Clear All Data" });
    fireEvent.click(clearBtn);
    // ConfirmDialog appears — click the confirm (danger) button
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(clearAllUserData).toHaveBeenCalled();
    });
  });

  it("does NOT call clearAllUserData when the user cancels the confirmation", async () => {
    renderWithI18n(<SettingsAccountTab />);
    await waitFor(() => {
      expect(screen.getByText("Data Management")).toBeDefined();
    });
    const clearBtn = screen.getByRole("button", { name: "Clear All Data" });
    fireEvent.click(clearBtn);
    // ConfirmDialog appears — click the cancel (secondary) button
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);
    await new Promise((r) => setTimeout(r, 10));
    expect(clearAllUserData).not.toHaveBeenCalled();
  });

  it("changes the knowledge syndication level and persists it", async () => {
    renderWithI18n(<SettingsAccountTab />);
    await waitFor(() => {
      expect(screen.getByText("Knowledge Sharing")).toBeDefined();
    });
    const sharingSection = screen.getByText("Knowledge Sharing").closest("section");
    expect(sharingSection).toBeDefined();
    const select = sharingSection!.querySelector("select") as HTMLSelectElement;
    expect(select).toBeDefined();
    fireEvent.change(select, { target: { value: "friends" } });
    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledWith({
        knowledgeSyndicationMaxSensitivity: "friends",
      });
    });
  });
});
