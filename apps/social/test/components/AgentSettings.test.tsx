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
    // Mode chip lives in the .agent-mode-summary row at the top of the panel.
    const chip = document.querySelector(".agent-mode-summary .agent-mode-chip");
    expect(chip?.textContent).toMatch(/Built-in \+ Ext/i);
  });

  it("shows the 'Built-in only' chip when only the built-in is enabled", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://127.0.0.1:18789/webhook/envoymesh" }}
        extAgent={{ enabled: false, configured: false }}
        onExtAgentSave={noopAsync}
      />,
    );
    const chip = document.querySelector(".agent-mode-summary .agent-mode-chip");
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
    const chip = document.querySelector(".agent-mode-summary .agent-mode-chip");
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
    const chip = document.querySelector(".agent-mode-summary .agent-mode-chip");
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
    const descriptions = Array.from(document.querySelectorAll(".agent-block-desc"));
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

  it("renders the built-in webhook URL as a read-only value (not an editable input)", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://127.0.0.1:18789/webhook/envoymesh" }}
        extAgent={{ enabled: false, configured: false }}
        onExtAgentSave={noopAsync}
      />,
    );
    // The webhook URL is rendered as plain text inside a <dd> (definition
    // list), not as a disabled <input>. The user can't accidentally
    // highlight / copy-fail on a grayed-out input — it just looks like
    // a normal readable value.
    const dl = document.querySelector(".agent-block .agent-block-fields");
    expect(dl?.textContent).toContain("http://127.0.0.1:18789/webhook/envoymesh");
    // No editable input with the webhook value.
    expect(screen.queryByDisplayValue("http://127.0.0.1:18789/webhook/envoymesh")).toBeNull();
  });

  it("shows 3-state status badge: 'Running' when enabled + running", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://x" }}
        extAgent={{ enabled: false, configured: false }}
        onExtAgentSave={noopAsync}
      />,
    );
    // The status badge lives inside .agent-block-status, not the generic
    // .status-badge class.
    const running = document.querySelector(".agent-block-status--on");
    expect(running?.textContent).toMatch(/^Running$/i);
  });

  it("shows 3-state status badge: 'Stopped' when enabled but not running", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: false, url: "http://x" }}
        extAgent={{ enabled: false, configured: false }}
        onExtAgentSave={noopAsync}
      />,
    );
    const stopped = document.querySelector(".agent-block-status--warn");
    expect(stopped?.textContent).toMatch(/^Stopped$/i);
  });

  it("shows install hint + website link when configuring an external agent", async () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://x" }}
        extAgent={{
          enabled: true,
          configured: true,
          name: "Pi",
          url: "http://127.0.0.1:8022/message",
          listenPort: 3031,
          activeExtAgentId: "pi",
        }}
        onExtAgentSave={noopAsync}
      />,
    );
    // Read-only view shows Pi install hint.
    expect(screen.getByTestId("ext-agent-install-hint").textContent).toMatch(/built into/i);
    expect(screen.getByRole("link", { name: /Pi on GitHub/i })).toBeTruthy();

    fireEvent.click(screen.getByText(/^Configure$/));
    const select = document.querySelector(
      ".agent-block .agent-field-input",
    ) as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    fireEvent.change(select!, { target: { value: "hermes" } });
    await waitFor(() => {
      expect(screen.getByTestId("ext-agent-install-hint").textContent).toMatch(/hermes gateway/i);
    });
    const hermesLink = screen.getByRole("link", { name: /Hermes docs/i }) as HTMLAnchorElement;
    expect(hermesLink.href).toContain("hermes-agent.nousresearch.com");
  });

  it("always shows Project folder path field (disabled when agent has no cwd)", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://127.0.0.1:18789/webhook/envoymesh" }}
        extAgent={{
          enabled: true,
          configured: true,
          name: "Pi",
          url: "http://x",
          listenPort: 3031,
          activeExtAgentId: "pi",
          extAgents: [
            {
              id: "pi",
              name: "Pi",
              adapter: "envoymesh-message",
              url: "http://x",
              enabled: true,
            },
          ],
        }}
        onExtAgentSave={noopAsync}
      />,
    );
    const folder = screen.getByTestId("ext-agent-project-folder-settings");
    expect(folder).toBeTruthy();
    expect(screen.getByTestId("ext-agent-project-folder-hint").textContent).toMatch(
      /Codex|Claude Code|Cursor/i,
    );
    const input = screen.getByLabelText(/Project folder/i) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it("routes project folder Set through onProjectPathChange (not onExtAgentSave)", async () => {
    const onExtAgentSave = vi.fn().mockResolvedValue(undefined);
    const onProjectPathChange = vi.fn().mockResolvedValue({
      usesProjectPath: true,
      projectPath: "/tmp/codex-proj",
    });
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://127.0.0.1:18789/webhook/envoymesh" }}
        extAgent={{
          enabled: true,
          configured: true,
          name: "Codex",
          url: "http://x",
          listenPort: 3031,
          activeExtAgentId: "codex",
          extAgents: [
            {
              id: "codex",
              name: "Codex",
              adapter: "envoymesh-message",
              url: "http://x",
              enabled: true,
            },
          ],
        }}
        onExtAgentSave={onExtAgentSave}
        onProjectPathChange={onProjectPathChange}
      />,
    );
    const input = screen.getByLabelText(/Project folder/i) as HTMLInputElement;
    expect(input.disabled).toBe(false);
    fireEvent.change(input, { target: { value: "/tmp/codex-proj" } });
    fireEvent.click(screen.getByRole("button", { name: /^Set$/i }));
    await waitFor(() =>
      expect(onProjectPathChange).toHaveBeenCalledWith({
        agentId: "codex",
        projectPath: "/tmp/codex-proj",
      }),
    );
    expect(onExtAgentSave).not.toHaveBeenCalled();
  });
});
