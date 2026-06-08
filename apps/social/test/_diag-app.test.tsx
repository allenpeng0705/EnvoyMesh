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

/**
 * Build a "complete" fake client backed by a Proxy. The Proxy returns safe
 * defaults for any method or property the App / hooks may touch during mount —
 * arrays for list methods, plain objects for "get X" methods, undefined
 * fallbacks for everything else. This is only used by the diagnostic
 * `renders` test; the proxy keeps the test from cascading into "X is not a
 * function" TypeErrors every time the App grows a new client call.
 */
const fakeClient = () => {
  const base: Record<string, unknown> = {
    isConnected: true,
    reconnectAttempts: 0,
    getLastError: () => null,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
    waitForConnection: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(() => () => {}),
    off: vi.fn(),
    hasListeners: vi.fn(() => false),
    getProfile: vi.fn().mockResolvedValue({}),
    getNodeStatus: vi.fn().mockResolvedValue({ status: "ready" }),
    getConnectionStatus: vi.fn().mockResolvedValue({ status: "online" }),
    getBonds: vi.fn().mockResolvedValue([]),
    getChatRooms: vi.fn().mockResolvedValue([]),
    listChatRooms: vi.fn().mockResolvedValue([]),
    revokeBond: vi.fn().mockResolvedValue(undefined),
    updateNodeConfig: vi.fn().mockResolvedValue(undefined),
    listAgentCircles: vi.fn().mockResolvedValue([]),
    createAgentCircle: vi.fn().mockResolvedValue({}),
    updateAgentCircle: vi.fn().mockResolvedValue({}),
    deleteAgentCircle: vi.fn().mockResolvedValue(undefined),
    proposeAgentCircles: vi.fn().mockResolvedValue([]),
    generateMeshIntelligenceReport: vi.fn().mockResolvedValue(""),
    clearAllUserData: vi.fn().mockResolvedValue(undefined),
    // Most recent additions surfaced by mount-time hooks; explicit no-ops
    // keep the Proxy from being the only thing standing between the App and
    // a TypeError. The Proxy below still catches anything not listed here.
    listPendingShareOffers: vi.fn().mockResolvedValue([]),
    listPendingSocialIntroProposals: vi.fn().mockResolvedValue([]),
    listAgentShareProposals: vi.fn().mockResolvedValue([]),
    listPendingApprovals: vi.fn().mockResolvedValue([]),
  };
  return new Proxy(base, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === "then") return undefined;
      if (prop === "nodeType" || prop === "tagName") return undefined;
      // Treat any unknown method as an async no-op (returns a Promise that
      // resolves to a safe empty default). This avoids "X is not a function"
      // TypeErrors when the App/hooks grow new client calls.
      return vi.fn().mockResolvedValue(undefined);
    },
  });
};

describe("diag", () => {
  it("renders the App shell with a proxied client", () => {
    // Diagnostic smoke test: the App should mount without throwing, even when
    // the client is a Proxy-backed fake. Used during development to verify
    // that no new mount-time hook is missing from the fake client. Pass
    // intentionally; failures should be fixed in fakeClient() above.
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
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});
