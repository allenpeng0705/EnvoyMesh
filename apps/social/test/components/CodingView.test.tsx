/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { NodeConfig } from "@envoymesh/api";
import { CodingView } from "../../src/components/views/CodingView.js";
import { saveCodingProjects } from "../../src/lib/coding-projects.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const listEnvoyHarnessChats = vi.fn();
const createEnvoyHarnessChat = vi.fn();
const createCodingReviewInvite = vi.fn();
const sendChat = vi.fn();
const removeEnvoyHarnessChat = vi.fn();
const setEnvoyHarnessProjectPath = vi.fn();
const ensurePiTerminalSession = vi.fn();
const refreshTerminalSessions = vi.fn();

let mockNodeConfig: Partial<NodeConfig> = {
  callerIsOwnerProfile: true,
  contactAiPreferences: [],
};

let mockBonds: Array<{
  peerOwnerId: string;
  displayName?: string;
  level: string;
  createdAt: string;
}> = [];

let mockTerminalSessions: Array<{
  sessionId: string;
  title: string;
  cwd: string;
  shell: string;
  state: "running" | "exited";
  createdAt: string;
  lastActivityAt: string;
  role?: string;
}> = [];

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    listEnvoyHarnessChats,
    createEnvoyHarnessChat,
    createCodingReviewInvite,
    sendChat,
    listCodingHeartbeats: vi.fn().mockResolvedValue([]),
    listCodingSchedules: vi.fn().mockResolvedValue([]),
    createCodingHeartbeat: vi.fn(),
    updateCodingHeartbeat: vi.fn(),
    deleteCodingHeartbeat: vi.fn(),
    runCodingHeartbeatNow: vi.fn(),
    removeEnvoyHarnessChat,
    setEnvoyHarnessProjectPath,
    ensurePiTerminalSession,
    closeTerminalSession: vi.fn().mockResolvedValue(undefined),
    probeExtAgent: vi.fn().mockResolvedValue({
      agentId: "codex",
      agentName: "Codex",
      builtIn: false,
      reachable: true,
      hint: "",
      checkedAt: new Date().toISOString(),
      installState: "installed",
    }),
    askExtAgent: vi.fn().mockResolvedValue("ok"),
    setExtAgentProjectPath: vi.fn().mockResolvedValue({}),
    listHomeFsEntries: vi.fn().mockResolvedValue({ path: "/", entries: [] }),
    openEnvoyHarnessFile: vi.fn().mockResolvedValue(undefined),
    isConnected: true,
    on: vi.fn(() => () => {}),
    openEnvoyHarnessChat: vi.fn().mockResolvedValue({ turns: [], messages: [] }),
    getEnvoyHarnessStatus: vi.fn().mockResolvedValue(null),
  }),
  useTerminalSessions: () => ({
    sessions: mockTerminalSessions,
    refresh: refreshTerminalSessions,
  }),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    bonds: mockBonds,
    bridgeStatus: null,
    nodeConfig: mockNodeConfig,
    humanProfile: { displayName: "Me", ownerId: "envoy:owner:me", hobbies: [], knowledge: [] },
    refreshNodeConfig: vi.fn(),
  }),
}));

vi.mock("../../src/components/views/EnvoyHarnessPanel.js", () => ({
  EnvoyHarnessPanel: ({
    chatId,
    readOnlyReview,
    onTouchedFilesChange,
  }: {
    chatId?: string | null;
    readOnlyReview?: boolean;
    onTouchedFilesChange?: (files: readonly string[]) => void;
  }) => {
    React.useEffect(() => {
      onTouchedFilesChange?.([]);
    }, [onTouchedFilesChange]);
    return (
      <div data-testid="eh-panel-stub">
        panel:{chatId ?? "null"}
        {readOnlyReview ? <span data-testid="eh-review-only-flag">review</span> : null}
      </div>
    );
  },
}));

vi.mock("../../src/components/views/PiCodingPanel.js", () => ({
  PiCodingPanel: ({
    sessionId,
    onBusyChange,
  }: {
    sessionId: string;
    onBusyChange?: (busy: boolean) => void;
  }) => {
    React.useEffect(() => {
      onBusyChange?.(false);
    }, [onBusyChange]);
    return <div data-testid="pi-coding-panel">pi:{sessionId}</div>;
  },
}));

vi.mock("../../src/components/views/ExtAgentCodingPanel.js", () => ({
  ExtAgentCodingPanel: ({
    harness,
    sessionId,
    onStatusChange,
  }: {
    harness: string;
    sessionId: string;
    onStatusChange?: (status: string | null) => void;
  }) => {
    React.useEffect(() => {
      onStatusChange?.("ready");
    }, [onStatusChange]);
    return (
      <div data-testid="ext-agent-coding-panel">
        ext:{harness}:{sessionId}
      </div>
    );
  },
}));

vi.mock("../../src/components/HomeFolderPicker.js", () => ({
  HomeFolderPicker: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange: (path: string | undefined) => void;
  }) => (
    <input
      data-testid="home-folder-picker"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  ),
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  listEnvoyHarnessChats.mockResolvedValue([]);
  createEnvoyHarnessChat.mockResolvedValue({
    id: "chat-new",
    cwd: "/projects/app",
    title: "app",
    lastUsedAt: new Date().toISOString(),
  });
  createCodingReviewInvite.mockResolvedValue({
    reviewRef: {
      kind: "eh-workspace-review",
      v: 1,
      ownerId: "envoy:owner:me",
      chatId: "chat-1",
    },
    messageText: "invite body",
  });
  sendChat.mockResolvedValue(undefined);
  removeEnvoyHarnessChat.mockResolvedValue({ removed: true });
  ensurePiTerminalSession.mockResolvedValue({
    ok: true,
    session: {
      sessionId: "pi-sess-1",
      title: "Pi · app",
      cwd: "/projects/app",
      shell: "node",
      state: "running",
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      role: "pi",
    },
  });
  refreshTerminalSessions.mockResolvedValue(undefined);
  mockTerminalSessions = [];
  mockBonds = [
    {
      peerOwnerId: "envoy:owner:friend",
      displayName: "Friend",
      level: "direct",
      createdAt: new Date().toISOString(),
    },
  ];
  mockNodeConfig = {
    callerIsOwnerProfile: true,
    contactAiPreferences: [],
    envoyHarnessCwd: "/projects/default",
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CodingView — Project → Workspace → Chat", () => {
  it("shows home empty + single footer Add project (no global New workspace)", async () => {
    const onOpenCodingSettings = vi.fn();
    renderWithI18n(
      <CodingView active onOpenCodingSettings={onOpenCodingSettings} />,
    );
    expect(await screen.findByTestId("coding-home")).toBeDefined();
    expect(screen.getByTestId("coding-home-add-project")).toBeDefined();
    expect(screen.getByTestId("coding-add-project")).toBeDefined();
    expect(screen.queryByTestId("coding-new-session-cta")).toBeNull();
    expect(screen.queryByTestId("coding-add-project-cta")).toBeNull();
    expect(screen.queryByText("Projects")).toBeNull();
    expect(screen.getByTestId("coding-settings")).toBeDefined();
    expect(screen.getByTestId("coding-sidebar-empty")).toBeDefined();
    fireEvent.click(screen.getByTestId("coding-settings"));
    expect(onOpenCodingSettings).toHaveBeenCalled();
  });

  it("Add project from home registers folder then opens New workspace", async () => {
    renderWithI18n(<CodingView active onOpenCodingSettings={() => {}} />);
    fireEvent.click(await screen.findByTestId("coding-home-add-project"));
    expect(await screen.findByTestId("coding-add-project-confirm")).toBeDefined();
    fireEvent.change(screen.getByTestId("home-folder-picker"), {
      target: { value: "/projects/app" },
    });
    fireEvent.click(screen.getByTestId("coding-add-project-confirm"));
    expect(createEnvoyHarnessChat).not.toHaveBeenCalled();
    expect(await screen.findByTestId("coding-new-session-sheet")).toBeDefined();
    expect(screen.getByTestId("coding-new-workspace-project")).toBeDefined();
    expect(
      (screen.getByTestId("coding-new-workspace-project") as HTMLSelectElement)
        .value,
    ).toBe("/projects/app");
  });

  it("New workspace is per-project (+) and picks project + harness", async () => {
    saveCodingProjects([
      {
        path: "/projects/app",
        label: "app",
        addedAt: new Date().toISOString(),
      },
    ]);
    renderWithI18n(<CodingView active onOpenCodingSettings={() => {}} />);
    expect(await screen.findByTestId("coding-project-group-app")).toBeDefined();
    fireEvent.click(screen.getByTestId("coding-project-new-workspace-app"));
    expect(await screen.findByTestId("coding-new-session-sheet")).toBeDefined();
    expect(screen.queryByTestId("home-folder-picker")).toBeNull();
    expect(screen.getByTestId("coding-new-workspace-project")).toBeDefined();

    fireEvent.click(screen.getByTestId("coding-new-session-confirm"));

    await waitFor(() => {
      expect(createEnvoyHarnessChat).toHaveBeenCalledWith({
        cwd: "/projects/app",
      });
    });
    expect(await screen.findByTestId("coding-workspace-shell")).toBeDefined();
    expect(screen.getByTestId("coding-workspace-tab-chat")).toBeDefined();
    expect(await screen.findByTestId("eh-panel-stub")).toBeDefined();
  });

  it("toggles Changes overlay over the workspace", async () => {
    listEnvoyHarnessChats.mockResolvedValue([
      {
        id: "chat-1",
        cwd: "/projects/app",
        title: "app-a",
        lastUsedAt: new Date().toISOString(),
        messageCount: 1,
      },
    ]);
    renderWithI18n(<CodingView active onOpenCodingSettings={() => {}} />);
    fireEvent.click(await screen.findByTestId("coding-workspace-chat-1"));
    expect(await screen.findByTestId("coding-workspace-shell")).toBeDefined();
    expect(screen.queryByTestId("coding-context-rail")).toBeNull();
    fireEvent.click(screen.getByTestId("coding-changes-toggle"));
    expect(await screen.findByTestId("coding-context-rail")).toBeDefined();
    fireEvent.click(screen.getByTestId("coding-workspace-tab-shell"));
    expect(await screen.findByTestId("coding-shell-empty")).toBeDefined();
    fireEvent.click(screen.getByTestId("coding-changes-close"));
    expect(screen.queryByTestId("coding-context-rail")).toBeNull();
  });

  it("creates a Pi workspace with Chat timeline panel (no Shell TUI)", async () => {
    saveCodingProjects([
      {
        path: "/projects/app",
        label: "app",
        addedAt: new Date().toISOString(),
      },
    ]);
    renderWithI18n(<CodingView active onOpenCodingSettings={() => {}} />);
    fireEvent.click(await screen.findByTestId("coding-project-new-workspace-app"));
    await screen.findByTestId("coding-new-session-sheet");
    fireEvent.click(screen.getByTestId("coding-harness-pi"));
    fireEvent.click(screen.getByTestId("coding-new-session-confirm"));

    await waitFor(() => {
      expect(ensurePiTerminalSession).toHaveBeenCalledWith({
        projectPath: "/projects/app",
        forceRestart: false,
      });
    });
    expect(await screen.findByTestId("coding-workspace-shell")).toBeDefined();
    expect(await screen.findByTestId("pi-coding-panel")).toBeDefined();
    expect(screen.queryByTestId("coding-workspace-tab-shell")).toBeNull();
    expect(screen.queryByTestId("coding-pi-shell")).toBeNull();
    expect(screen.queryByTestId("coding-pi-tui")).toBeNull();
  });

  it("lists Pi workspaces from terminal list", async () => {
    mockTerminalSessions = [
      {
        sessionId: "pi-1",
        title: "Pi · lib",
        cwd: "/other/lib",
        shell: "node",
        state: "running",
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        role: "pi",
      },
    ];
    renderWithI18n(<CodingView active onOpenCodingSettings={() => {}} />);
    expect(await screen.findByTestId("coding-workspace-pi-pi-1")).toBeDefined();
    fireEvent.click(screen.getByTestId("coding-workspace-pi-pi-1"));
    expect(await screen.findByTestId("coding-workspace-shell")).toBeDefined();
    expect(screen.getByTestId("pi-coding-panel")).toBeDefined();
    expect(screen.getByText("pi:pi-1")).toBeDefined();
  });

  it("groups EH workspaces by project cwd and shows empty registered projects", async () => {
    saveCodingProjects([
      {
        path: "/projects/empty-only",
        label: "empty-only",
        addedAt: new Date().toISOString(),
      },
    ]);
    listEnvoyHarnessChats.mockResolvedValue([
      {
        id: "chat-1",
        cwd: "/projects/app",
        title: "app-a",
        lastUsedAt: new Date().toISOString(),
        messageCount: 1,
      },
      {
        id: "chat-2",
        cwd: "/projects/app",
        title: "app-b",
        lastUsedAt: new Date().toISOString(),
        messageCount: 0,
      },
      {
        id: "chat-3",
        cwd: "/other/lib",
        title: "lib",
        lastUsedAt: new Date().toISOString(),
      },
    ]);
    renderWithI18n(<CodingView active onOpenCodingSettings={() => {}} />);
    expect(await screen.findByTestId("coding-project-group-app")).toBeDefined();
    expect(screen.getByTestId("coding-project-group-lib")).toBeDefined();
    expect(screen.getByTestId("coding-project-group-empty-only")).toBeDefined();
    expect(
      screen.getByTestId("coding-project-new-workspace-empty-only"),
    ).toBeDefined();
    expect(screen.getByTestId("coding-workspace-chat-1")).toBeDefined();
    expect(screen.getByTestId("coding-workspace-chat-3")).toBeDefined();
    expect(
      screen.getAllByText("Add workspace").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("removes a coding workspace from Coding UI after confirm", async () => {
    listEnvoyHarnessChats.mockResolvedValue([
      {
        id: "chat-1",
        cwd: "/projects/app",
        title: "app",
        lastUsedAt: new Date().toISOString(),
        messageCount: 2,
      },
    ]);
    renderWithI18n(<CodingView active onOpenCodingSettings={() => {}} />);
    await screen.findByTestId("coding-workspace-chat-1");
    fireEvent.click(screen.getByTestId("eh-chat-row-menu-btn-chat-1"));
    fireEvent.click(screen.getByTestId("eh-chat-row-menu-remove-chat-1"));
    // Menu defers opening confirm to the next macrotask (click-through guard).
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeDefined();
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove" }),
    );
    await waitFor(() => {
      expect(removeEnvoyHarnessChat).toHaveBeenCalledWith("chat-1");
    });
  });

  it("removes a project from Coding UI without calling disk delete", async () => {
    saveCodingProjects([
      {
        path: "/projects/app",
        label: "app",
        addedAt: new Date().toISOString(),
      },
    ]);
    listEnvoyHarnessChats.mockResolvedValue([
      {
        id: "chat-1",
        cwd: "/projects/app",
        title: "fix-login",
        lastUsedAt: new Date().toISOString(),
      },
    ]);
    removeEnvoyHarnessChat.mockImplementation(async () => {
      listEnvoyHarnessChats.mockResolvedValue([]);
      return { removed: true };
    });
    renderWithI18n(<CodingView active onOpenCodingSettings={() => {}} />);
    await screen.findByTestId("coding-project-group-app");
    fireEvent.click(screen.getByTestId("coding-project-menu-app-btn"));
    fireEvent.click(screen.getByTestId("coding-project-menu-app-remove"));
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeDefined();
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove" }),
    );
    await waitFor(() => {
      expect(removeEnvoyHarnessChat).toHaveBeenCalledWith("chat-1");
    });
    await waitFor(() => {
      expect(screen.queryByTestId("coding-project-group-app")).toBeNull();
    });
  });

  it("offers Invite peer to review and sends chat invite", async () => {
    listEnvoyHarnessChats.mockResolvedValue([
      {
        id: "chat-1",
        cwd: "/projects/app",
        title: "app",
        lastUsedAt: new Date().toISOString(),
        messageCount: 2,
      },
    ]);
    renderWithI18n(<CodingView active onOpenCodingSettings={() => {}} />);
    await screen.findByTestId("coding-workspace-chat-1");
    fireEvent.click(screen.getByTestId("eh-chat-row-menu-btn-chat-1"));
    fireEvent.click(screen.getByTestId("eh-chat-row-menu-invite-chat-1"));
    expect(await screen.findByTestId("coding-invite-review-modal")).toBeDefined();
    fireEvent.click(
      screen.getByTestId("coding-invite-peer-envoy:owner:friend"),
    );
    fireEvent.click(screen.getByTestId("coding-invite-review-confirm"));
    await waitFor(() => {
      expect(createCodingReviewInvite).toHaveBeenCalledWith({
        chatId: "chat-1",
        peerOwnerId: "envoy:owner:friend",
      });
      expect(sendChat).toHaveBeenCalledWith(
        "envoy:owner:friend",
        "invite body",
      );
    });
  });

  it("opens EH workspace in review-only mode from openCoding", async () => {
    const { openCoding } = await import("../../src/lib/open-coding-nav.js");
    listEnvoyHarnessChats.mockResolvedValue([
      {
        id: "chat-1",
        cwd: "/projects/app",
        title: "app",
        lastUsedAt: new Date().toISOString(),
      },
    ]);
    renderWithI18n(<CodingView active onOpenCodingSettings={() => {}} />);
    openCoding({ chatId: "chat-1", reviewOnly: true });
    expect(await screen.findByTestId("eh-panel-stub")).toBeDefined();
    expect(screen.getByTestId("eh-review-only-flag")).toBeDefined();
    expect(screen.getByTestId("coding-workspace-status").textContent).toMatch(
      /Review only/i,
    );
  });

  it("shows EH status chip + header from uiBucket (not Idle-only)", async () => {
    listEnvoyHarnessChats.mockResolvedValue([
      {
        id: "chat-run",
        cwd: "/projects/app",
        title: "runner",
        lastUsedAt: new Date().toISOString(),
        uiBucket: "running",
        agentState: "thinking",
      },
    ]);
    renderWithI18n(<CodingView active onOpenCodingSettings={() => {}} />);
    expect(await screen.findByTestId("coding-status-chip-chat-run")).toBeDefined();
    expect(screen.getByTestId("coding-status-chip-chat-run").textContent).toMatch(
      /Running/i,
    );
    fireEvent.click(screen.getByTestId("coding-workspace-chat-run"));
    expect(await screen.findByTestId("coding-workspace-status")).toBeDefined();
    await waitFor(() => {
      expect(screen.getByTestId("coding-workspace-status").textContent).toMatch(
        /Running/i,
      );
    });
  });
});
