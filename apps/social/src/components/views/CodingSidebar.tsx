import { useEffect, useMemo, useState } from "react";
import {
  MAX_ENVOY_HARNESS_CHATS,
  CODING_ALL_HARNESSES,
  codingHarnessLabel,
  codingHarnessToExtAgentId,
  familyProfileMayUseCoding,
  isCodingTierBHarness,
  type CodingHarnessId,
  type CodingHeartbeatTarget,
  type EhChatWorkspaceSummary,
  type ExtAgentInstallGuide,
  type InstallState,
  type TerminalSessionSummary,
} from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import {
  useNodeService,
  useTerminalSessions,
} from "../../hooks/useNodeService.js";
import {
  archiveCodingWorkspace,
  CODING_ARCHIVED_CHANGED_EVENT,
  loadCodingArchivedKeys,
  unarchiveCodingWorkspace,
} from "../../lib/coding-archive.js";
import {
  codingHistoryArchiveKey,
  codingRowMatchesFilter,
  loadCodingHistoryFilter,
  loadCodingHistoryFlatMode,
  saveCodingHistoryFilter,
  saveCodingHistoryFlatMode,
  type CodingHistoryFilter,
  type CodingHistoryRowMeta,
} from "../../lib/coding-history.js";
import {
  buildCodingPaletteItems,
  paletteHarnessLabel,
  type CodingPaletteItem,
  type CodingPaletteWorkspaceInput,
} from "../../lib/coding-palette-items.js";
import {
  addCodingProject,
  codingModelToEhHostModel,
  codingProjectLabel,
  ensureCodingProjectsFromCwds,
  getCodingProject,
  loadCodingDefaults,
  loadCodingProjects,
  modelProvidersToCodingSpec,
  normalizeCodingModelSpec,
  normalizeCodingProjectPath,
  normalizeCodingProviderKind,
  removeCodingProject,
  resolveCodingWorkspacePrefill,
  saveCodingDefaults,
  saveCodingLastUsedPrefill,
  seedCodingProjectDefaultsIfEmpty,
  updateCodingProject,
  CODING_DEFAULTS_CHANGED_EVENT,
  CODING_PROJECTS_CHANGED_EVENT,
  type CodingDefaults,
  type CodingProject,
  type CodingProviderKind,
  type CodingWorkspacePrefill,
} from "../../lib/coding-projects.js";
import {
  createCodingExtSession,
  loadCodingExtSessions,
  removeCodingExtSession,
  CODING_EXT_SESSIONS_CHANGED_EVENT,
  type CodingExtSession,
} from "../../lib/coding-sessions.js";
import {
  sameCodingSession,
  type CodingSessionRef,
} from "../../lib/coding-session-ref.js";
import {
  codingExtStatusLabel,
  codingExtStatusShowsChip,
  codingUiBucketDotClass,
  codingUiBucketLabel,
  codingUiBucketShowsChip,
  type ExtProbeStatus,
} from "../../lib/coding-status-label.js";
import { AddIcon, SearchIcon, SettingsIcon } from "../../icons.js";
import { CodingDefaultsModal } from "../CodingDefaultsModal.js";
import {
  CodingNewSessionSheet,
  type HarnessProbeBadge,
} from "../CodingNewSessionSheet.js";
import { CodingCommandPalette } from "../CodingCommandPalette.js";
import { CodingHistoryFilters } from "../CodingHistoryFilters.js";
import { CodingProjectPickerModal } from "../CodingProjectPickerModal.js";
import { CodingProjectSettingsModal } from "../CodingProjectSettingsModal.js";
import { CodingSidebarMenu } from "../CodingSidebarMenu.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { CodingInviteReviewModal } from "../CodingInviteReviewModal.js";
import { CodingHeartbeatModal } from "../CodingHeartbeatModal.js";
import { CodingHeartbeatsPanel } from "../CodingHeartbeatsPanel.js";
import { CodingScheduleModal } from "../CodingScheduleModal.js";
import { CodingSchedulesPanel } from "../CodingSchedulesPanel.js";
import { EhChatRowMenu } from "../EhChatRowMenu.js";
import { ExtAgentSwitcherInstallDialog } from "../ExtAgentSwitcherInstallDialog.js";
import { useToastOptional } from "../../hooks/useToast.js";
import { openChatWithPeer } from "../../lib/open-chat-nav.js";

export type CodingSidebarProps = {
  selected: CodingSessionRef | null;
  onSelect: (ref: CodingSessionRef | null) => void;
  /** When bumped, open Coding defaults. */
  openDefaultsRequest?: number;
  /** When bumped, open the New workspace sheet (deep link; needs a project). */
  openCreateRequest?: number;
  /** When bumped, open Add project (home empty / deep link). */
  openAddProjectRequest?: number;
  /** Live Ext busy session id (from ExtAgentCodingPanel). */
  extBusySessionId?: string | null;
  /** Live Pi busy session id (from PiCodingPanel). */
  piBusySessionId?: string | null;
  /** When true, Cmd/Ctrl+K opens the Coding command palette. */
  hotkeysEnabled?: boolean;
};

function formatRelativeShort(iso: string, nowMs = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

type ListRow =
  | {
      kind: "eh";
      chat: EhChatWorkspaceSummary;
      cwd: string;
      title: string;
      lastUsedAt: string;
    }
  | {
      kind: "pi";
      session: TerminalSessionSummary;
      cwd: string;
      title: string;
      lastUsedAt: string;
    }
  | {
      kind: "ext";
      session: CodingExtSession;
      cwd: string;
      title: string;
      lastUsedAt: string;
    };

type ProjectGroup = {
  cwd: string;
  label: string;
  rows: ListRow[];
};

function harnessFromListRow(row: ListRow): CodingHarnessId {
  if (row.kind === "eh") return "envoy-harness";
  if (row.kind === "pi") return "pi";
  return row.session.harness;
}

/**
 * Left pane of Coding — Projects contain Workspaces (Paseo IA).
 * Add project = register folder only; New workspace = pick project + harness.
 */
export function CodingSidebar({
  selected,
  onSelect,
  openDefaultsRequest = 0,
  openCreateRequest = 0,
  openAddProjectRequest = 0,
  extBusySessionId = null,
  piBusySessionId = null,
  hotkeysEnabled = false,
}: CodingSidebarProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig, bonds } = useNodeState();
  const { showToast } = useToastOptional();
  const { sessions: terminalSessions, refresh: refreshTerminalSessions } =
    useTerminalSessions();

  const [ehChats, setEhChats] = useState<EhChatWorkspaceSummary[]>([]);
  const [projects, setProjects] = useState<CodingProject[]>(() =>
    loadCodingProjects(),
  );
  const [workspaceSheetOpen, setWorkspaceSheetOpen] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [addProjectPath, setAddProjectPath] = useState("");
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [sheetInitialProject, setSheetInitialProject] = useState("");
  const [sheetInitialPrefill, setSheetInitialPrefill] =
    useState<CodingWorkspacePrefill>(() => resolveCodingWorkspacePrefill({}));
  const [codingDefaults, setCodingDefaults] = useState<CodingDefaults>(() =>
    loadCodingDefaults(),
  );
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [defaultsBusy, setDefaultsBusy] = useState(false);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);
  const [projectSettingsTarget, setProjectSettingsTarget] =
    useState<CodingProject | null>(null);
  const [projectSettingsBusy, setProjectSettingsBusy] = useState(false);
  const [projectSettingsError, setProjectSettingsError] = useState<
    string | null
  >(null);
  const [revealBusyPath, setRevealBusyPath] = useState<string | null>(null);
  const [deleteEhChatTarget, setDeleteEhChatTarget] =
    useState<EhChatWorkspaceSummary | null>(null);
  const [inviteReviewTarget, setInviteReviewTarget] =
    useState<EhChatWorkspaceSummary | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [heartbeatTarget, setHeartbeatTarget] = useState<{
    title: string;
    target: CodingHeartbeatTarget;
  } | null>(null);
  const [heartbeatBusy, setHeartbeatBusy] = useState(false);
  const [heartbeatError, setHeartbeatError] = useState<string | null>(null);
  const [heartbeatsPanelOpen, setHeartbeatsPanelOpen] = useState(false);
  const [schedulesPanelOpen, setSchedulesPanelOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [deletePiSession, setDeletePiSession] =
    useState<TerminalSessionSummary | null>(null);
  const [deleteExtSession, setDeleteExtSession] =
    useState<CodingExtSession | null>(null);
  const [extSessions, setExtSessions] = useState<CodingExtSession[]>(() =>
    loadCodingExtSessions(),
  );
  const [harnessProbe, setHarnessProbe] = useState<
    Partial<Record<CodingHarnessId, HarnessProbeBadge>>
  >({});
  const [pendingInstall, setPendingInstall] = useState<{
    harness: CodingHarnessId;
    cwd: string;
    model?: string;
    providerKind?: CodingProviderKind;
    endpoint?: string;
    apiKey?: string;
    guide: ExtAgentInstallGuide;
    installState: InstallState;
  } | null>(null);
  const [deleteProjectTarget, setDeleteProjectTarget] =
    useState<ProjectGroup | null>(null);
  const [deletingUi, setDeletingUi] = useState(false);
  const [collapsedCwds, setCollapsedCwds] = useState<Set<string>>(
    () => new Set(),
  );
  const [historyFilter, setHistoryFilter] = useState<CodingHistoryFilter>(() =>
    loadCodingHistoryFilter(),
  );
  const [flatMode, setFlatMode] = useState(() => loadCodingHistoryFlatMode());
  const [archivedKeys, setArchivedKeys] = useState<Set<string>>(() =>
    loadCodingArchivedKeys(),
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteCwdFiles, setPaletteCwdFiles] = useState<
    Array<{ name: string; path: string }>
  >([]);

  const envoymeshAiModelHint = useMemo(
    () => modelProvidersToCodingSpec(nodeConfig?.modelProviders),
    [nodeConfig?.modelProviders],
  );
  const codingDefaultsModelHint = codingDefaults.model.trim();

  const openCodingDefaults = () => {
    setCodingDefaults(loadCodingDefaults());
    setDefaultsError(null);
    setDefaultsOpen(true);
  };

  const mayUseCoding = useMemo(() => {
    if (nodeConfig?.callerIsOwnerProfile) return true;
    const pid = nodeConfig?.callerFamilyProfileId;
    const profile = nodeConfig?.familyProfiles?.find((p) => p.id === pid);
    return familyProfileMayUseCoding(profile ?? null);
  }, [nodeConfig]);

  const piSessions = useMemo(
    () =>
      terminalSessions.filter((s) => s.role === "pi" && s.state === "running"),
    [terminalSessions],
  );

  const refreshEhChats = async () => {
    if (!nodeService.isConnected || !nodeService.listEnvoyHarnessChats) return;
    try {
      const list = await nodeService.listEnvoyHarnessChats();
      setEhChats((prev) => {
        if (
          prev.length === list.length &&
          prev.every((c, i) => {
            const n = list[i];
            return (
              c.id === n.id &&
              c.title === n.title &&
              c.cwd === n.cwd &&
              c.lastUsedAt === n.lastUsedAt &&
              c.uiBucket === n.uiBucket
            );
          })
        ) {
          return prev;
        }
        return list;
      });
      setSheetError(null);
    } catch (e: unknown) {
      setSheetError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (!nodeService.isConnected) return;
    void refreshEhChats();
    const unsubTurn = nodeService.on("eh:turn_complete", () => {
      void refreshEhChats();
    });
    const unsubStarted = nodeService.on("eh:turn_started", () => {
      // Title may update from the first prompt before the turn finishes.
      void refreshEhChats();
    });
    const unsubConfig = nodeService.on("home:config-updated", () => {
      void refreshEhChats();
    });
    return () => {
      unsubTurn();
      unsubStarted();
      unsubConfig();
    };
  }, [nodeService, nodeService.isConnected]);

  // Keep workspace shell title/cwd/status in sync when the EH list refreshes.
  useEffect(() => {
    if (selected?.kind !== "eh") return;
    const chat = ehChats.find((c) => c.id === selected.chatId);
    if (!chat) return;
    const nextTitle = chat.title;
    const nextCwd = chat.cwd;
    const nextBucket = chat.uiBucket;
    if (
      nextTitle === selected.title &&
      nextCwd === selected.cwd &&
      nextBucket === selected.uiBucket
    ) {
      return;
    }
    onSelect({
      kind: "eh",
      chatId: chat.id,
      title: nextTitle,
      cwd: nextCwd,
      uiBucket: nextBucket,
    });
  }, [ehChats, selected, onSelect]);

  // Keep shell title in sync when Ext session title updates (first prompt).
  useEffect(() => {
    if (selected?.kind !== "ext") return;
    const session = extSessions.find((s) => s.id === selected.sessionId);
    if (!session) return;
    if (
      session.title === selected.title &&
      session.cwd === selected.cwd &&
      session.harness === selected.harness
    ) {
      return;
    }
    onSelect({
      kind: "ext",
      sessionId: session.id,
      harness: session.harness,
      cwd: session.cwd,
      title: session.title,
    });
  }, [extSessions, selected, onSelect]);

  // Seed / sync project registry from live workspace cwds.
  useEffect(() => {
    const cwds = [
      ...ehChats.map((c) => c.cwd || ""),
      ...piSessions.map((s) => s.cwd || ""),
      ...extSessions.map((s) => s.cwd || ""),
    ];
    const next = ensureCodingProjectsFromCwds(cwds);
    setProjects((prev) => {
      if (
        prev.length === next.length &&
        prev.every(
          (p, i) =>
            p.path === next[i]?.path &&
            p.label === next[i]?.label &&
            p.defaultHarness === next[i]?.defaultHarness &&
            p.defaultModel === next[i]?.defaultModel,
        )
      ) {
        return prev;
      }
      return next;
    });
  }, [ehChats, piSessions, extSessions]);

  useEffect(() => {
    const tick = () => setProjects(loadCodingProjects());
    window.addEventListener(CODING_PROJECTS_CHANGED_EVENT, tick);
    return () =>
      window.removeEventListener(CODING_PROJECTS_CHANGED_EVENT, tick);
  }, []);

  useEffect(() => {
    const tick = () => setCodingDefaults(loadCodingDefaults());
    window.addEventListener(CODING_DEFAULTS_CHANGED_EVENT, tick);
    return () =>
      window.removeEventListener(CODING_DEFAULTS_CHANGED_EVENT, tick);
  }, []);

  useEffect(() => {
    const tick = () => setExtSessions(loadCodingExtSessions());
    tick();
    window.addEventListener(CODING_EXT_SESSIONS_CHANGED_EVENT, tick);
    return () =>
      window.removeEventListener(CODING_EXT_SESSIONS_CHANGED_EVENT, tick);
  }, []);

  // Probe Tier B harnesses when the create sheet opens.
  useEffect(() => {
    if (!workspaceSheetOpen || !nodeService.isConnected) return;
    let cancelled = false;
    const tierB = CODING_ALL_HARNESSES.filter((h) => isCodingTierBHarness(h));
    setHarnessProbe((prev) => {
      const next = { ...prev };
      for (const h of tierB) next[h] = "checking";
      return next;
    });
    void (async () => {
      const next: Partial<Record<CodingHarnessId, HarnessProbeBadge>> = {};
      await Promise.all(
        tierB.map(async (h) => {
          const agentId = codingHarnessToExtAgentId(h);
          if (!agentId) {
            next[h] = "unknown";
            return;
          }
          try {
            const r = await nodeService.probeExtAgent({ agentId });
            if (r.installState === "installed" && r.reachable) {
              next[h] = "ready";
            } else if (r.installState === "not-installed") {
              next[h] = "install";
            } else if (r.installState === "installed") {
              next[h] = "ready";
            } else {
              next[h] = "unknown";
            }
          } catch {
            next[h] = "unknown";
          }
        }),
      );
      if (!cancelled) setHarnessProbe((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally omit nodeService object identity — only sheet open + connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSheetOpen, nodeService.isConnected]);

  // Probe harnesses that already have Ext sessions (sidebar Ready/Install chips).
  useEffect(() => {
    if (!nodeService.isConnected || extSessions.length === 0) return;
    let cancelled = false;
    const harnesses = [
      ...new Set(extSessions.map((s) => s.harness)),
    ].filter(isCodingTierBHarness);
    void (async () => {
      const next: Partial<Record<CodingHarnessId, HarnessProbeBadge>> = {};
      await Promise.all(
        harnesses.map(async (h) => {
          const agentId = codingHarnessToExtAgentId(h);
          if (!agentId) {
            next[h] = "unknown";
            return;
          }
          try {
            const r = await nodeService.probeExtAgent({ agentId });
            if (r.installState === "not-installed") next[h] = "install";
            else if (r.installState === "installed") next[h] = "ready";
            else next[h] = "unknown";
          } catch {
            next[h] = "unknown";
          }
        }),
      );
      if (!cancelled) setHarnessProbe((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally omit nodeService object identity — only sessions + connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extSessions, nodeService.isConnected]);

  useEffect(() => {
    if (openCreateRequest > 0) {
      openNewWorkspace();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open on bump only
  }, [openCreateRequest]);

  useEffect(() => {
    if (openAddProjectRequest > 0) {
      openAddProject();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open on bump only
  }, [openAddProjectRequest]);

  useEffect(() => {
    if (openDefaultsRequest > 0) {
      openCodingDefaults();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open on bump only
  }, [openDefaultsRequest]);

  const projectGroups = useMemo((): ProjectGroup[] => {
    const rows: ListRow[] = [
      ...ehChats.map(
        (chat): ListRow => ({
          kind: "eh",
          chat,
          cwd: normalizeCodingProjectPath(chat.cwd || ""),
          title: chat.title,
          lastUsedAt: chat.lastUsedAt,
        }),
      ),
      ...piSessions.map(
        (session): ListRow => ({
          kind: "pi",
          session,
          cwd: normalizeCodingProjectPath(session.cwd || ""),
          title: session.title,
          lastUsedAt: session.lastActivityAt || session.createdAt,
        }),
      ),
      ...extSessions.map(
        (session): ListRow => ({
          kind: "ext",
          session,
          cwd: normalizeCodingProjectPath(session.cwd || ""),
          title: session.title || codingHarnessLabel(session.harness),
          lastUsedAt: session.lastUsedAt || session.createdAt,
        }),
      ),
    ];
    const byCwd = new Map<string, ListRow[]>();
    for (const row of rows) {
      if (!row.cwd) continue;
      const list = byCwd.get(row.cwd) ?? [];
      list.push(row);
      byCwd.set(row.cwd, list);
    }
    const groups: ProjectGroup[] = [];
    const seen = new Set<string>();
    for (const project of projects) {
      const path = project.path;
      seen.add(path);
      const groupRows = byCwd.get(path) ?? [];
      groupRows.sort(
        (a, b) =>
          new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
      );
      groups.push({
        cwd: path,
        label: project.label || codingProjectLabel(path),
        rows: groupRows,
      });
    }
    // Orphan workspace cwds not yet in registry (race before seed effect).
    for (const [cwd, groupRows] of byCwd) {
      if (seen.has(cwd)) continue;
      groupRows.sort(
        (a, b) =>
          new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
      );
      groups.push({ cwd, label: codingProjectLabel(cwd), rows: groupRows });
    }
    groups.sort((a, b) => {
      const aT = a.rows[0] ? Date.parse(a.rows[0].lastUsedAt) : 0;
      const bT = b.rows[0] ? Date.parse(b.rows[0].lastUsedAt) : 0;
      if (bT !== aT) return bT - aT;
      return a.label.localeCompare(b.label);
    });
    return groups;
  }, [ehChats, piSessions, extSessions, projects]);

  const rowMeta = (row: ListRow): CodingHistoryRowMeta => {
    if (row.kind === "eh") {
      return {
        kind: "eh",
        id: row.chat.id,
        lastUsedAt: row.lastUsedAt,
        uiBucket: row.chat.uiBucket,
      };
    }
    if (row.kind === "pi") {
      return {
        kind: "pi",
        id: row.session.sessionId,
        lastUsedAt: row.lastUsedAt,
      };
    }
    return {
      kind: "ext",
      id: row.session.id,
      lastUsedAt: row.lastUsedAt,
      extNeedsInstall: harnessProbe[row.session.harness] === "install",
    };
  };

  const rowPassesFilter = (row: ListRow): boolean =>
    codingRowMatchesFilter(rowMeta(row), historyFilter, archivedKeys);

  const visibleGroups = useMemo((): ProjectGroup[] => {
    return projectGroups
      .map((g) => ({
        ...g,
        rows: g.rows.filter(rowPassesFilter),
      }))
      .filter((g) => {
        // Keep empty projects on "all" so users can still Add workspace.
        if (historyFilter === "all" && !flatMode) return true;
        return g.rows.length > 0;
      });
  }, [projectGroups, historyFilter, archivedKeys, flatMode, harnessProbe]);

  const flatRows = useMemo((): ListRow[] => {
    const rows = projectGroups.flatMap((g) => g.rows).filter(rowPassesFilter);
    rows.sort(
      (a, b) =>
        new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
    );
    return rows;
  }, [projectGroups, historyFilter, archivedKeys, harnessProbe]);

  useEffect(() => {
    const tick = () => setArchivedKeys(loadCodingArchivedKeys());
    tick();
    window.addEventListener(CODING_ARCHIVED_CHANGED_EVENT, tick);
    return () =>
      window.removeEventListener(CODING_ARCHIVED_CHANGED_EVENT, tick);
  }, []);

  const focusedCwd = useMemo(() => {
    if (selected?.kind === "eh" && selected.cwd) {
      return normalizeCodingProjectPath(selected.cwd);
    }
    if (selected?.kind === "ext" && selected.cwd) {
      return normalizeCodingProjectPath(selected.cwd);
    }
    if (selected?.kind === "pi") {
      const s =
        selected.session ??
        piSessions.find((p) => p.sessionId === selected.sessionId);
      if (s?.cwd) return normalizeCodingProjectPath(s.cwd);
    }
    return projects[0]?.path ?? "";
  }, [selected, piSessions, projects]);

  // Cmd/Ctrl+K when Coding view is active.
  useEffect(() => {
    if (!hotkeysEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      setPaletteOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkeysEnabled]);

  // Load top-level cwd files for the palette (listHomeFsEntries — cheap).
  useEffect(() => {
    if (!paletteOpen || !focusedCwd || !nodeService.isConnected) {
      setPaletteCwdFiles((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await nodeService.listHomeFsEntries({
          path: focusedCwd,
          dirsOnly: false,
        });
        if (cancelled) return;
        const files = (result.entries ?? [])
          .filter(
            (e) =>
              e.kind === "file" &&
              e.name &&
              !e.name.startsWith("."),
          )
          .slice(0, 40)
          .map((e) => ({ name: e.name, path: e.path }));
        setPaletteCwdFiles(files);
      } catch {
        if (!cancelled) {
          setPaletteCwdFiles((prev) => (prev.length === 0 ? prev : []));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paletteOpen, focusedCwd, nodeService, nodeService.isConnected]);

  const paletteWorkspaces = useMemo((): CodingPaletteWorkspaceInput[] => {
    const out: CodingPaletteWorkspaceInput[] = [];
    for (const g of projectGroups) {
      for (const row of g.rows) {
        if (row.kind === "eh") {
          out.push({
            kind: "eh",
            id: row.chat.id,
            title: row.title,
            cwd: row.cwd,
            harnessLabel: paletteHarnessLabel("eh"),
            ref: {
              kind: "eh",
              chatId: row.chat.id,
              title: row.title,
              cwd: row.cwd,
              uiBucket: row.chat.uiBucket,
            },
          });
        } else if (row.kind === "pi") {
          out.push({
            kind: "pi",
            id: row.session.sessionId,
            title: row.title,
            cwd: row.cwd,
            harnessLabel: paletteHarnessLabel("pi"),
            ref: {
              kind: "pi",
              sessionId: row.session.sessionId,
              session: row.session,
            },
          });
        } else {
          out.push({
            kind: "ext",
            id: row.session.id,
            title: row.title,
            cwd: row.cwd,
            harnessLabel: paletteHarnessLabel("ext", row.session.harness),
            ref: {
              kind: "ext",
              sessionId: row.session.id,
              harness: row.session.harness,
              cwd: row.session.cwd,
              title: row.title,
            },
          });
        }
      }
    }
    return out;
  }, [projectGroups]);

  const paletteItems = useMemo(
    () =>
      buildCodingPaletteItems({
        projects,
        workspaces: paletteWorkspaces,
        cwdFiles: paletteCwdFiles,
        focusedEhChatId:
          selected?.kind === "eh" ? selected.chatId : null,
        canInvitePeer: selected?.kind === "eh",
        canOpenSettings: true,
        labels: {
          newWorkspace: t("codingView.newSessionCta", "New workspace"),
          addProject: t("codingView.addProjectCta", "Add project"),
          openSettings: t("codingView.settingsFooter", "Coding defaults"),
          invitePeer: t("codingView.inviteReview", "Invite peer to review"),
          newSchedule: t("codingView.scheduleNew", "New schedule"),
        },
      }),
    [
      projects,
      paletteWorkspaces,
      paletteCwdFiles,
      selected,
      t,
    ],
  );

  const openNewWorkspace = (projectPathHint?: string) => {
    if (projects.length === 0) {
      openAddProject();
      return;
    }
    const path = projectPathHint?.trim() || projects[0]?.path || "";
    setSheetInitialProject(path);
    const project = projects.find((p) => p.path === path);
    setSheetInitialPrefill(
      resolveCodingWorkspacePrefill({
        project,
        defaults: loadCodingDefaults(),
      }),
    );
    setSheetError(null);
    setAddProjectOpen(false);
    setWorkspaceSheetOpen(true);
  };

  const revealProjectPath = async (path: string): Promise<void> => {
    const abs = path.trim();
    if (!abs || !nodeService.revealHomeFsPath) {
      showToast(
        t(
          "codingView.projectRevealFailed",
          "Couldn’t open that folder on your computer.",
        ),
        "error",
      );
      return;
    }
    setRevealBusyPath(abs);
    try {
      const result = await nodeService.revealHomeFsPath({ path: abs });
      if (!result.ok) {
        showToast(
          t(
            "codingView.projectRevealFailed",
            "Couldn’t open that folder on your computer.",
          ),
          "error",
        );
      }
    } catch {
      showToast(
        t(
          "codingView.projectRevealFailed",
          "Couldn’t open that folder on your computer.",
        ),
        "error",
      );
    } finally {
      setRevealBusyPath(null);
    }
  };

  const openAddProject = (initialPath?: string) => {
    setAddProjectPath(
      initialPath?.trim() || nodeConfig?.envoyHarnessCwd?.trim() || "",
    );
    setSheetError(null);
    setWorkspaceSheetOpen(false);
    setAddProjectOpen(true);
  };

  const confirmAddProject = () => {
    const path = normalizeCodingProjectPath(addProjectPath);
    if (!path) {
      setSheetError(t("eh.projectPathRequired", "Choose a project folder."));
      return;
    }
    try {
      const project = addCodingProject(path);
      setProjects(loadCodingProjects());
      setAddProjectOpen(false);
      setSheetError(null);
      setSheetInitialProject(project.path);
      setSheetInitialPrefill(
        resolveCodingWorkspacePrefill({
          project,
          defaults: loadCodingDefaults(),
        }),
      );
      setWorkspaceSheetOpen(true);
    } catch (e: unknown) {
      setSheetError(e instanceof Error ? e.message : String(e));
    }
  };

  const submitNewWorkspace = async (opts: {
    harness: CodingHarnessId;
    cwd: string;
    model: string;
    providerKind: CodingProviderKind | "";
    endpoint: string;
    apiKey: string;
  }) => {
    const path = normalizeCodingProjectPath(opts.cwd);
    if (!path) {
      setSheetError(t("codingView.projectRequired", "Choose a project."));
      return;
    }
    addCodingProject(path);
    setProjects(loadCodingProjects());
    const lockedModel = normalizeCodingModelSpec(opts.model);
    const lockedEndpoint = normalizeCodingModelSpec(opts.endpoint);
    const lockedApiKey = normalizeCodingModelSpec(opts.apiKey);
    const providerKind = normalizeCodingProviderKind(opts.providerKind) ?? "";
    const ehHostModel = codingModelToEhHostModel(lockedModel, providerKind);

    const commitProjectDefaults = () => {
      seedCodingProjectDefaultsIfEmpty(path, {
        harness: opts.harness,
        model: opts.model,
        providerKind: opts.providerKind,
        endpoint: opts.endpoint,
        apiKey: opts.apiKey,
      });
      saveCodingLastUsedPrefill({
        harness: opts.harness,
        ...(lockedModel ? { model: lockedModel } : {}),
        ...(providerKind ? { providerKind } : {}),
        ...(lockedEndpoint ? { endpoint: lockedEndpoint } : {}),
        // API keys stay on the home node — never last-used in the browser.
      });
      setProjects(loadCodingProjects());
    };

    if (opts.harness === "envoy-harness") {
      if (ehChats.length >= MAX_ENVOY_HARNESS_CHATS) {
        setSheetError(
          t(
            "eh.chatLimit",
            "At most {{count}} coding chats — remove one first.",
            { count: MAX_ENVOY_HARNESS_CHATS },
          ),
        );
        return;
      }
      setSheetBusy(true);
      setSheetError(null);
      try {
        let chatId: string | null = null;
        let createdTitle: string | undefined;
        try {
          const created = await nodeService.createEnvoyHarnessChat({
            cwd: path,
            forceNew: true,
            ...(ehHostModel ? { model: ehHostModel } : {}),
            ...(lockedEndpoint ? { endpoint: lockedEndpoint } : {}),
            ...(lockedApiKey ? { apiKey: lockedApiKey } : {}),
          });
          chatId = created.id;
          createdTitle = created.title;
        } catch (createErr: unknown) {
          const msg =
            createErr instanceof Error ? createErr.message : String(createErr);
          if (!msg.includes("Unknown method: createEnvoyHarnessChat")) {
            throw createErr;
          }
          await nodeService.setEnvoyHarnessProjectPath(path);
          chatId = null;
        }
        commitProjectDefaults();
        setWorkspaceSheetOpen(false);
        await refreshEhChats();
        if (chatId) {
          onSelect({
            kind: "eh",
            chatId,
            title:
              createdTitle?.trim() ||
              t("codingView.newSessionTitle", "New workspace"),
            cwd: path,
          });
        }
      } catch (e: unknown) {
        setSheetError(e instanceof Error ? e.message : String(e));
      } finally {
        setSheetBusy(false);
      }
      return;
    }

    setSheetBusy(true);
    setSheetError(null);
    try {
      if (isCodingTierBHarness(opts.harness)) {
        const agentId = codingHarnessToExtAgentId(opts.harness);
        if (!agentId) {
          setSheetError(
            t("codingView.harnessUnavailable", "Not available"),
          );
          return;
        }
        const reach = await nodeService.probeExtAgent({ agentId });
        if (
          reach.installState === "not-installed" ||
          (reach.installGuide && !reach.installGuide.installed)
        ) {
          if (reach.installGuide) {
            commitProjectDefaults();
            setPendingInstall({
              harness: opts.harness,
              cwd: path,
              ...(lockedModel ? { model: lockedModel } : {}),
              ...(providerKind ? { providerKind } : {}),
              ...(lockedEndpoint ? { endpoint: lockedEndpoint } : {}),
              ...(lockedApiKey ? { apiKey: lockedApiKey } : {}),
              guide: reach.installGuide,
              installState: reach.installState,
            });
            setWorkspaceSheetOpen(false);
          } else {
            setSheetError(
              t(
                "codingView.harnessNeedsInstall",
                "Install {name} first.",
                { name: codingHarnessLabel(opts.harness) },
              ),
            );
          }
          return;
        }
        const session = createCodingExtSession({
          harness: opts.harness,
          cwd: path,
          ...(lockedModel ? { model: lockedModel } : {}),
          ...(providerKind ? { providerKind } : {}),
          ...(lockedEndpoint ? { endpoint: lockedEndpoint } : {}),
        });
        try {
          await nodeService.setCodingHarnessRuntime?.({
            codingSessionId: session.id,
            cwd: path,
            runtime: {
              ...(lockedModel ? { model: lockedModel } : {}),
              ...(providerKind ? { providerKind } : {}),
              ...(lockedEndpoint ? { endpoint: lockedEndpoint } : {}),
              ...(lockedApiKey ? { apiKey: lockedApiKey } : {}),
            },
          });
        } catch (e: unknown) {
          removeCodingExtSession(session.id);
          throw e;
        }
        commitProjectDefaults();
        setExtSessions(loadCodingExtSessions());
        setWorkspaceSheetOpen(false);
        onSelect({
          kind: "ext",
          sessionId: session.id,
          harness: session.harness,
          cwd: session.cwd,
          title: session.title,
        });
        return;
      }

      const modelName = lockedModel
        ? lockedModel.includes(":")
          ? lockedModel.slice(lockedModel.indexOf(":") + 1).trim()
          : lockedModel
        : undefined;
      const piProvider =
        providerKind === "anthropic-compatible"
          ? "anthropic"
          : providerKind === "openai-compatible"
            ? "openai"
            : lockedModel?.includes(":")
              ? lockedModel.slice(0, lockedModel.indexOf(":")).trim()
              : undefined;
      const result = await nodeService.ensurePiTerminalSession({
        projectPath: path,
        forceRestart: true,
        ...(modelName
          ? {
              modelOverride: {
                model: modelName,
                ...(piProvider ? { provider: piProvider } : {}),
                ...(providerKind === "openai-compatible"
                  ? { mode: "openai-compatible" as const }
                  : providerKind === "anthropic-compatible"
                    ? { mode: "anthropic-compatible" as const }
                    : {}),
                ...(lockedEndpoint ? { endpoint: lockedEndpoint } : {}),
                ...(lockedApiKey ? { apiKey: lockedApiKey } : {}),
              },
            }
          : {}),
      });
      if (!result.ok) {
        setSheetError(result.reason);
        return;
      }
      commitProjectDefaults();
      setWorkspaceSheetOpen(false);
      await refreshTerminalSessions();
      onSelect({
        kind: "pi",
        sessionId: result.session.sessionId,
        session: result.session,
      });
    } catch (e: unknown) {
      setSheetError(e instanceof Error ? e.message : String(e));
    } finally {
      setSheetBusy(false);
    }
  };

  const handlePaletteSelect = (item: CodingPaletteItem) => {
    setPaletteOpen(false);
    const a = item.action;
    switch (a.type) {
      case "select-session":
        onSelect(a.ref);
        return;
      case "focus-project": {
        setCollapsedCwds((prev) => {
          const next = new Set(prev);
          next.delete(a.path);
          return next;
        });
        openNewWorkspace(a.path);
        return;
      }
      case "new-workspace":
        openNewWorkspace();
        return;
      case "new-schedule":
        setScheduleError(null);
        setScheduleModalOpen(true);
        return;
      case "add-project":
        openAddProject();
        return;
      case "open-settings":
        openCodingDefaults();
        return;
      case "invite-peer": {
        if (selected?.kind !== "eh") return;
        const chat = ehChats.find((c) => c.id === selected.chatId);
        if (chat) {
          setInviteError(null);
          setInviteReviewTarget(chat);
        }
        return;
      }
      case "open-file": {
        void nodeService.openEnvoyHarnessFile?.({
          path: a.path,
          chatId: a.chatId,
        });
        return;
      }
    }
  };

  const toggleArchiveRow = (row: ListRow) => {
    const key = codingHistoryArchiveKey(rowMeta(row));
    if (archivedKeys.has(key)) unarchiveCodingWorkspace(key);
    else archiveCodingWorkspace(key);
  };

  const archiveLabelFor = (row: ListRow): string => {
    const key = codingHistoryArchiveKey(rowMeta(row));
    return archivedKeys.has(key)
      ? t("codingView.historyUnarchive", "Unarchive")
      : t("codingView.historyArchive", "Archive");
  };

  const setFilter = (f: CodingHistoryFilter) => {
    setHistoryFilter(f);
    saveCodingHistoryFilter(f);
  };

  const setFlat = (v: boolean) => {
    setFlatMode(v);
    saveCodingHistoryFlatMode(v);
  };

  const handleRemoveEhChat = async (chat: EhChatWorkspaceSummary) => {
    setDeletingUi(true);
    try {
      await nodeService.removeEnvoyHarnessChat(chat.id);
      await refreshEhChats();
      if (selected?.kind === "eh" && selected.chatId === chat.id) {
        onSelect(null);
      }
      setDeleteEhChatTarget(null);
    } catch (err) {
      console.error("[CodingSidebar] remove workspace failed:", err);
      setSheetError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingUi(false);
    }
  };

  const handleRemovePiSession = async (session: TerminalSessionSummary) => {
    setDeletingUi(true);
    try {
      await nodeService.closeTerminalSession({ sessionId: session.sessionId });
      await refreshTerminalSessions();
      if (selected?.kind === "pi" && selected.sessionId === session.sessionId) {
        onSelect(null);
      }
      setDeletePiSession(null);
    } catch (err) {
      console.error("[CodingSidebar] remove pi workspace failed:", err);
      setSheetError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingUi(false);
    }
  };

  const handleRemoveExtSession = (session: CodingExtSession) => {
    void nodeService.clearCodingHarnessRuntime?.({
      codingSessionId: session.id,
    }).catch(() => undefined);
    removeCodingExtSession(session.id);
    setExtSessions(loadCodingExtSessions());
    if (selected?.kind === "ext" && selected.sessionId === session.id) {
      onSelect(null);
    }
    setDeleteExtSession(null);
  };

  /** Remove project + its Coding workspaces from UI only — never disk. */
  const handleRemoveProject = async (group: ProjectGroup) => {
    setDeletingUi(true);
    setSheetError(null);
    try {
      for (const row of group.rows) {
        if (row.kind === "eh") {
          await nodeService.removeEnvoyHarnessChat(row.chat.id);
        } else if (row.kind === "pi") {
          await nodeService.closeTerminalSession({
            sessionId: row.session.sessionId,
          });
        } else {
          void nodeService.clearCodingHarnessRuntime?.({
            codingSessionId: row.session.id,
          }).catch(() => undefined);
          removeCodingExtSession(row.session.id);
        }
      }
      removeCodingProject(group.cwd);
      setProjects(loadCodingProjects());
      setExtSessions(loadCodingExtSessions());
      await refreshEhChats();
      await refreshTerminalSessions();
      if (
        selected?.kind === "eh" &&
        group.rows.some(
          (r) => r.kind === "eh" && r.chat.id === selected.chatId,
        )
      ) {
        onSelect(null);
      } else if (
        selected?.kind === "pi" &&
        group.rows.some(
          (r) => r.kind === "pi" && r.session.sessionId === selected.sessionId,
        )
      ) {
        onSelect(null);
      } else if (
        selected?.kind === "ext" &&
        group.rows.some(
          (r) => r.kind === "ext" && r.session.id === selected.sessionId,
        )
      ) {
        onSelect(null);
      } else if (
        (selected?.kind === "eh" || selected?.kind === "ext") &&
        selected.cwd &&
        normalizeCodingProjectPath(selected.cwd) === group.cwd
      ) {
        onSelect(null);
      }
      setDeleteProjectTarget(null);
    } catch (err) {
      console.error("[CodingSidebar] remove project failed:", err);
      setSheetError(err instanceof Error ? err.message : String(err));
      setProjects(loadCodingProjects());
      setExtSessions(loadCodingExtSessions());
      await refreshEhChats();
      await refreshTerminalSessions();
    } finally {
      setDeletingUi(false);
    }
  };

  const toggleCwd = (cwd: string) => {
    setCollapsedCwds((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) next.delete(cwd);
      else next.add(cwd);
      return next;
    });
  };

  if (!mayUseCoding) {
    return (
      <aside className="coding-sidebar" data-testid="coding-sidebar">
        <div className="coding-sidebar-header">
          <h3>{t("codingView.sessionsTitle")}</h3>
        </div>
        <div className="coding-sidebar-empty" data-testid="coding-sidebar-gated">
          <p>
            {t(
              "codingView.codingGated",
              "Coding isn’t available for this profile.",
            )}
          </p>
        </div>
      </aside>
    );
  }

  const hasProjects = projects.length > 0 || projectGroups.length > 0;
  const showFlat = flatMode || historyFilter !== "all";

  const renderWorkspaceRow = (row: ListRow) => {
    if (row.kind === "eh") {
      const ref: CodingSessionRef = {
        kind: "eh",
        chatId: row.chat.id,
        title: row.title,
        cwd: row.cwd,
        uiBucket: row.chat.uiBucket,
      };
      const active = sameCodingSession(selected, ref);
      const statusText = codingUiBucketLabel(t, row.chat.uiBucket);
      return (
        <div
          key={`eh-${row.chat.id}`}
          className="coding-workspace-row-wrap"
        >
          <button
            type="button"
            className={`coding-workspace-row${active ? " active" : ""}`}
            onClick={() => onSelect(ref)}
            data-testid={`coding-workspace-${row.chat.id}`}
          >
            <span
              className={codingUiBucketDotClass(row.chat.uiBucket)}
              aria-label={statusText}
            />
            <span className="coding-workspace-row__meta">
              <span className="coding-workspace-row__title-row">
                <span className="coding-workspace-row__title">
                  {row.title}
                </span>
                {codingUiBucketShowsChip(row.chat.uiBucket) ? (
                  <span
                    className={`coding-status-chip coding-status-chip--${row.chat.uiBucket}`}
                    data-testid={`coding-status-chip-${row.chat.id}`}
                  >
                    {statusText}
                  </span>
                ) : null}
              </span>
              <span className="coding-workspace-row__sub">
                {showFlat ? `${codingProjectLabel(row.cwd)} · ` : ""}
                {formatRelativeShort(row.lastUsedAt)}
              </span>
            </span>
          </button>
          <EhChatRowMenu
            chat={row.chat}
            onRemove={(c) => setDeleteEhChatTarget(c)}
            onInviteReview={(c) => {
              setInviteError(null);
              setInviteReviewTarget(c);
            }}
            onAddHeartbeat={(c) => {
              setHeartbeatError(null);
              setHeartbeatTarget({
                title: c.title || codingProjectLabel(c.cwd),
                target: { kind: "eh", chatId: c.id },
              });
            }}
            archiveLabel={archiveLabelFor(row)}
            onArchive={() => toggleArchiveRow(row)}
          />
        </div>
      );
    }
    if (row.kind === "ext") {
      const ref: CodingSessionRef = {
        kind: "ext",
        sessionId: row.session.id,
        harness: row.session.harness,
        cwd: row.session.cwd,
        title: row.title,
      };
      const active = sameCodingSession(selected, ref);
      const probe = harnessProbe[row.session.harness];
      let extStatus: ExtProbeStatus | null = null;
      if (extBusySessionId === row.session.id) {
        extStatus = "busy";
      } else if (probe === "ready") {
        extStatus = "ready";
      } else if (probe === "install") {
        extStatus = "install";
      } else if (probe === "unknown" || probe === "checking") {
        extStatus = probe === "unknown" ? "unknown" : null;
      }
      const statusText = codingExtStatusLabel(t, extStatus);
      const dotBucket =
        extStatus === "busy"
          ? "running"
          : extStatus === "install"
            ? "needs_input"
            : extStatus === "ready"
              ? "done"
              : "idle";
      return (
        <div
          key={`ext-${row.session.id}`}
          className="coding-workspace-row-wrap"
        >
          <button
            type="button"
            className={`coding-workspace-row${active ? " active" : ""}`}
            onClick={() => onSelect(ref)}
            data-testid={`coding-workspace-ext-${row.session.id}`}
          >
            <span
              className={`coding-status-dot coding-status-dot--${dotBucket}`}
              aria-label={statusText}
            />
            <span className="coding-workspace-row__meta">
              <span className="coding-workspace-row__title-row">
                <span className="coding-workspace-row__title">
                  {row.title}
                </span>
                {codingExtStatusShowsChip(extStatus) ? (
                  <span
                    className={`coding-status-chip coding-status-chip--${dotBucket}`}
                    data-testid={`coding-status-chip-ext-${row.session.id}`}
                  >
                    {statusText}
                  </span>
                ) : null}
              </span>
              <span className="coding-workspace-row__sub">
                {showFlat ? `${codingProjectLabel(row.cwd)} · ` : ""}
                {formatRelativeShort(row.lastUsedAt)}
                {" · "}
                {codingHarnessLabel(row.session.harness)}
              </span>
            </span>
          </button>
          <CodingSidebarMenu
            testId={`coding-ext-menu-${row.session.id}`}
            ariaLabel={t(
              "codingView.workspaceActionsAria",
              "Workspace actions",
            )}
            removeLabel={t("codingView.remove", "Remove")}
            onRemove={() => setDeleteExtSession(row.session)}
            heartbeatLabel={t("codingView.heartbeatAdd", "Add heartbeat…")}
            onAddHeartbeat={() => {
              const agentId =
                codingHarnessToExtAgentId(row.session.harness) ??
                row.session.harness;
              setHeartbeatError(null);
              setHeartbeatTarget({
                title: row.title,
                target: {
                  kind: "ext",
                  sessionId: row.session.id,
                  agentId,
                },
              });
            }}
            archiveLabel={archiveLabelFor(row)}
            onArchive={() => toggleArchiveRow(row)}
          />
        </div>
      );
    }
    const ref: CodingSessionRef = {
      kind: "pi",
      sessionId: row.session.sessionId,
      session: row.session,
    };
    const active = sameCodingSession(selected, ref);
    const piBusy = piBusySessionId === row.session.sessionId;
    const statusText = piBusy
      ? t("codingView.statusRunning", "Running")
      : t("codingView.statusIdle", "Idle");
    const piDot = piBusy ? "running" : "idle";
    return (
      <div
        key={`pi-${row.session.sessionId}`}
        className="coding-workspace-row-wrap"
      >
        <button
          type="button"
          className={`coding-workspace-row${active ? " active" : ""}`}
          onClick={() => onSelect(ref)}
          data-testid={`coding-workspace-pi-${row.session.sessionId}`}
        >
          <span
            className={`coding-status-dot coding-status-dot--${piDot}`}
            aria-label={statusText}
          />
          <span className="coding-workspace-row__meta">
            <span className="coding-workspace-row__title-row">
              <span className="coding-workspace-row__title">
                {row.title}
              </span>
              {piBusy ? (
                <span
                  className={`coding-status-chip coding-status-chip--${piDot}`}
                  data-testid={`coding-status-chip-pi-${row.session.sessionId}`}
                >
                  {statusText}
                </span>
              ) : null}
            </span>
            <span className="coding-workspace-row__sub">
              {showFlat ? `${codingProjectLabel(row.cwd)} · ` : ""}
              {formatRelativeShort(row.lastUsedAt)}
              {" · "}
              {t("pi.title", "Pi")}
            </span>
          </span>
        </button>
        <CodingSidebarMenu
          testId={`coding-pi-menu-${row.session.sessionId}`}
          ariaLabel={t(
            "codingView.workspaceActionsAria",
            "Workspace actions",
          )}
          removeLabel={t("codingView.remove", "Remove")}
          onRemove={() => setDeletePiSession(row.session)}
          heartbeatLabel={t("codingView.heartbeatAdd", "Add heartbeat…")}
          onAddHeartbeat={() => {
            setHeartbeatError(null);
            setHeartbeatTarget({
              title: row.title,
              target: { kind: "pi", sessionId: row.session.sessionId },
            });
          }}
          archiveLabel={archiveLabelFor(row)}
          onArchive={() => toggleArchiveRow(row)}
        />
      </div>
    );
  };

  return (
    <aside className="coding-sidebar" data-testid="coding-sidebar">
      <div className="coding-sidebar-top">
        <div className="coding-sidebar-top__row">
          <button
            type="button"
            className="coding-sidebar-add-project"
            onClick={() => openAddProject()}
            data-testid="coding-add-project"
          >
            <AddIcon size={16} />
            {t("codingView.addProjectCta", "Add project")}
          </button>
          <button
            type="button"
            className="coding-sidebar-search"
            onClick={() => setPaletteOpen(true)}
            data-testid="coding-search-btn"
            title={t("codingView.searchTitle", "Search Coding")}
            aria-label={t("codingView.searchTitle", "Search Coding")}
          >
            <SearchIcon size={16} />
          </button>
        </div>
      </div>

      <CodingHistoryFilters
        filter={historyFilter}
        onFilterChange={setFilter}
        flatMode={flatMode}
        onFlatModeChange={setFlat}
      />

      {sheetError && !workspaceSheetOpen && !addProjectOpen ? (
        <p className="coding-sidebar-error" role="alert">
          {sheetError}
        </p>
      ) : null}

      <div className="coding-workspace-list" data-testid="coding-workspace-list">
        {showFlat
          ? flatRows.map((row) => renderWorkspaceRow(row))
          : visibleGroups.map((group) => {
          const collapsed = collapsedCwds.has(group.cwd);
          const projectMeta =
            projects.find((p) => p.path === group.cwd) ??
            getCodingProject(group.cwd);
          const projectEngine =
            projectMeta?.defaultHarness ??
            (group.rows[0] ? harnessFromListRow(group.rows[0]) : undefined);
          return (
            <div
              key={group.cwd || "__empty__"}
              className="coding-project-group"
              data-testid={`coding-project-group-${group.label}`}
            >
              <div className="coding-project-group__header-row">
                <button
                  type="button"
                  className="coding-project-group__header"
                  onClick={() => toggleCwd(group.cwd)}
                  aria-expanded={!collapsed}
                  title={group.cwd}
                >
                  <span className="coding-project-group__chevron" aria-hidden>
                    {collapsed ? "▶" : "▼"}
                  </span>
                  <span className="coding-project-group__label">
                    {group.label}
                  </span>
                  {projectEngine ? (
                    <span
                      className="coding-project-group__engine"
                      data-testid={`coding-project-engine-${group.label}`}
                      title={t(
                        "codingView.projectDefaultHarness",
                        "Default agent for new workspaces",
                      )}
                    >
                      {codingHarnessLabel(projectEngine)}
                    </span>
                  ) : null}
                </button>
                <CodingSidebarMenu
                  testId={`coding-project-menu-${group.label}`}
                  ariaLabel={t(
                    "codingView.projectMenuAria",
                    "Project actions",
                  )}
                  settingsLabel={t(
                    "codingView.projectSettings",
                    "Project settings",
                  )}
                  onOpenSettings={() => {
                    let project =
                      getCodingProject(group.cwd) ??
                      projects.find((p) => p.path === group.cwd) ??
                      ({
                        path: group.cwd,
                        label: group.label,
                        addedAt: new Date(0).toISOString(),
                      } satisfies CodingProject);
                    if (!project.defaultHarness && group.rows[0]) {
                      const seeded = seedCodingProjectDefaultsIfEmpty(
                        group.cwd,
                        { harness: harnessFromListRow(group.rows[0]) },
                      );
                      if (seeded) {
                        setProjects(loadCodingProjects());
                        project = seeded;
                      }
                    }
                    setProjectSettingsError(null);
                    setProjectSettingsTarget(project);
                  }}
                  revealLabel={t(
                    "codingView.projectOpenInFileManager",
                    "Open in file manager",
                  )}
                  onReveal={() => {
                    void revealProjectPath(group.cwd);
                  }}
                  removeLabel={t(
                    "codingView.removeProject",
                    "Remove from Coding",
                  )}
                  onRemove={() => setDeleteProjectTarget(group)}
                />
              </div>
              {!collapsed ? (
                <div className="coding-project-group__workspaces-bar">
                  <span className="coding-project-group__workspaces-title">
                    {t("codingView.workspacesSection", "Workspaces")}
                  </span>
                  <button
                    type="button"
                    className="coding-project-group__add-workspace"
                    onClick={() => openNewWorkspace(group.cwd)}
                    data-testid={`coding-project-new-workspace-${group.label}`}
                  >
                    <AddIcon size={14} />
                    {t("codingView.addWorkspaceCta", "Add workspace")}
                  </button>
                </div>
              ) : null}
              {!collapsed ? group.rows.map((row) => renderWorkspaceRow(row)) : null}
            </div>
          );
        })}

        {!hasProjects ? (
          <div className="coding-sidebar-empty" data-testid="coding-sidebar-empty">
            <p>
              {t(
                "codingView.emptyProjects",
                "No projects yet. Add a project folder, then create a workspace under it.",
              )}
            </p>
          </div>
        ) : showFlat && flatRows.length === 0 ? (
          <div className="coding-sidebar-empty" data-testid="coding-history-empty">
            <p>
              {t(
                "codingView.historyEmpty",
                "No workspaces match this filter.",
              )}
            </p>
          </div>
        ) : null}
      </div>

      <div className="coding-sidebar-footer">
        <button
          type="button"
          className="coding-sidebar-settings"
          onClick={() => setHeartbeatsPanelOpen(true)}
          data-testid="coding-heartbeats"
        >
          {t("codingView.heartbeatListTitle", "Heartbeats")}
        </button>
        <button
          type="button"
          className="coding-sidebar-settings"
          onClick={() => setSchedulesPanelOpen(true)}
          data-testid="coding-schedules"
        >
          {t("codingView.scheduleListTitle", "Schedules")}
        </button>
        <>
          <div
            className="coding-sidebar-footer__sep"
            role="separator"
            aria-hidden
          />
          <button
            type="button"
            className="coding-sidebar-settings"
            onClick={openCodingDefaults}
            data-testid="coding-settings"
          >
            <SettingsIcon size={16} />
            {t("codingView.settingsFooter", "Coding defaults")}
          </button>
        </>
      </div>

      {heartbeatsPanelOpen ? (
        <CodingHeartbeatsPanel onClose={() => setHeartbeatsPanelOpen(false)} />
      ) : null}

      {schedulesPanelOpen ? (
        <CodingSchedulesPanel
          onClose={() => setSchedulesPanelOpen(false)}
          onNewSchedule={() => {
            setSchedulesPanelOpen(false);
            setScheduleError(null);
            setScheduleModalOpen(true);
          }}
        />
      ) : null}

      {scheduleModalOpen ? (
        <CodingScheduleModal
          projects={projects}
          busy={scheduleBusy}
          error={scheduleError}
          onCancel={() => {
            if (!scheduleBusy) {
              setScheduleModalOpen(false);
              setScheduleError(null);
            }
          }}
          onSave={(input) => {
            if (scheduleBusy) return;
            setScheduleBusy(true);
            setScheduleError(null);
            void (async () => {
              try {
                await nodeService.createCodingSchedule(input);
                showToast(
                  t("codingView.scheduleSaved", "Schedule saved."),
                  "success",
                );
                setScheduleModalOpen(false);
              } catch {
                setScheduleError(
                  t(
                    "codingView.scheduleSaveFailed",
                    "Couldn’t save the schedule. Try again.",
                  ),
                );
              } finally {
                setScheduleBusy(false);
              }
            })();
          }}
        />
      ) : null}

      {heartbeatTarget ? (
        <CodingHeartbeatModal
          workspaceTitle={heartbeatTarget.title}
          target={heartbeatTarget.target}
          busy={heartbeatBusy}
          error={heartbeatError}
          onCancel={() => {
            if (!heartbeatBusy) {
              setHeartbeatTarget(null);
              setHeartbeatError(null);
            }
          }}
          onSave={(input) => {
            if (heartbeatBusy) return;
            setHeartbeatBusy(true);
            setHeartbeatError(null);
            void (async () => {
              try {
                await nodeService.createCodingHeartbeat(input);
                showToast(
                  t("codingView.heartbeatSaved", "Heartbeat saved."),
                  "success",
                );
                setHeartbeatTarget(null);
              } catch {
                setHeartbeatError(
                  t(
                    "codingView.heartbeatSaveFailed",
                    "Couldn’t save the heartbeat. Try again.",
                  ),
                );
              } finally {
                setHeartbeatBusy(false);
              }
            })();
          }}
        />
      ) : null}

      {inviteReviewTarget ? (
        <CodingInviteReviewModal
          chatId={inviteReviewTarget.id}
          chatTitle={inviteReviewTarget.title}
          bonds={bonds}
          busy={inviteBusy}
          error={inviteError}
          onCancel={() => {
            if (!inviteBusy) {
              setInviteReviewTarget(null);
              setInviteError(null);
            }
          }}
          onInvite={(peerOwnerId) => {
            if (inviteBusy) return;
            setInviteBusy(true);
            setInviteError(null);
            void (async () => {
              try {
                const { messageText } =
                  await nodeService.createCodingReviewInvite({
                    chatId: inviteReviewTarget.id,
                    peerOwnerId,
                  });
                await nodeService.sendChat(peerOwnerId, messageText);
                showToast(
                  t(
                    "codingView.inviteReviewSent",
                    "Review invite sent.",
                  ),
                  "success",
                );
                setInviteReviewTarget(null);
                openChatWithPeer(peerOwnerId);
              } catch (err) {
                const msg =
                  err instanceof Error ? err.message : String(err ?? "");
                setInviteError(
                  msg.includes("coding_review_peer")
                    ? t(
                        "codingView.inviteReviewBondDenied",
                        "That contact isn’t eligible for a review invite.",
                      )
                    : t(
                        "codingView.inviteReviewFailed",
                        "Couldn’t send the review invite. Try again.",
                      ),
                );
              } finally {
                setInviteBusy(false);
              }
            })();
          }}
        />
      ) : null}

      {deleteEhChatTarget ? (
        <ConfirmDialog
          title={t(
            "codingView.removeWorkspaceTitle",
            "Remove workspace from Coding?",
          )}
          message={t(
            "codingView.removeWorkspaceMessage",
            "Remove “{title}” from Coding? Your folder, repo, and files on disk are not deleted.",
            { title: deleteEhChatTarget.title },
          )}
          variant="destructive"
          confirmLabel={
            deletingUi
              ? t("codingView.removingFromCoding", "Removing…")
              : t("codingView.remove", "Remove")
          }
          onCancel={() => {
            if (!deletingUi) setDeleteEhChatTarget(null);
          }}
          onConfirm={() => {
            if (!deletingUi) void handleRemoveEhChat(deleteEhChatTarget);
          }}
        />
      ) : null}

      {deletePiSession ? (
        <ConfirmDialog
          title={t(
            "codingView.removeWorkspaceTitle",
            "Remove workspace from Coding?",
          )}
          message={t(
            "codingView.removeWorkspaceMessage",
            "Remove “{title}” from Coding? Your folder, repo, and files on disk are not deleted.",
            { title: deletePiSession.title },
          )}
          variant="destructive"
          confirmLabel={
            deletingUi
              ? t("codingView.removingFromCoding", "Removing…")
              : t("codingView.remove", "Remove")
          }
          onCancel={() => {
            if (!deletingUi) setDeletePiSession(null);
          }}
          onConfirm={() => {
            if (!deletingUi) void handleRemovePiSession(deletePiSession);
          }}
        />
      ) : null}

      {deleteProjectTarget ? (
        <ConfirmDialog
          title={t(
            "codingView.removeProjectTitle",
            "Remove project from Coding?",
          )}
          message={t(
            "codingView.removeProjectMessage",
            "Remove “{title}” from Coding? Workspaces under it leave Coding too. Your folder, repo, and files on disk are not deleted.",
            { title: deleteProjectTarget.label },
          )}
          variant="destructive"
          confirmLabel={
            deletingUi
              ? t("codingView.removingFromCoding", "Removing…")
              : t("codingView.remove", "Remove")
          }
          onCancel={() => {
            if (!deletingUi) setDeleteProjectTarget(null);
          }}
          onConfirm={() => {
            if (!deletingUi) void handleRemoveProject(deleteProjectTarget);
          }}
        />
      ) : null}

      {addProjectOpen ? (
        <CodingProjectPickerModal
          open={addProjectOpen}
          title={t("codingView.addProjectTitle", "Add project")}
          description={t(
            "codingView.addProjectDesc",
            "Register a folder as a project. You can create workspaces under it next.",
          )}
          value={addProjectPath}
          onChange={setAddProjectPath}
          error={sheetError}
          busy={false}
          confirmLabel={t("codingView.addProjectConfirm", "Add project")}
          pickerTitle={t("codingView.addProjectTitle", "Add project")}
          onClose={() => {
            setAddProjectOpen(false);
            setSheetError(null);
          }}
          onConfirm={confirmAddProject}
        />
      ) : null}

      {projectSettingsTarget ? (
        <CodingProjectSettingsModal
          project={projectSettingsTarget}
          busy={projectSettingsBusy}
          error={projectSettingsError}
          revealBusy={revealBusyPath === projectSettingsTarget.path}
          codingDefaultsModelHint={codingDefaultsModelHint}
          onOpenCodingDefaults={() => {
            setProjectSettingsTarget(null);
            setProjectSettingsError(null);
            openCodingDefaults();
          }}
          onCancel={() => {
            if (!projectSettingsBusy) {
              setProjectSettingsTarget(null);
              setProjectSettingsError(null);
            }
          }}
          onSave={(patch) => {
            if (projectSettingsBusy) return;
            setProjectSettingsBusy(true);
            setProjectSettingsError(null);
            try {
              const projectPatch = {
                label: patch.label,
                ...(patch.defaultHarness
                  ? { defaultHarness: patch.defaultHarness }
                  : {}),
                defaultModel: patch.defaultModel,
                defaultProviderKind: patch.defaultProviderKind,
                defaultEndpoint: patch.defaultEndpoint,
                defaultApiKey: patch.defaultApiKey,
              };
              const updated = updateCodingProject(
                projectSettingsTarget.path,
                projectPatch,
              );
              if (!updated) {
                addCodingProject(projectSettingsTarget.path);
                updateCodingProject(projectSettingsTarget.path, projectPatch);
              }
              setProjects(loadCodingProjects());
              setProjectSettingsTarget(null);
              showToast(
                t("codingView.projectSettingsSaved", "Project settings saved."),
                "success",
              );
            } catch {
              setProjectSettingsError(
                t(
                  "codingView.projectSettingsSaveFailed",
                  "Couldn’t save project settings. Try again.",
                ),
              );
            } finally {
              setProjectSettingsBusy(false);
            }
          }}
          onReveal={() => {
            void revealProjectPath(projectSettingsTarget.path);
          }}
        />
      ) : null}

      {defaultsOpen ? (
        <CodingDefaultsModal
          defaults={codingDefaults}
          busy={defaultsBusy}
          error={defaultsError}
          envoymeshAiModelHint={envoymeshAiModelHint}
          onCancel={() => {
            if (!defaultsBusy) {
              setDefaultsOpen(false);
              setDefaultsError(null);
            }
          }}
          onSave={(next) => {
            if (defaultsBusy) return;
            setDefaultsBusy(true);
            setDefaultsError(null);
            try {
              const saved = saveCodingDefaults(next);
              setCodingDefaults(saved);
              setDefaultsOpen(false);
              showToast(
                t("codingView.defaultsSaved", "Coding defaults saved."),
                "success",
              );
            } catch {
              setDefaultsError(
                t(
                  "codingView.defaultsSaveFailed",
                  "Couldn’t save Coding defaults. Try again.",
                ),
              );
            } finally {
              setDefaultsBusy(false);
            }
          }}
        />
      ) : null}

      {workspaceSheetOpen ? (
        <CodingNewSessionSheet
          key={`${sheetInitialProject}:${sheetInitialPrefill.harness}:${sheetInitialPrefill.model}`}
          open={workspaceSheetOpen}
          projects={projects}
          initialProjectPath={sheetInitialProject}
          initialPrefill={sheetInitialPrefill}
          codingDefaultsModelHint={codingDefaultsModelHint}
          busy={sheetBusy}
          error={sheetError}
          enabledHarnesses={CODING_ALL_HARNESSES}
          harnessProbe={harnessProbe}
          onClose={() => {
            if (!sheetBusy) setWorkspaceSheetOpen(false);
          }}
          onConfirm={(opts) => void submitNewWorkspace(opts)}
          onAddProject={() => openAddProject()}
        />
      ) : null}

      {deleteExtSession ? (
        <ConfirmDialog
          title={t(
            "codingView.removeWorkspaceTitle",
            "Remove workspace from Coding?",
          )}
          message={t(
            "codingView.removeWorkspaceMessage",
            "Remove “{title}” from Coding? Your folder, repo, and files on disk are not deleted.",
            { title: deleteExtSession.title },
          )}
          variant="destructive"
          confirmLabel={t("codingView.remove", "Remove")}
          onCancel={() => setDeleteExtSession(null)}
          onConfirm={() => handleRemoveExtSession(deleteExtSession)}
        />
      ) : null}

      {pendingInstall ? (
        <ExtAgentSwitcherInstallDialog
          agentId={
            codingHarnessToExtAgentId(pendingInstall.harness) ??
            pendingInstall.harness
          }
          agentName={codingHarnessLabel(pendingInstall.harness)}
          installGuide={pendingInstall.guide}
          installState={pendingInstall.installState}
          onClose={() => setPendingInstall(null)}
          onRetry={() => {
            const agentId = codingHarnessToExtAgentId(pendingInstall.harness);
            if (!agentId) {
              setPendingInstall(null);
              return;
            }
            void nodeService.probeExtAgent({ agentId }).then(async (r) => {
              if (r.installState === "installed") {
                const session = createCodingExtSession({
                  harness: pendingInstall.harness,
                  cwd: pendingInstall.cwd,
                  ...(pendingInstall.model
                    ? { model: pendingInstall.model }
                    : {}),
                  ...(pendingInstall.providerKind
                    ? { providerKind: pendingInstall.providerKind }
                    : {}),
                  ...(pendingInstall.endpoint
                    ? { endpoint: pendingInstall.endpoint }
                    : {}),
                });
                try {
                  await nodeService.setCodingHarnessRuntime?.({
                    codingSessionId: session.id,
                    cwd: pendingInstall.cwd,
                    runtime: {
                      ...(pendingInstall.model
                        ? { model: pendingInstall.model }
                        : {}),
                      ...(pendingInstall.providerKind
                        ? { providerKind: pendingInstall.providerKind }
                        : {}),
                      ...(pendingInstall.endpoint
                        ? { endpoint: pendingInstall.endpoint }
                        : {}),
                      ...(pendingInstall.apiKey
                        ? { apiKey: pendingInstall.apiKey }
                        : {}),
                    },
                  });
                } catch {
                  removeCodingExtSession(session.id);
                  return;
                }
                setExtSessions(loadCodingExtSessions());
                setPendingInstall(null);
                onSelect({
                  kind: "ext",
                  sessionId: session.id,
                  harness: session.harness,
                  cwd: session.cwd,
                  title: session.title,
                });
              } else if (r.installGuide) {
                setPendingInstall({
                  ...pendingInstall,
                  guide: r.installGuide,
                  installState: r.installState,
                });
              }
            });
          }}
        />
      ) : null}

      <CodingCommandPalette
        open={paletteOpen}
        items={paletteItems}
        onClose={() => setPaletteOpen(false)}
        onSelect={handlePaletteSelect}
      />
    </aside>
  );
}
