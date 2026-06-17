/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { AgentSettings } from "../../src/components/views/settings/AgentSettings.js";

const noopAsync = async () => {};

afterEach(() => cleanup());

describe("AgentSettings — phase 32", () => {
  it("shows the 'Built-in + Ext' mode chip when both agents are enabled", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://127.0.0.1:18789/webhook/envoymesh" }}
        extAgent={{ enabled: true, configured: true, name: "HomeClaw", url: "http://x", listenPort: 3031 }}
        onExtAgentSave={noopAsync}
      />,
    );
    const chip = document.querySelector(".settings-agent-mode .status-badge");
    expect(chip?.textContent).toMatch(/Built-in \+ Ext/i);
  });

  it("shows the 'Built-in only' chip when only the built-in is enabled (D1C default)", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://127.0.0.1:18789/webhook/envoymesh" }}
        extAgent={{ enabled: false, configured: false }}
        onExtAgentSave={noopAsync}
      />,
    );
    const chip = document.querySelector(".settings-agent-mode .status-badge");
    expect(chip?.textContent).toMatch(/Built-in only/i);
  });

  it("shows the 'Ext only' chip when only the bridge is enabled", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: false, running: false, url: "" }}
        extAgent={{ enabled: true, configured: true, name: "HomeClaw", url: "http://x", listenPort: 3031 }}
        onExtAgentSave={noopAsync}
      />,
    );
    const chip = document.querySelector(".settings-agent-mode .status-badge");
    expect(chip?.textContent).toMatch(/Ext only/i);
  });

  it("shows the 'None' chip when both are disabled", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: false, running: false, url: "" }}
        extAgent={{ enabled: false, configured: false }}
        onExtAgentSave={noopAsync}
      />,
    );
    const chip = document.querySelector(".settings-agent-mode .status-badge");
    expect(chip?.textContent).toMatch(/^None$/i);
  });

  it("does NOT render a built-in toggle — the block is read-only in the UI", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://127.0.0.1:18789/webhook/envoymesh" }}
        extAgent={{ enabled: false, configured: false }}
        onExtAgentSave={noopAsync}
      />,
    );
    // No checkbox with text "Enable built-in OpenClaw" should exist.
    expect(screen.queryByLabelText(/Enable built-in OpenClaw/i)).toBeNull();
    // The Built-in OpenClaw block's description mentions node-config.json.
    const descriptions = Array.from(document.querySelectorAll(".settings-section-desc"));
    const hint = descriptions.find((el) => /node-config\.json/i.test(el.textContent ?? ""));
    expect(hint).toBeDefined();
  });

  it("invokes onExtAgentSave when the Ext Agent checkbox is toggled", async () => {
    const onExtAgentSave = vi.fn().mockResolvedValue(undefined);
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://x" }}
        extAgent={{ enabled: false, configured: false }}
        onExtAgentSave={onExtAgentSave}
      />,
    );
    // Click "Configure" to enter edit mode.
    fireEvent.click(screen.getByText(/^Configure$/));
    // The Ext Agent enable checkbox is now visible.
    const extCheckbox = await screen.findByLabelText(/Enable external agent bridge/i) as HTMLInputElement;
    expect(extCheckbox.checked).toBe(false);
    fireEvent.click(extCheckbox);
    // Click Save.
    fireEvent.click(screen.getByText(/^Save$/));
    await waitFor(() => expect(onExtAgentSave).toHaveBeenCalled());
    const callArg = onExtAgentSave.mock.calls[0]?.[0] as { enabled: boolean } | undefined;
    expect(callArg?.enabled).toBe(true);
  });

  it("renders the built-in webhook URL as a read-only field", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://127.0.0.1:18789/webhook/envoymesh" }}
        extAgent={{ enabled: false, configured: false }}
        onExtAgentSave={noopAsync}
      />,
    );
    const webhookInput = screen.getByDisplayValue("http://127.0.0.1:18789/webhook/envoymesh") as HTMLInputElement;
    expect(webhookInput.readOnly).toBe(true);
    expect(webhookInput.disabled).toBe(true);
  });

  it("shows 3-state status badge: 'Running' when enabled + running", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://x" }}
        extAgent={{ enabled: false, configured: false }}
        onExtAgentSave={noopAsync}
      />,
    );
    const running = Array.from(document.querySelectorAll(".status-badge")).find(
      (el) => /^Running$/i.test(el.textContent ?? ""),
    );
    expect(running).toBeDefined();
  });

  it("shows 3-state status badge: 'Stopped' when enabled but not running", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: false, url: "http://x" }}
        extAgent={{ enabled: false, configured: false }}
        onExtAgentSave={noopAsync}
      />,
    );
    const stopped = Array.from(document.querySelectorAll(".status-badge")).find(
      (el) => /^Stopped$/i.test(el.textContent ?? ""),
    );
    expect(stopped).toBeDefined();
  });

  it("shows 3-state status badge: 'Disabled' when not enabled", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: false, running: false, url: "" }}
        extAgent={{ enabled: false, configured: false }}
        onExtAgentSave={noopAsync}
      />,
    );
    const disabled = Array.from(document.querySelectorAll(".status-badge")).find(
      (el) => /^Disabled$/i.test(el.textContent ?? ""),
    );
    expect(disabled).toBeDefined();
  });
});
