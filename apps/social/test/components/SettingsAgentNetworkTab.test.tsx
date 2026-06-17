/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { SettingsAgentNetworkTab } from "../../src/components/views/SettingsAgentNetworkTab.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import type { CompanyInviteRecord, FleetManifest, FleetManifestRecord } from "@envoymesh/api";

const createCompanyInvite = vi.fn();
const listCompanyInvites = vi.fn();
const revokeCompanyInvite = vi.fn();
const createFleetManifest = vi.fn();
const importFleetManifest = vi.fn();
const listFleetManifests = vi.fn();
const revokeFleetManifest = vi.fn();
const getPairingKioskStatus = vi.fn();
const syncPairingKioskFromConfig = vi.fn();
const updateNodeConfig = vi.fn();
const listAuthorizedDevices = vi.fn();

let nodeStatus: "offline" | "starting" | "running" | "stopping" = "running";
let nodeConfig: Record<string, unknown> = { modelProviders: { mode: "mock", modelName: "test-model" } };

const mockNodeService = {
  createCompanyInvite,
  listCompanyInvites,
  revokeCompanyInvite,
  createFleetManifest,
  importFleetManifest,
  listFleetManifests,
  revokeFleetManifest,
  getPairingKioskStatus,
  syncPairingKioskFromConfig,
  updateNodeConfig,
  listAuthorizedDevices,
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
  useIsInProcessMobileNode: () => false,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    nodeConfig,
    nodeStatus,
    humanProfile: { ownerId: "envoy:owner:test" },
    bridgeStatus: null,
    refreshNodeConfig: vi.fn(),
  }),
}));

const sampleInvite: CompanyInviteRecord = {
  inviteId: "inv-1",
  token: "tok-active",
  ownerId: "envoy:owner:self",
  wsUrl: "ws://localhost:3030/ws",
  createdAt: "2024-01-01T00:00:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z",
  note: "Marketing laptop",
};

beforeEach(() => {
  vi.clearAllMocks();
  nodeConfig = { modelProviders: { mode: "mock", modelName: "test-model" } };
  listCompanyInvites.mockResolvedValue({ invites: [] });
  listAuthorizedDevices.mockResolvedValue({ devices: [] });
  createCompanyInvite.mockResolvedValue({
    invite: sampleInvite,
    uri: "envoy://invite?token=tok-active&wsUrl=ws%3A%2F%2Flocalhost",
  });
  revokeCompanyInvite.mockResolvedValue({
    ok: true,
    invite: { ...sampleInvite, revokedAt: "2024-01-02T00:00:00.000Z" },
  });
  listFleetManifests.mockResolvedValue({ manifests: [] });
  createFleetManifest.mockImplementation(
    async (input: { members: FleetManifest["members"]; label?: string }) => ({
      manifest: {
        version: "0.1",
        manifestId: "m-1",
        issuerOwnerId: "envoy:owner:self",
        issuerOwnerPublicKeyPem: "PEM",
        label: input.label,
        issuedAt: "2024-01-01T00:00:00.000Z",
        expiresAt: null,
        members: input.members,
        signature: "SIG",
      } satisfies FleetManifest,
    }),
  );
  importFleetManifest.mockImplementation(async () => ({
    ok: true,
    manifestId: "m-1",
    added: 1,
    updated: 0,
    skipped: [],
    record: {
      manifestId: "m-1",
      issuerOwnerId: "envoy:owner:self",
      issuerOwnerFingerprint: "abc",
      signatureFingerprint: "def",
      issuedAt: "2024-01-01T00:00:00.000Z",
      importedAt: "2024-01-01T00:00:00.000Z",
      memberCount: 1,
      preStagedOwnerIds: ["envoy:owner:1"],
    } satisfies FleetManifestRecord,
  }));
  revokeFleetManifest.mockResolvedValue({ ok: true, manifestId: "m-1", cleared: 1 });
  getPairingKioskStatus.mockResolvedValue({
    enabled: false,
    running: false,
    address: undefined,
    port: undefined,
  });
  syncPairingKioskFromConfig.mockResolvedValue(undefined);
  updateNodeConfig.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  window.confirm = vi.fn(() => true);
});

describe("SettingsAgentNetworkTab — landing", () => {
  it("renders the Agent Network title and quick-reference intro", async () => {
    renderWithI18n(<SettingsAgentNetworkTab />);
    await waitFor(() => {
      expect(screen.getByText("Agent Network")).toBeDefined();
    });
    expect(screen.getByText("Which path should I use?")).toBeDefined();
  });

  it("renders all four section headings", async () => {
    renderWithI18n(<SettingsAgentNetworkTab />);
    await waitFor(() => {
      expect(screen.getAllByText("LAN Auto-Bond").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Company Invites").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pairing Kiosk").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fleet Manifest").length).toBeGreaterThan(0);
  });
});

describe("SettingsAgentNetworkTab — LAN auto-bond (Phase 35C)", () => {
  it("calls updateNodeConfig when Save is clicked", async () => {
    nodeConfig = {
      ...nodeConfig,
      lanAutoBondEnabled: false,
      lanAutoBondFleetToken: "",
    };
    renderWithI18n(<SettingsAgentNetworkTab />);
    // Generate a token (in the LAN Auto-Bond section — first Generate button).
    const generates = await waitFor(() => screen.getAllByText("Generate"));
    fireEvent.click(generates[0] as HTMLElement);
    const saves = await waitFor(() => screen.getAllByText("Save"));
    fireEvent.click(saves[0] as HTMLElement);
    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalled();
    });
    const call = updateNodeConfig.mock.calls[0]?.[0] as
      | { lanAutoBondEnabled: boolean; lanAutoBondFleetToken: string }
      | undefined;
    expect(call?.lanAutoBondFleetToken).toMatch(/^[A-Za-z0-9]{32}$/);
  });

  it("rejects a too-short fleet token without persisting", async () => {
    renderWithI18n(<SettingsAgentNetworkTab />);
    const tokenInput = (await waitFor(
      () => screen.getAllByPlaceholderText(/paste a long random string/)[0] as HTMLInputElement,
    ));
    fireEvent.change(tokenInput, { target: { value: "abc" } });
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0] as HTMLElement); // enable toggle
    const saves = await waitFor(() => screen.getAllByText("Save"));
    fireEvent.click(saves[0] as HTMLElement);
    expect(updateNodeConfig).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/)).toBeDefined();
    });
  });
});

describe("SettingsAgentNetworkTab — Company invites (Phase 35A)", () => {
  it("renders the empty state when there are no invites", async () => {
    renderWithI18n(<SettingsAgentNetworkTab />);
    await waitFor(() => {
      expect(screen.getByText("No company invites yet.")).toBeDefined();
    });
  });

  it("invokes createCompanyInvite on click", async () => {
    renderWithI18n(<SettingsAgentNetworkTab />);
    const button = await waitFor(() => screen.getByText("New company invite"));
    fireEvent.click(button);
    await waitFor(() => {
      expect(createCompanyInvite).toHaveBeenCalledTimes(1);
    });
  });

  it("invokes revokeCompanyInvite when revoke is clicked", async () => {
    listCompanyInvites.mockResolvedValueOnce({ invites: [sampleInvite] });
    renderWithI18n(<SettingsAgentNetworkTab />);
    const revoke = await waitFor(() => screen.getByText("Revoke"));
    fireEvent.click(revoke);
    await waitFor(() => {
      expect(revokeCompanyInvite).toHaveBeenCalledWith("inv-1");
    });
  });
});

describe("SettingsAgentNetworkTab — Fleet manifest (Phase 35B)", () => {
  it("renders the empty state when there are no manifests", async () => {
    renderWithI18n(<SettingsAgentNetworkTab />);
    await waitFor(() => {
      expect(screen.getByText("No fleet manifests imported yet.")).toBeDefined();
    });
  });

  it("rejects malformed member JSON before signing", async () => {
    renderWithI18n(<SettingsAgentNetworkTab />);
    const textarea = (await waitFor(
      () => screen.getByPlaceholderText(/Members as JSON/) as HTMLTextAreaElement,
    ));
    fireEvent.change(textarea, {
      target: { value: JSON.stringify([{ foo: "bar" }]) },
    });
    const signButtons = screen.getAllByText("Sign manifest with this node's owner key");
    fireEvent.click(signButtons[0] as HTMLElement);
    expect(createFleetManifest).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/Invalid members:/)).toBeDefined();
    });
  });

  it("signs a valid manifest", async () => {
    renderWithI18n(<SettingsAgentNetworkTab />);
    const textarea = (await waitFor(
      () => screen.getByPlaceholderText(/Members as JSON/) as HTMLTextAreaElement,
    ));
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify([
          {
            ownerId: "envoy:owner:1",
            deviceId: "dev-1",
            devicePublicKeyPem: "PEM",
            role: "agent",
            trustLevel: "direct",
          },
        ]),
      },
    });
    const signButtons = screen.getAllByText("Sign manifest with this node's owner key");
    fireEvent.click(signButtons[0] as HTMLElement);
    await waitFor(() => {
      expect(createFleetManifest).toHaveBeenCalledTimes(1);
    });
  });

  it("imports a signed manifest when the user clicks Import", async () => {
    renderWithI18n(<SettingsAgentNetworkTab />);
    const textarea = (await waitFor(
      () => screen.getByPlaceholderText(/Members as JSON/) as HTMLTextAreaElement,
    ));
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify([
          {
            ownerId: "envoy:owner:1",
            deviceId: "dev-1",
            devicePublicKeyPem: "PEM",
            role: "agent",
            trustLevel: "direct",
          },
        ]),
      },
    });
    const signButtons = screen.getAllByText("Sign manifest with this node's owner key");
    fireEvent.click(signButtons[0] as HTMLElement);
    const importButton = await waitFor(() => screen.getByText("Import on this node"));
    fireEvent.click(importButton);
    await waitFor(() => {
      expect(importFleetManifest).toHaveBeenCalledTimes(1);
    });
  });

  it("invokes revokeFleetManifest when revoke is clicked", async () => {
    listFleetManifests.mockResolvedValueOnce({
      manifests: [
        {
          manifestId: "m-2",
          issuerOwnerId: "envoy:owner:self",
          issuerOwnerFingerprint: "abc",
          signatureFingerprint: "def",
          issuedAt: "2024-01-01T00:00:00.000Z",
          importedAt: "2024-01-01T00:00:00.000Z",
          memberCount: 2,
          preStagedOwnerIds: ["envoy:owner:1"],
        },
      ],
    });
    renderWithI18n(<SettingsAgentNetworkTab />);
    await waitFor(() => {
      expect(screen.getByText(/2 member\(s\)/)).toBeDefined();
    });
    const revokeButtons = screen.getAllByText("Revoke");
    fireEvent.click(revokeButtons[0] as HTMLElement);
    await waitFor(() => {
      expect(revokeFleetManifest).toHaveBeenCalledWith("m-2");
    });
  });
});