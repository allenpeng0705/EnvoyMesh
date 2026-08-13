/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { SettingsFamilyTab } from "../../src/components/views/SettingsFamilyTab.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const listFamilyProfiles = vi.fn();
const createFamilyProfile = vi.fn();
const updateFamilyProfile = vi.fn();
const deleteFamilyProfile = vi.fn();
const wipeFamilyProfile = vi.fn();
const generateFamilyInviteToken = vi.fn();
const refreshNodeConfig = vi.fn();

const mockNodeService = {
  listFamilyProfiles,
  createFamilyProfile,
  updateFamilyProfile,
  deleteFamilyProfile,
  wipeFamilyProfile,
  generateFamilyInviteToken,
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    refreshNodeConfig,
    nodeConfig: { callerIsOwnerProfile: true, familyProfiles: [] },
  }),
}));

describe("SettingsFamilyTab", () => {
  beforeEach(() => {
    listFamilyProfiles.mockResolvedValue({
      profiles: [
        {
          id: "owner",
          name: "Dad",
          isOwner: true,
          active: true,
          createdAt: "2026-07-30T00:00:00.000Z",
        },
        {
          id: "mom",
          name: "Mom",
          isOwner: false,
          active: true,
          avatarColor: "#ec4899",
          createdAt: "2026-07-30T00:00:00.000Z",
        },
      ],
    });
    createFamilyProfile.mockResolvedValue({
      profile: {
        id: "alex",
        name: "Alex",
        isOwner: false,
        active: true,
        createdAt: "2026-07-31T00:00:00.000Z",
      },
    });
    generateFamilyInviteToken.mockResolvedValue({
      token: "tok",
      uri: "envoy://pair?token=tok",
      expiresAt: "2026-08-03T00:00:00.000Z",
    });
    refreshNodeConfig.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists family profiles and creates a new one", async () => {
    renderWithI18n(<SettingsFamilyTab />);
    await waitFor(() => {
      expect(listFamilyProfiles).toHaveBeenCalled();
      expect(screen.getByText("Owner")).toBeTruthy();
      expect(screen.getByText("Mom")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText(/Name/i), {
      target: { value: "Alex" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Create$/i }));

    await waitFor(() => {
      expect(createFamilyProfile).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Alex" }),
      );
    });
  });

  it("opens invite QR action", async () => {
    renderWithI18n(<SettingsFamilyTab />);
    await waitFor(() => expect(screen.getByText("Mom")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Show invite QR/i }));
    await waitFor(() => {
      expect(generateFamilyInviteToken).toHaveBeenCalled();
    });
  });

  it("toggles Allow Ext Agent chat for a member (default off → on)", async () => {
    updateFamilyProfile.mockResolvedValue({
      profile: {
        id: "mom",
        name: "Mom",
        isOwner: false,
        active: true,
        extAgentEnabled: true,
        createdAt: "2026-07-30T00:00:00.000Z",
      },
    });
    renderWithI18n(<SettingsFamilyTab />);
    const toggle = await screen.findByRole("checkbox", {
      name: /Allow Ext Agent chat/i,
    });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(updateFamilyProfile).toHaveBeenCalledWith({
        id: "mom",
        extAgentEnabled: true,
      });
    });
  });

  it("Remove… offers Deactivate and Wipe; Wipe confirms then calls wipeFamilyProfile", async () => {
    wipeFamilyProfile.mockResolvedValue({
      ok: true,
      id: "mom",
      deletedMessages: 0,
      revokedSessions: 0,
    });
    renderWithI18n(<SettingsFamilyTab />);
    await waitFor(() => expect(screen.getByText("Mom")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Remove/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Deactivate$/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /^Wipe$/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Wipe$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Wipe everything/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Wipe everything/i }));

    await waitFor(() => {
      expect(wipeFamilyProfile).toHaveBeenCalledWith("mom");
    });
  });
});
