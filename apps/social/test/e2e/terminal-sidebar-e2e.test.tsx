/**
 * @vitest-environment jsdom
 * E2E (UI integration): Terminal sidebar badges and Focus EnvoyAI affordance.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import type { TerminalSessionSummary } from "@envoymesh/api";
import { TerminalSidebar } from "../../src/components/terminals/TerminalSidebar.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const listTerminalSessions = vi.fn();
const onSessionsChange = vi.fn();
const onSelectSession = vi.fn();
const onOpenAssistant = vi.fn();

let sessions: TerminalSessionSummary[] = [];
let pendingApprovalCount = 0;

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    listTerminalSessions,
    createTerminalSession: vi.fn(),
    closeTerminalSession: vi.fn(),
    on: () => () => {},
  }),
  usePendingApprovals: () => ({
    items: Array.from({ length: pendingApprovalCount }, (_, i) => ({ id: `a-${i}` })),
    approve: vi.fn(),
    reject: vi.fn(),
  }),
  useTerminalSessions: () => ({
    sessions,
    refresh: async () => {
      await listTerminalSessions();
    },
  }),
}));

function renderSidebar() {
  return renderWithI18n(
    <TerminalSidebar
      selectedSessionId={sessions[0]?.sessionId ?? null}
      onSelectSession={onSelectSession}
      onSessionsChange={onSessionsChange}
      onOpenAssistant={onOpenAssistant}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessions = [];
  pendingApprovalCount = 0;
});

beforeEach(() => {
  listTerminalSessions.mockImplementation(async () => sessions);
});

describe("E2E Terminal sidebar", () => {
  it("renders session rows from the shared terminal session list", async () => {
    sessions = [
      {
        sessionId: "s-working",
        title: "Build",
        cwd: "/tmp",
        shell: "/bin/bash",
        state: "running",
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        activityBadge: "working",
        foregroundHint: "npm",
      },
    ];
    renderSidebar();
    expect(await screen.findByText("Build")).toBeDefined();
    expect(screen.getByText("1 / 8 running")).toBeDefined();
  });

  it("shows Focus EnvoyAI when approvals are pending", async () => {
    pendingApprovalCount = 1;
    sessions = [
      {
        sessionId: "s-blocked",
        title: "Agent shell",
        cwd: "/tmp",
        shell: "/bin/bash",
        state: "running",
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        activityBadge: "blocked",
      },
    ];
    renderSidebar();
    expect(await screen.findByRole("button", { name: /Focus EnvoyAI/i })).toBeDefined();
  });
});
