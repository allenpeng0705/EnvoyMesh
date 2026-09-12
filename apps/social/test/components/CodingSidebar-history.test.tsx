/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { NodeConfig } from "@envoymesh/api";
import { CodingSidebar } from "../../src/components/views/CodingSidebar.js";
import { saveCodingProjects } from "../../src/lib/coding-projects.js";
import {
  archiveCodingWorkspace,
  loadCodingArchivedKeys,
} from "../../src/lib/coding-archive.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const listEnvoyHarnessChats = vi.fn();
const createEnvoyHarnessChat = vi.fn();
const removeEnvoyHarnessChat = vi.fn();
const listHomeFsEntries = vi.fn();
const on = vi.fn(() => () => {});

const nodeServiceMock = {
  listEnvoyHarnessChats,
  createEnvoyHarnessChat,
  removeEnvoyHarnessChat,
  listHomeFsEntries,
  openEnvoyHarnessFile: vi.fn(),
  setEnvoyHarnessProjectPath: vi.fn(),
  ensurePiTerminalSession: vi.fn(),
  closeTerminalSession: vi.fn(),
  probeExtAgent: vi.fn().mockResolvedValue({
    installState: "installed",
    reachable: true,
  }),
  isConnected: true,
  on,
};

let mockNodeConfig: Partial<NodeConfig> = {
  callerIsOwnerProfile: true,
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => nodeServiceMock,
  useTerminalSessions: () => ({
    sessions: [],
    refresh: vi.fn(),
  }),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    bonds: [],
    nodeConfig: mockNodeConfig,
    humanProfile: { displayName: "Me", ownerId: "envoy:owner:me" },
  }),
}));

vi.mock("../../src/hooks/useToast.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/hooks/useToast.js")>();
  return {
    ...actual,
    useToastOptional: () => ({ showToast: vi.fn() }),
  };
});

vi.mock("../../src/components/CodingNewSessionSheet.js", () => ({
  CodingNewSessionSheet: () => null,
}));
vi.mock("../../src/components/CodingProjectPickerModal.js", () => ({
  CodingProjectPickerModal: () => null,
}));
vi.mock("../../src/components/CodingInviteReviewModal.js", () => ({
  CodingInviteReviewModal: () => null,
}));
vi.mock("../../src/components/ExtAgentSwitcherInstallDialog.js", () => ({
  ExtAgentSwitcherInstallDialog: () => null,
}));
vi.mock("../../src/components/CodingCommandPalette.js", () => ({
  CodingCommandPalette: () => null,
}));

describe("CodingSidebar history filters", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockNodeConfig = { callerIsOwnerProfile: true };
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 30 * 86400000).toISOString();
    listEnvoyHarnessChats.mockResolvedValue([
      {
        id: "needs-1",
        title: "Needs input task",
        cwd: "/repo",
        lastUsedAt: now,
        uiBucket: "needs_input",
      },
      {
        id: "old-1",
        title: "Old done task",
        cwd: "/repo",
        lastUsedAt: old,
        uiBucket: "done",
      },
    ]);
    listHomeFsEntries.mockResolvedValue({ path: "/repo", entries: [] });
    saveCodingProjects([{ path: "/repo", label: "repo", addedAt: now }]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("filters Needs you and Recent", async () => {
    renderWithI18n(
      <CodingSidebar selected={null} onSelect={vi.fn()} hotkeysEnabled />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("coding-workspace-needs-1")).toBeTruthy();
    });
    expect(screen.getByTestId("coding-workspace-old-1")).toBeTruthy();

    fireEvent.click(screen.getByTestId("coding-history-filter-needs_you"));
    await waitFor(() => {
      expect(screen.getByTestId("coding-workspace-needs-1")).toBeTruthy();
    });
    expect(screen.queryByTestId("coding-workspace-old-1")).toBeNull();

    fireEvent.click(screen.getByTestId("coding-history-filter-recent"));
    await waitFor(() => {
      expect(screen.getByTestId("coding-workspace-needs-1")).toBeTruthy();
    });
    expect(screen.queryByTestId("coding-workspace-old-1")).toBeNull();
  });

  it("hides archived from All until Archived filter", async () => {
    archiveCodingWorkspace("eh:needs-1");
    expect(loadCodingArchivedKeys().has("eh:needs-1")).toBe(true);

    renderWithI18n(<CodingSidebar selected={null} onSelect={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("coding-workspace-old-1")).toBeTruthy();
    });
    expect(screen.queryByTestId("coding-workspace-needs-1")).toBeNull();

    fireEvent.click(screen.getByTestId("coding-history-filter-archived"));
    await waitFor(() => {
      expect(screen.getByTestId("coding-workspace-needs-1")).toBeTruthy();
    });
  });
});
