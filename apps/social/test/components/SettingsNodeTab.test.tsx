/**
 * @vitest-environment jsdom
 *
 * Phase 42H — component test for the TURN servers editor embedded in
 * `SettingsNodeTab`. Verifies the user-facing flows the plan calls out:
 *   - Initial draft is populated from nodeConfig.iceServers (TURN-only).
 *   - Add row + select a preset pre-fills the URL.
 *   - Validation surfaces an error when a `turn:` row is missing creds.
 *   - Save calls `updateNodeConfig({ iceServers: merged })` with the
 *     right payload and the editor clears its draft on success.
 *
 * Drives `TurnServersSection` directly (exported for testability) so we
 * don't have to set up the full `NodeStateProvider` context.
 */

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TurnServersSection } from "../../src/components/views/SettingsNodeTab.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

const updateNodeConfig = vi.fn();
const refreshNodeConfig = vi.fn();
const nodeServiceMock = {
  updateNodeConfig,
  refreshNodeConfig,
};

function renderTurnSection(nodeConfig: { iceServers?: { urls: string; username?: string; credential?: string }[] } | null) {
  return render(
    <I18nTestProvider locale="en">
      <TurnServersSection
        nodeConfig={nodeConfig as never}
        nodeService={nodeServiceMock as never}
        refreshNodeConfig={refreshNodeConfig}
      />
    </I18nTestProvider>,
  );
}

describe("SettingsNodeTab — TURN servers editor (Phase 42H)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateNodeConfig.mockResolvedValue({ ok: true });
    refreshNodeConfig.mockResolvedValue(undefined);
  });
  afterEach(() => cleanup());

  it("renders the empty-state message when no TURN entries exist", () => {
    renderTurnSection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    expect(
      screen.getByText("No TURN servers configured. Calls will fall back to STUN-only."),
    ).toBeDefined();
  });

  it("pre-fills the draft from existing TURN entries in nodeConfig (STUN is preserved separately)", () => {
    renderTurnSection({
      iceServers: [
        { urls: "turn:turn.example.com:3478", username: "u", credential: "c" },
        { urls: "stun:stun.l.google.com:19302" },
      ],
    });
    const section = screen.getByTestId("turn-servers-section");
    const rows = within(section).getAllByTestId(/^turn-row-/);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByDisplayValue("turn:turn.example.com:3478")).toBeDefined();
    expect(within(rows[0]!).getByDisplayValue("u")).toBeDefined();
  });

  it("adds a row, applies the Twilio preset, fills credentials, then saves successfully", async () => {
    renderTurnSection({ iceServers: [] });
    const section = screen.getByTestId("turn-servers-section");

    // Add a row (which also auto-selects the first preset, Twilio).
    fireEvent.click(within(section).getByTestId("turn-add-row"));

    // The preset selector should be enabled and set to twilio.
    const preset = within(section).getByTestId("turn-preset") as HTMLSelectElement;
    expect(preset.value).toBe("twilio");

    // The new row's URL should be pre-filled from the preset.
    const rows = within(section).getAllByTestId(/^turn-row-/);
    expect(rows).toHaveLength(1);
    const urlInput = within(rows[0]!).getByDisplayValue(
      "turn:global.turn.twilio.com:3478?transport=udp",
    );
    expect(urlInput).toBeDefined();

    // Fill the credentials.
    const username = within(rows[0]!).getByLabelText(/Username/);
    const credential = within(rows[0]!).getByLabelText(/Credential/);
    fireEvent.change(username, { target: { value: "twilio-user" } });
    fireEvent.change(credential, { target: { value: "twilio-secret" } });

    // Save — assert updateNodeConfig + refreshNodeConfig fire.
    fireEvent.click(within(section).getByTestId("turn-save"));
    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledTimes(1);
    });
    expect(refreshNodeConfig).toHaveBeenCalledTimes(1);
    const payload = updateNodeConfig.mock.calls[0]![0] as { iceServers: { urls: string; username?: string; credential?: string }[] };
    const turnRow = payload.iceServers.find((e) => e.urls.startsWith("turn:"));
    expect(turnRow?.username).toBe("twilio-user");
    expect(turnRow?.credential).toBe("twilio-secret");
  });

  it("blocks save and surfaces a missing-credentials error when a turn: row is incomplete", async () => {
    renderTurnSection({
      iceServers: [
        { urls: "turn:turn.example.com:3478", username: "", credential: "" },
      ],
    });
    const section = screen.getByTestId("turn-servers-section");
    fireEvent.click(within(section).getByTestId("turn-save"));
    await waitFor(() => {
      expect(
        screen.getByText(/TURN entries need both username and credential/),
      ).toBeDefined();
    });
    expect(updateNodeConfig).not.toHaveBeenCalled();
  });

  it("Reset to defaults clears the draft", async () => {
    renderTurnSection({
      iceServers: [
        { urls: "turn:turn.example.com:3478", username: "u", credential: "c" },
      ],
    });
    const section = screen.getByTestId("turn-servers-section");
    expect(within(section).queryAllByTestId(/^turn-row-/)).toHaveLength(1);
    fireEvent.click(within(section).getByTestId("turn-reset"));
    await waitFor(() => {
      expect(
        screen.getByText("No TURN servers configured. Calls will fall back to STUN-only."),
      ).toBeDefined();
    });
  });
});