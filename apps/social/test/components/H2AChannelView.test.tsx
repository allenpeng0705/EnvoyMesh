/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { H2AChannelView } from "../../src/components/views/H2AChannelView.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const listAgentActivity = vi.fn().mockResolvedValue([]);
const listPendingApprovals = vi.fn().mockResolvedValue([]);
const sendSyncStateUpdate = vi.fn().mockResolvedValue({ ok: true, recipients: 0 });
const on = vi.fn(() => () => {});

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    listAgentActivity,
    listPendingApprovals,
    runDocumentAgentTurn: vi.fn(),
    sendSyncStateUpdate,
    on,
  }),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    nodeConfig: { modelProviders: { mode: "mock", modelName: "test" } },
  }),
}));

afterEach(() => cleanup());

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("H2AChannelView", () => {
  it("renders owner-home-agent rail and chat panel", () => {
    renderWithI18n(<H2AChannelView />);
    expect(screen.getByRole("heading", { name: /envoyai/i })).toBeDefined();
    expect(screen.getByText(/chat with your ai assistant/i)).toBeDefined();
  });

  it("calls onBackToChats when back control is clicked", () => {
    const onBackToChats = vi.fn();
    renderWithI18n(<H2AChannelView onBackToChats={onBackToChats} />);
    fireEvent.click(screen.getByRole("button", { name: /back to chats/i }));
    expect(onBackToChats).toHaveBeenCalledTimes(1);
  });
});
