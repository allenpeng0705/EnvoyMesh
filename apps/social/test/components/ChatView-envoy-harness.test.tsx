/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { ENVOY_HARNESS_THREAD_KEY } from "@envoymesh/api";
import { ChatView } from "../../src/components/views/ChatView.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    isConnected: true,
    listChatRooms: vi.fn().mockResolvedValue([]),
    listFamilyRooms: vi.fn().mockResolvedValue({ rooms: [] }),
    on: vi.fn(() => () => {}),
  }),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    nodeConfig: { modelProviders: { mode: "openai-compatible", presetId: "openai" } },
    bonds: [{ peerOwnerId: "envoy:owner:alice" }],
  }),
}));

vi.mock("../../src/components/views/ChatSidebar.js", () => ({
  ChatSidebar: () => <div data-testid="chat-sidebar-stub" />,
}));

vi.mock("../../src/components/views/EnvoyHarnessPanel.js", () => ({
  EnvoyHarnessPanel: () => <div data-testid="envoy-harness-panel">Envoy harness panel</div>,
}));

vi.mock("../../src/components/views/OpenClawOfflineBanner.js", () => ({
  OpenClawOfflineBanner: () => null,
}));

describe("ChatView — envoy-harness thread", () => {
  it("shows EnvoyHarnessPanel without the empty-state placeholder", () => {
    renderWithI18n(
      <ChatView
        selectedContact={ENVOY_HARNESS_THREAD_KEY}
        onSelectedContactChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("envoy-harness-panel")).toBeTruthy();
    expect(screen.queryByText(/select a contact/i)).toBeNull();
  });
});
