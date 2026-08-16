/**
 * @vitest-environment jsdom
 *
 * Covers Manage workers modal (AgentNetworkSettingsModal) — Office LAN
 * (combined Join + LAN auto-bond + fleet token) and Advanced fleet tools.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { AgentNetworkSettingsModal } from "../../src/components/AgentNetworkSettingsModal.js";
import {
  FleetManifestSection,
  WorkersStatusSection,
} from "../../src/components/views/settings/agent-network-sections.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import type { FleetManifest, FleetManifestRecord } from "@envoymesh/api";

const createFleetManifest = vi.fn();
const importFleetManifest = vi.fn();
const listFleetManifests = vi.fn();
const revokeFleetManifest = vi.fn();
const getPairingKioskStatus = vi.fn();
const syncPairingKioskFromConfig = vi.fn();
const updateNodeConfig = vi.fn();
const listAuthorizedDevices = vi.fn();
const getNodeConfig = vi.fn();
const getBonds = vi.fn();
const listAgentCards = vi.fn();
const refreshAgentNetworkWorkers = vi.fn();
const requestAgentCard = vi.fn();
const refreshNodeConfig = vi.fn();

let nodeConfig: Record<string, unknown> = { modelProviders: { mode: "mock", modelName: "test-model" } };

const mockNodeService = {
  createFleetManifest,
  importFleetManifest,
  listFleetManifests,
  revokeFleetManifest,
  getPairingKioskStatus,
  syncPairingKioskFromConfig,
  updateNodeConfig,
  listAuthorizedDevices,
  getNodeConfig,
  getBonds,
  listAgentCards,
  refreshAgentNetworkWorkers,
  requestAgentCard,
  on: vi.fn(() => () => {}),
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    nodeConfig,
    nodeStatus: "running" as const,
    humanProfile: { ownerId: "envoy:owner:test" },
    bridgeStatus: null,
    refreshNodeConfig,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  nodeConfig = { modelProviders: { mode: "mock", modelName: "test-model" } };
  listAuthorizedDevices.mockResolvedValue({ devices: [] });
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
  refreshNodeConfig.mockResolvedValue(undefined);
  getNodeConfig.mockResolvedValue({ ...nodeConfig });
  getBonds.mockResolvedValue([]);
  listAgentCards.mockResolvedValue([]);
  refreshAgentNetworkWorkers.mockResolvedValue({ requested: 0, failed: 0 });
  requestAgentCard.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  window.confirm = vi.fn(() => true);
});

describe("AgentNetworkSettingsModal — Office LAN", () => {
  it("shows Office LAN without a separate LAN Auto-Bond heading", async () => {
    renderWithI18n(<AgentNetworkSettingsModal onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("agent-network-office-lan-section")).toBeDefined();
    });
    expect(screen.getByText("Office LAN")).toBeDefined();
    expect(screen.queryByText("LAN Auto-Bond")).toBeNull();
  });

  it("enables Join + LAN auto-bond in open mode when token is empty (with confirm)", async () => {
    nodeConfig = {
      ...nodeConfig,
      capabilityProviderEnabled: false,
      lanAutoBondEnabled: false,
      lanAutoBondFleetToken: "",
    };
    renderWithI18n(<AgentNetworkSettingsModal onClose={() => {}} />);
    const enable = await waitFor(() => screen.getByTestId("office-lan-enable"));
    fireEvent.click(enable);
    // Open LAN is gated: an explicit confirmation must appear before enabling.
    const confirm = await waitFor(() => screen.getByTestId("office-lan-open-confirm"));
    expect(confirm).toBeDefined();
    expect(updateNodeConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("office-lan-open-confirm-ok"));
    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalled();
    });
    const call = updateNodeConfig.mock.calls[0]?.[0] as {
      capabilityProviderEnabled?: boolean;
      lanAutoBondEnabled?: boolean;
      lanAutoBondFleetToken?: string;
    };
    expect(call.capabilityProviderEnabled).toBe(true);
    expect(call.lanAutoBondEnabled).toBe(true);
    expect(call.lanAutoBondFleetToken).toBe("");
    await waitFor(() => {
      expect(refreshAgentNetworkWorkers).toHaveBeenCalled();
    });
  });

  it("cancels open-LAN confirmation and does not enable", async () => {
    nodeConfig = {
      ...nodeConfig,
      capabilityProviderEnabled: false,
      lanAutoBondEnabled: false,
      lanAutoBondFleetToken: "",
    };
    renderWithI18n(<AgentNetworkSettingsModal onClose={() => {}} />);
    const enable = await waitFor(() => screen.getByTestId("office-lan-enable"));
    fireEvent.click(enable);
    const cancel = await waitFor(() => screen.getByTestId("office-lan-open-confirm-cancel"));
    fireEvent.click(cancel);
    expect(screen.queryByTestId("office-lan-open-confirm")).toBeNull();
    expect(updateNodeConfig).not.toHaveBeenCalled();
  });

  it("enables with a pasted fleet token when provided", async () => {
    nodeConfig = {
      ...nodeConfig,
      capabilityProviderEnabled: false,
      lanAutoBondEnabled: false,
      lanAutoBondFleetToken: "",
    };
    renderWithI18n(<AgentNetworkSettingsModal onClose={() => {}} />);
    const tokenInput = await waitFor(
      () => screen.getByTestId("office-lan-fleet-token") as HTMLInputElement,
    );
    fireEvent.change(tokenInput, { target: { value: "shared-office-token-99" } });
    fireEvent.click(screen.getByTestId("office-lan-enable"));
    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          capabilityProviderEnabled: true,
          lanAutoBondEnabled: true,
          lanAutoBondFleetToken: "shared-office-token-99",
        }),
      );
    });
  });

  it("disables Join + LAN auto-bond while keeping the token off the patch", async () => {
    nodeConfig = {
      ...nodeConfig,
      capabilityProviderEnabled: true,
      lanAutoBondEnabled: true,
      lanAutoBondFleetToken: "fleet-token-12345678",
    };
    renderWithI18n(<AgentNetworkSettingsModal onClose={() => {}} />);
    const disable = await waitFor(() => screen.getByTestId("office-lan-disable"));
    fireEvent.click(disable);
    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalled();
    });
    const call = updateNodeConfig.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.capabilityProviderEnabled).toBe(false);
    expect(call.lanAutoBondEnabled).toBe(false);
    expect(call.lanAutoBondFleetToken).toBeUndefined();
  });

  it("saves a pasted fleet token from the Office LAN section", async () => {
    nodeConfig = {
      ...nodeConfig,
      capabilityProviderEnabled: false,
      lanAutoBondEnabled: false,
      lanAutoBondFleetToken: "",
    };
    renderWithI18n(<AgentNetworkSettingsModal onClose={() => {}} />);
    const tokenInput = await waitFor(
      () => screen.getByTestId("office-lan-fleet-token") as HTMLInputElement,
    );
    fireEvent.change(tokenInput, { target: { value: "shared-office-token-99" } });
    fireEvent.click(screen.getByTestId("office-lan-save-token"));
    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledWith(
        expect.objectContaining({ lanAutoBondFleetToken: "shared-office-token-99" }),
      );
    });
  });

  it("clears the fleet token to open LAN mode", async () => {
    nodeConfig = {
      ...nodeConfig,
      capabilityProviderEnabled: true,
      lanAutoBondEnabled: true,
      lanAutoBondFleetToken: "fleet-token-12345678",
    };
    renderWithI18n(<AgentNetworkSettingsModal onClose={() => {}} />);
    await waitFor(() => screen.getByTestId("office-lan-fleet-token"));
    fireEvent.click(screen.getByTestId("office-lan-clear-token"));
    fireEvent.click(screen.getByTestId("office-lan-save-token"));
    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledWith(
        expect.objectContaining({ lanAutoBondFleetToken: "" }),
      );
    });
  });

  it("rejects a too-short non-empty fleet token without persisting", async () => {
    renderWithI18n(<AgentNetworkSettingsModal onClose={() => {}} />);
    const tokenInput = await waitFor(
      () => screen.getByTestId("office-lan-fleet-token") as HTMLInputElement,
    );
    fireEvent.change(tokenInput, { target: { value: "abc" } });
    fireEvent.click(screen.getByTestId("office-lan-save-token"));
    expect(updateNodeConfig).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/)).toBeDefined();
    });
  });
});

describe("WorkersStatusSection", () => {
  it("shows Join-off nudge when LAN auto-bond is on with bonded peers", async () => {
    nodeConfig = {
      ...nodeConfig,
      capabilityProviderEnabled: false,
      lanAutoBondEnabled: true,
      lanAutoBondFleetToken: "fleet-token-12345678",
    };
    getBonds.mockResolvedValue([
      {
        peerOwnerId: "envoy:owner:lan-peer",
        level: "direct",
        note: "manual-bond",
      },
    ]);
    renderWithI18n(<WorkersStatusSection />);
    await waitFor(() => {
      expect(screen.getByTestId("join-off-after-lan-nudge")).toBeDefined();
    });
  });

  it("shows Join-off nudge for lan-auto bond note even if LAN toggle is off", async () => {
    nodeConfig = {
      ...nodeConfig,
      capabilityProviderEnabled: false,
      lanAutoBondEnabled: false,
      lanAutoBondFleetToken: "",
    };
    getBonds.mockResolvedValue([
      {
        peerOwnerId: "envoy:owner:lan-peer",
        level: "direct",
        note: "lan-auto-bond",
      },
    ]);
    renderWithI18n(<WorkersStatusSection />);
    await waitFor(() => {
      expect(screen.getByTestId("join-off-after-lan-nudge")).toBeDefined();
    });
  });

  it("Refresh workers calls refreshAgentNetworkWorkers", async () => {
    renderWithI18n(<WorkersStatusSection />);
    const refresh = await waitFor(() => screen.getByTestId("refresh-workers"));
    fireEvent.click(refresh);
    await waitFor(() => {
      expect(refreshAgentNetworkWorkers).toHaveBeenCalled();
    });
  });
});

describe("FleetManifestSection", () => {
  it("renders the empty state when there are no manifests", async () => {
    renderWithI18n(<FleetManifestSection />);
    await waitFor(() => {
      expect(screen.getByText("No fleet manifests imported yet.")).toBeDefined();
    });
  });

  it("rejects malformed member JSON before signing", async () => {
    renderWithI18n(<FleetManifestSection />);
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
    renderWithI18n(<FleetManifestSection />);
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
    renderWithI18n(<FleetManifestSection />);
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
    renderWithI18n(<FleetManifestSection />);
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
