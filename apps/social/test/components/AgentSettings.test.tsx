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

const extAgentsFixture = [
  {
    id: "homeclaw",
    name: "HomeClaw",
    adapter: "envoymesh-message",
    url: "http://127.0.0.1:8010/message",
    enabled: true,
  },
  {
    id: "hermes",
    name: "Hermes",
    adapter: "envoymesh-message",
    url: "http://127.0.0.1:8020/message",
    enabled: true,
  },
] as const;

describe("AgentSettings — phase 44 multi-agent", () => {
  it("shows reachability badge when healthy is set", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://x" }}
        extAgent={{
          enabled: true,
          configured: true,
          name: "HomeClaw",
          url: "http://127.0.0.1:8010/message",
          listenPort: 3031,
          activeExtAgent: "homeclaw",
          activeExtAgentId: "homeclaw",
          adapter: "envoymesh-message",
          healthy: false,
          extAgents: [
            {
              id: "homeclaw",
              name: "HomeClaw",
              adapter: "envoymesh-message",
              url: "http://127.0.0.1:8010/message",
              enabled: true,
              healthy: false,
              reachability: "stopped",
            },
            {
              id: "hermes",
              name: "Hermes",
              adapter: "envoymesh-message",
              url: "http://127.0.0.1:8020/message",
              enabled: true,
              healthy: true,
              reachability: "running",
            },
          ],
        }}
        onExtAgentSave={noopAsync}
      />,
    );
    expect(screen.getByText(/^Unreachable$/)).toBeDefined();
    const table = document.querySelector(".settings-bridge-registry table.settings-table");
    expect(table).toBeTruthy();
    expect(table?.textContent).toMatch(/Stopped/);
    expect(table?.textContent).toMatch(/Running/);
  });

  it("shows registry table and active agent card in read-only mode", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://x" }}
        extAgent={{
          enabled: true,
          configured: true,
          name: "HomeClaw",
          url: "http://127.0.0.1:8010/message",
          listenPort: 3031,
          activeExtAgent: "homeclaw",
          activeExtAgentId: "homeclaw",
          adapter: "envoymesh-message",
          extAgents: [...extAgentsFixture],
        }}
        onExtAgentSave={noopAsync}
      />,
    );
    expect(document.querySelector(".ext-agent-active-card")).toBeTruthy();
    expect(screen.getByDisplayValue("http://127.0.0.1:8010/message")).toBeDefined();
    expect(screen.getByDisplayValue("8010")).toBeDefined();
    expect(screen.queryByLabelText(/^Listen port$/i)).toBeNull();
    expect(screen.getByRole("table").textContent).toMatch(/Hermes/);
    const activeRow = document.querySelector('tr[data-active="true"]');
    expect(activeRow?.textContent).toMatch(/HomeClaw/);
  });

  it("does not append agent name to section title when registry is present", () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://x" }}
        extAgent={{
          enabled: true,
          configured: true,
          name: "HomeClaw",
          url: "http://127.0.0.1:8010/message",
          listenPort: 3031,
          activeExtAgent: "homeclaw",
          activeExtAgentId: "homeclaw",
          extAgents: [...extAgentsFixture],
        }}
        onExtAgentSave={noopAsync}
      />,
    );
    const titles = Array.from(document.querySelectorAll(".settings-section-title"));
    const extTitle = titles.find((el) => /External Agent Bridge/i.test(el.textContent ?? ""));
    expect(extTitle?.textContent).not.toMatch(/— HomeClaw/);
  });

  it("fills default fields when switching agent in configure mode", async () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://x" }}
        extAgent={{
          enabled: true,
          configured: true,
          name: "HomeClaw",
          url: "http://127.0.0.1:8010/message",
          listenPort: 3031,
          activeExtAgent: "homeclaw",
          activeExtAgentId: "homeclaw",
          extAgents: [...extAgentsFixture],
        }}
        onExtAgentSave={noopAsync}
      />,
    );
    fireEvent.click(screen.getByText(/^Configure$/));
    const select = await screen.findByRole("combobox", { name: /Active backend/i }) as HTMLSelectElement;
    expect(select.value).toBe("homeclaw");
    expect(screen.getByDisplayValue("http://127.0.0.1:8010/message")).toBeDefined();

    fireEvent.change(select, { target: { value: "hermes" } });
    expect(screen.getByDisplayValue("http://127.0.0.1:8020/message")).toBeDefined();
  });

  it("legacy configure mode offers bundled agents and add-custom option", async () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://x" }}
        extAgent={{
          enabled: true,
          configured: true,
          name: "HomeClaw",
          url: "http://127.0.0.1:8010/message",
          listenPort: 3031,
        }}
        onExtAgentSave={noopAsync}
      />,
    );
    fireEvent.click(screen.getByText(/^Configure$/));
    const select = await screen.findByRole("combobox", { name: /Active backend/i }) as HTMLSelectElement;
    expect(Array.from(select.options).some((o) => o.value === "homeclaw")).toBe(true);
    expect(Array.from(select.options).some((o) => o.value === "__new_custom__")).toBe(true);
    fireEvent.change(select, { target: { value: "__new_custom__" } });
    expect(screen.getByPlaceholderText("my-agent")).toBeDefined();
  });

  it("saves a new custom agent from configure mode", async () => {
    const onExtAgentSave = vi.fn().mockResolvedValue(undefined);
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://x" }}
        extAgent={{
          enabled: true,
          configured: true,
          name: "HomeClaw",
          url: "http://127.0.0.1:8010/message",
          listenPort: 3031,
          extAgents: [...extAgentsFixture],
        }}
        onExtAgentSave={onExtAgentSave}
      />,
    );
    fireEvent.click(screen.getByText(/^Configure$/));
    const select = await screen.findByRole("combobox", { name: /Active backend/i }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "__new_custom__" } });
    fireEvent.change(screen.getByPlaceholderText("my-agent"), { target: { value: "my-bot" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. HomeClaw"), { target: { value: "My Bot" } });
    fireEvent.change(screen.getByPlaceholderText("http://127.0.0.1:8010/message"), {
      target: { value: "http://127.0.0.1:9000/message" },
    });
    fireEvent.click(screen.getByText(/^Save$/));
    await waitFor(() => expect(onExtAgentSave).toHaveBeenCalled());
    const saved = onExtAgentSave.mock.calls[0]?.[0] as {
      activeExtAgent?: string;
      extAgents?: Array<{ id: string; url: string }>;
    };
    expect(saved.activeExtAgent).toBe("my-bot");
    expect(saved.extAgents?.find((e) => e.id === "my-bot")?.url).toBe("http://127.0.0.1:9000/message");
  });

  it("shows active-backend select in edit mode and saves activeExtAgent", async () => {
    const onExtAgentSave = vi.fn().mockResolvedValue(undefined);
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://x" }}
        extAgent={{
          enabled: true,
          configured: true,
          name: "HomeClaw",
          url: "http://127.0.0.1:8010/message",
          listenPort: 3031,
          activeExtAgent: "homeclaw",
          activeExtAgentId: "homeclaw",
          extAgents: [...extAgentsFixture],
        }}
        onExtAgentSave={onExtAgentSave}
      />,
    );
    fireEvent.click(screen.getByText(/^Configure$/));
    const select = await screen.findByRole("combobox", { name: /Active backend/i }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "hermes" } });
    fireEvent.click(screen.getByText(/^Save$/));
    await waitFor(() => expect(onExtAgentSave).toHaveBeenCalled());
    const saved = onExtAgentSave.mock.calls[0]?.[0] as {
      activeExtAgent?: string;
      extAgents?: unknown[];
    };
    expect(saved.activeExtAgent).toBe("hermes");
    expect(saved.extAgents).toHaveLength(2);
    expect(saved.url).toBe("http://127.0.0.1:8020/message");
    expect(saved.name).toBe("Hermes");
  });

  it("legacy single-agent edit exposes agent picker and URL fields when no registry", async () => {
    renderWithI18n(
      <AgentSettings
        envoyAI={{ enabled: true, running: true, url: "http://x" }}
        extAgent={{
          enabled: true,
          configured: true,
          name: "HomeClaw",
          url: "http://127.0.0.1:8010/message",
          listenPort: 3031,
        }}
        onExtAgentSave={noopAsync}
      />,
    );
    fireEvent.click(screen.getByText(/^Configure$/));
    expect(await screen.findByDisplayValue("http://127.0.0.1:8010/message")).toBeDefined();
    expect(screen.getByRole("combobox", { name: /Active backend/i })).toBeDefined();
  });
});
