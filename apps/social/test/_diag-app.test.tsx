/** @vitest-environment jsdom */
import React from "react";
import { describe, it, vi, beforeAll, expect } from "vitest";
import { render } from "@testing-library/react";
import { I18nTestProvider } from "../src/context/I18nContext.js";
import { ThemeProvider } from "../src/context/ThemeContext.js";
import { NodeStateProvider } from "../src/context/NodeStateContext.js";
import { NodeServiceProvider } from "../src/hooks/useNodeService.js";
import { App } from "../src/App.js";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: false,
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

const fakeClient = () => {
  const noopAsync = async () => {};
  return {
    isConnected: true,
    reconnectAttempts: 0,
    getLastError: () => null,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
    waitForConnection: vi.fn(),
    on: vi.fn(() => () => {}),
    off: vi.fn(),
    hasListeners: vi.fn(() => false),
    getProfile: vi.fn(),
    getNodeStatus: vi.fn(),
    getConnectionStatus: vi.fn(),
    getBonds: vi.fn().mockResolvedValue([]),
    getChatRooms: vi.fn().mockResolvedValue([]),
    listChatRooms: vi.fn().mockResolvedValue([]),
    revokeBond: vi.fn(),
    updateNodeConfig: vi.fn().mockResolvedValue(undefined),
    // Phase 23A — AI-curated circles
    listAgentCircles: vi.fn().mockResolvedValue([]),
    createAgentCircle: vi.fn().mockResolvedValue(undefined),
    updateAgentCircle: vi.fn().mockResolvedValue(undefined),
    deleteAgentCircle: vi.fn().mockResolvedValue(undefined),
    proposeAgentCircles: vi.fn().mockResolvedValue([]),
    // Phase 27B — Mesh intelligence
    generateMeshIntelligenceReport: vi.fn().mockResolvedValue(""),
    // Privacy
    clearAllUserData: vi.fn().mockResolvedValue(undefined),
  };
};

describe("diag", () => {
  it("renders", () => {
    const { container } = render(
      <I18nTestProvider>
        <ThemeProvider>
          <NodeServiceProvider clientFactory={fakeClient}>
            <NodeStateProvider>
              <App />
            </NodeStateProvider>
          </NodeServiceProvider>
        </ThemeProvider>
      </I18nTestProvider>,
    );
    const html = container.innerHTML;
    expect(html).toBeDefined();
    // Force failure to see HTML
    expect("LEN=" + html.length + "\n" + html.slice(0, 4000)).toBe("DIAG");
  });
});
