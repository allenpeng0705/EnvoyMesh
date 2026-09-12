/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { ENVOY_HARNESS_THREAD_KEY, envoyHarnessThreadKey } from "@envoymesh/api";
import { ChatView } from "../../src/components/views/ChatView.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { OPEN_CODING_EVENT } from "../../src/lib/open-coding-nav.js";

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    isConnected: true,
    listChatRooms: vi.fn().mockResolvedValue([]),
    listFamilyRooms: vi.fn().mockResolvedValue({ rooms: [] }),
    listEnvoyHarnessChats: vi.fn().mockResolvedValue([]),
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

vi.mock("../../src/components/views/OpenClawOfflineBanner.js", () => ({
  OpenClawOfflineBanner: () => null,
}));

describe("ChatView — envoy-harness thread redirects to Coding", () => {
  beforeEach(() => {
    cleanup();
  });
  afterEach(() => cleanup());

  it("opens Coding and clears Chat selection for legacy EH thread keys", async () => {
    const onSelectedContactChange = vi.fn();
    const codingOpens: unknown[] = [];
    const onCoding = (ev: Event) => {
      codingOpens.push((ev as CustomEvent).detail);
    };
    window.addEventListener(OPEN_CODING_EVENT, onCoding);

    renderWithI18n(
      <ChatView
        selectedContact={envoyHarnessThreadKey("chat-1")}
        onSelectedContactChange={onSelectedContactChange}
      />,
    );

    await waitFor(() => {
      expect(onSelectedContactChange).toHaveBeenCalledWith(null);
    });
    expect(codingOpens.length).toBeGreaterThan(0);
    expect(codingOpens[0]).toEqual({ chatId: "chat-1" });

    window.removeEventListener(OPEN_CODING_EVENT, onCoding);
  });

  it("does not mount EnvoyHarnessPanel in Chat", () => {
    renderWithI18n(
      <ChatView
        selectedContact={ENVOY_HARNESS_THREAD_KEY}
        onSelectedContactChange={vi.fn()}
      />,
    );
    expect(document.querySelector("[data-testid=envoy-harness-panel]")).toBeNull();
  });
});
