import { ChatSidebar } from "./ChatSidebar.js";
import { ContactChatPanel } from "./ContactChatPanel.js";
import { FamilyChatPanel } from "./FamilyChatPanel.js";
import { FamilyGroupChatPanel } from "./FamilyGroupChatPanel.js";
import { GroupChatPanel } from "./GroupChatPanel.js";
import { InboxView } from "./InboxView.js";
import { TerminalPanel } from "../terminals/TerminalPanel.js";
import { TerminalSidebar } from "../terminals/TerminalSidebar.js";
import { ChatIcon } from "../../icons.js";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import type { ChatPanelMode } from "../../App.js";
import {
  isChatRoomThreadKey,
  isAiBotThread,
  parseChatRoomThreadKey,
  isFamilyThreadKey,
} from "@envoymesh/api";
import type { TerminalSessionSummary } from "@envoymesh/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { useIsInProcessMobileNode, useNodeService } from "../../hooks/useNodeService.js";
import type { ChatRoom, FamilyRoom } from "@envoymesh/api";
import { loadTerminalSelectedSessionId, saveTerminalSelectedSessionId } from "../../lib/storage.js";
import { isTauriShell, pickTauriDirectory } from "../../lib/tauri-shell.js";
import { OpenClawOfflineBanner } from "./OpenClawOfflineBanner.js";
import { BotChatPanel } from "./BotChatPanel.js";

/**
 * ChatView is a layout shell: sidebar + AI or contact thread, with Inbox as a second panel.
 * Selection is lifted to App when provided so switching views preserves the thread.
 */
export interface ChatViewProps {
  selectedContact: string | null;
  onSelectedContactChange: (id: string | null) => void;
  panelMode: ChatPanelMode;
  onPanelModeChange: (mode: ChatPanelMode) => void;
  inboxActivityCount: number;
  onOpenAssistant?: () => void;
  onOpenDiscover?: () => void;
  /** Open Pi coding TUI (switches to Terminals + selects Pi session). */
  onOpenPi?: () => void;
}

export function ChatView({
  selectedContact,
  onSelectedContactChange,
  panelMode,
  onPanelModeChange,
  inboxActivityCount,
  onOpenAssistant,
  onOpenDiscover,
  onOpenPi: onOpenPiProp,
}: ChatViewProps) {
  const t = useT();
  const nodeService = useNodeService();
  const isMobileNode = useIsInProcessMobileNode();
  const { connectionStatus, nodeConfig, bonds } = useNodeState();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [familyRooms, setFamilyRooms] = useState<FamilyRoom[]>([]);
  const [terminalSessions, setTerminalSessions] = useState<TerminalSessionSummary[]>([]);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(() => loadTerminalSelectedSessionId());
  const [piEnsureError, setPiEnsureError] = useState<string | null>(null);
  const [piEnsureBusy, setPiEnsureBusy] = useState(false);
  const [piProjectModalOpen, setPiProjectModalOpen] = useState(false);
  const [piProjectDraft, setPiProjectDraft] = useState("");
  const [piProjectForceRestart, setPiProjectForceRestart] = useState(false);
  const [piRestartSessionId, setPiRestartSessionId] = useState<string | null>(null);
  /** When true, auto-select prefers the dedicated Pi session over other terminals. */
  const preferPiSessionRef = useRef(false);
  /** Prefer this session id after a successful start (multi-Pi). */
  const preferPiSessionIdRef = useRef<string | null>(null);

  const savedPiProjects = nodeConfig?.piSettings?.allowedPaths ?? [];
  const savedPiProject = savedPiProjects[0]?.trim() ?? "";

  const applyPiSession = async (session: TerminalSessionSummary) => {
    preferPiSessionIdRef.current = session.sessionId;
    setSelectedTerminalId(session.sessionId);
    setTerminalSessions((prev) => {
      const without = prev.filter((s) => s.sessionId !== session.sessionId);
      return [session, ...without];
    });
    try {
      const list = await nodeService.listTerminalSessions();
      setTerminalSessions(list);
      const match = list.find((s) => s.sessionId === session.sessionId && s.state === "running");
      if (match) setSelectedTerminalId(match.sessionId);
    } catch {
      /* keep optimistic session */
    }
  };

  const startPiWithPath = async (
    projectPath: string,
    opts: { forceRestart: boolean; sessionId?: string | null },
  ) => {
    preferPiSessionRef.current = true;
    setPiEnsureError(null);
    setPiEnsureBusy(true);
    onPanelModeChange("terminals");
    try {
      const result = await nodeService.ensurePiTerminalSession({
        projectPath,
        forceRestart: opts.forceRestart,
        sessionId: opts.sessionId ?? undefined,
      });
      if (result.ok) {
        setPiProjectModalOpen(false);
        setPiRestartSessionId(null);
        await applyPiSession(result.session);
      } else {
        setPiEnsureError(result.reason);
        // Surface the path dialog so the user can retry (desktop + browser).
        setPiProjectModalOpen(true);
      }
    } catch (e: unknown) {
      setPiEnsureError(e instanceof Error ? e.message : String(e));
    } finally {
      setPiEnsureBusy(false);
    }
  };

  /**
   * Open Pi terminals.
   * - Default (chat π): focus first running Pi if any; else pick a project and start.
   * - `startNew`: always pick a project (header “π Pi” / empty CTA).
   * - `changeProject` + `sessionId`: change that Pi’s folder.
   */
  const openPiTerminal = async (opts?: {
    changeProject?: boolean;
    sessionId?: string;
    startNew?: boolean;
  }) => {
    preferPiSessionRef.current = true;
    setPiEnsureError(null);
    onPanelModeChange("terminals");
    onOpenPiProp?.();

    let sessions = terminalSessions;
    try {
      sessions = await nodeService.listTerminalSessions();
      setTerminalSessions(sessions);
    } catch {
      /* use cached list */
    }

    if (opts?.changeProject) {
      const target =
        (opts.sessionId
          ? sessions.find((s) => s.sessionId === opts.sessionId && s.role === "pi")
          : undefined) ??
        sessions.find((s) => s.sessionId === selectedTerminalId && s.role === "pi") ??
        sessions.find((s) => s.role === "pi" && s.state === "running");
      if (!target) {
        setPiEnsureError(t("pi.noPiToChange", "Start a Pi session first, then change its project."));
        return;
      }
      setPiProjectForceRestart(true);
      setPiRestartSessionId(target.sessionId);
      setPiProjectDraft(target.cwd || savedPiProject);
      if (isTauriShell()) {
        const picked = await pickTauriDirectory({
          title: t("pi.changeProjectTitle", "Change Pi project folder"),
          defaultPath: target.cwd || savedPiProject || undefined,
        });
        if (!picked) return;
        setPiProjectDraft(picked);
        void startPiWithPath(picked, {
          forceRestart: true,
          sessionId: target.sessionId,
        });
        return;
      }
      setPiProjectModalOpen(true);
      return;
    }

    // Chat π: if a Pi is already running, just show it.
    if (!opts?.startNew) {
      const firstPi = sessions.find((s) => s.role === "pi" && s.state === "running");
      if (firstPi) {
        preferPiSessionIdRef.current = firstPi.sessionId;
        setSelectedTerminalId(firstPi.sessionId);
        return;
      }
    }

    // Start (or start another): pick a project folder.
    setPiProjectForceRestart(false);
    setPiRestartSessionId(null);
    setPiProjectDraft(savedPiProject);
    if (isTauriShell()) {
      const picked = await pickTauriDirectory({
        title: t("pi.chooseProjectTitle", "Choose Pi project folder"),
        defaultPath: savedPiProject || undefined,
      });
      if (!picked) return;
      setPiProjectDraft(picked);
      void startPiWithPath(picked, { forceRestart: false, sessionId: null });
      return;
    }
    setPiProjectModalOpen(true);
  };

  const submitPiProject = () => {
    const path = piProjectDraft.trim();
    if (!path) {
      setPiEnsureError(t("pi.projectPathRequired", "Enter a project folder path."));
      return;
    }
    void startPiWithPath(path, {
      forceRestart: piProjectForceRestart,
      sessionId: piRestartSessionId,
    });
  };

  const browsePiProject = async () => {
    setPiEnsureError(null);
    const picked = await pickTauriDirectory({
      title: piProjectForceRestart
        ? t("pi.changeProjectTitle", "Change Pi project folder")
        : t("pi.chooseProjectTitle", "Choose Pi project folder"),
      defaultPath: piProjectDraft.trim() || savedPiProject || undefined,
    });
    if (!picked) return; // cancelled
    setPiProjectDraft(picked);
    // OS dialog already confirmed the folder — start immediately.
    void startPiWithPath(picked, {
      forceRestart: piProjectForceRestart,
      sessionId: piRestartSessionId,
    });
  };

  const tauriShell = isTauriShell();

  const homeRemote = connectionStatus?.homeRemote;
  const terminalsAvailable =
    connectionStatus?.terminalsAvailable === true || homeRemote?.terminalsAvailable === true;
  const showTerminalsTab =
    connectionStatus?.terminalsAvailable === true || isMobileNode;
  const terminalsNeedPair = isMobileNode && homeRemote?.paired !== true;
  const selectedTerminal = useMemo(
    () => terminalSessions.find((s) => s.sessionId === selectedTerminalId) ?? null,
    [selectedTerminalId, terminalSessions],
  );

  const selectedFamilyRoom = isChatRoomThreadKey(selectedContact ?? "")
    ? familyRooms.find((r) => r.roomId === parseChatRoomThreadKey(selectedContact!))
    : undefined;
  const selectedRoom = isChatRoomThreadKey(selectedContact ?? "")
    ? chatRooms.find((r) => r.roomId === parseChatRoomThreadKey(selectedContact!))
    : undefined;

  // After creating a family group, the mesh room list won't have it yet — refresh family rooms.
  useEffect(() => {
    if (!nodeService.isConnected || !selectedContact) return;
    if (!isChatRoomThreadKey(selectedContact)) return;
    const roomId = parseChatRoomThreadKey(selectedContact);
    if (!roomId) return;
    if (selectedRoom || selectedFamilyRoom) return;
    if (!nodeService.listFamilyRooms) return;
    let cancelled = false;
    void nodeService.listFamilyRooms().then((result) => {
      if (!cancelled) setFamilyRooms(result.rooms ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [
    nodeService,
    nodeService.isConnected,
    selectedContact,
    selectedRoom,
    selectedFamilyRoom,
  ]);

  useEffect(() => {
    if (panelMode !== "terminals") {
      setPiEnsureError(null);
      setPiEnsureBusy(false);
    }
  }, [panelMode]);

  useEffect(() => {
    if (!showTerminalsTab && panelMode === "terminals") {
      onPanelModeChange("threads");
    }
  }, [showTerminalsTab, panelMode, onPanelModeChange]);

  useEffect(() => {
    saveTerminalSelectedSessionId(selectedTerminalId);
  }, [selectedTerminalId]);

  useEffect(() => {
    const running = terminalSessions.filter((s) => s.state === "running");
    if (running.length === 0) {
      if (selectedTerminalId) setSelectedTerminalId(null);
      return;
    }
    if (selectedTerminalId && running.some((s) => s.sessionId === selectedTerminalId)) {
      preferPiSessionRef.current = false;
      return;
    }
    if (preferPiSessionRef.current) {
      const preferId = preferPiSessionIdRef.current;
      const pi = preferId
        ? running.find((s) => s.sessionId === preferId)
        : running.find((s) => s.role === "pi");
      if (pi) {
        setSelectedTerminalId(pi.sessionId);
        preferPiSessionRef.current = false;
        preferPiSessionIdRef.current = null;
        return;
      }
    }
    setSelectedTerminalId(running[0]?.sessionId ?? null);
  }, [selectedTerminalId, terminalSessions]);

  useEffect(() => {
    if (!nodeService.isConnected) return;
    let cancelled = false;
    void nodeService.listChatRooms().then((rooms) => {
      if (!cancelled) setChatRooms(rooms);
    });
    if (nodeService.listFamilyRooms) {
      void nodeService.listFamilyRooms().then((result) => {
        if (!cancelled) setFamilyRooms(result.rooms ?? []);
      });
    }
    const unsub = nodeService.on("chat:room-updated", (room) => {
      const kind = (room as { kind?: string }).kind;
      if (kind === "family") {
        const familyRoom = room as unknown as FamilyRoom;
        setFamilyRooms((prev) => {
          const idx = prev.findIndex((r) => r.roomId === familyRoom.roomId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = familyRoom;
            return next;
          }
          return [familyRoom, ...prev];
        });
        return;
      }
      setChatRooms((prev) => {
        const idx = prev.findIndex((r) => r.roomId === room.roomId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = room;
          return next;
        }
        return [room, ...prev];
      });
    });
    const unsubRemoved = nodeService.on("chat:room-removed", ({ roomId }) => {
      setChatRooms((prev) => prev.filter((r) => r.roomId !== roomId));
      setFamilyRooms((prev) => prev.filter((r) => r.roomId !== roomId));
      if (selectedContact && parseChatRoomThreadKey(selectedContact) === roomId) {
        onSelectedContactChange(null);
      }
    });
    return () => {
      cancelled = true;
      unsub();
      unsubRemoved();
    };
  }, [nodeService, nodeService.isConnected, onSelectedContactChange, selectedContact]);

  return (
    <div className={`chat-view${panelMode === "terminals" ? " chat-view--terminals" : ""}`}>
      <OpenClawOfflineBanner />
      <div className="chat-view-primary-tabs" aria-label={t("chat.tabsLabel")}>
        <button
          type="button"
          aria-pressed={panelMode === "threads"}
          className={panelMode === "threads" ? "active" : ""}
          onClick={() => onPanelModeChange("threads")}
        >
          {t("chat.chats")}
        </button>
        <button
          type="button"
          aria-pressed={panelMode === "inbox"}
          className={`${panelMode === "inbox" ? "active" : ""}${inboxActivityCount > 0 ? " has-inbox-tab" : ""}`}
          onClick={() => onPanelModeChange("inbox")}
          data-testid="chat-tab-inbox"
        >
          {t("chat.inbox")}
          {inboxActivityCount > 0 ? (
            <span className="inbox-badge" aria-hidden>
              {inboxActivityCount > 99 ? "99+" : inboxActivityCount}
            </span>
          ) : null}
        </button>
        {showTerminalsTab ? (
          <button
            type="button"
            aria-pressed={panelMode === "terminals"}
            className={panelMode === "terminals" ? "active" : ""}
            onClick={() => onPanelModeChange("terminals")}
          >
            {t("chat.terminals")}
          </button>
        ) : null}
      </div>

      {panelMode === "inbox" ? (
        <div className="chat-view-inbox-panel">
          <InboxView embedded />
        </div>
      ) : panelMode === "terminals" ? (
        terminalsNeedPair ? (
          <div className="terminal-panel terminal-panel-empty chat-view-terminals-shell">
            <h3>{t("terminals.pairRequired")}</h3>
            <p>{t("terminals.pairRequiredDesc")}</p>
          </div>
        ) : (
          <div className="chat-view-terminals-shell">
            {piEnsureError || piEnsureBusy ? (
              <div
                className={`terminal-pi-ensure-banner${piEnsureError ? " terminal-pi-ensure-banner--error" : ""}`}
                role="status"
              >
                {piEnsureBusy ? (
                  <p>{t("pi.ensuringTerminal", "Starting Pi coding terminal…")}</p>
                ) : (
                  <>
                    <p>{piEnsureError}</p>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void openPiTerminal()}
                    >
                      {t("pi.retryStart", "Retry Start Pi")}
                    </button>
                  </>
                )}
              </div>
            ) : null}
            <div className="chat-view-terminals-body">
              <TerminalSidebar
                selectedSessionId={selectedTerminalId}
                onSelectSession={(id) => setSelectedTerminalId(id || null)}
                onSessionsChange={setTerminalSessions}
                disabled={!terminalsAvailable}
                onOpenAssistant={onOpenAssistant}
                onStartPi={() => void openPiTerminal({ startNew: true })}
                onChangePiProject={(sessionId) =>
                  void openPiTerminal({ changeProject: true, sessionId })
                }
              />
              <TerminalPanel session={selectedTerminal} onOpenAssistant={onOpenAssistant} active={panelMode === "terminals"} />
            </div>
          </div>
        )
      ) : (
        <div className="chat-view-threads-shell">
          <ChatSidebar
            selectedContact={selectedContact}
            onSelectContact={onSelectedContactChange}
            onOpenAssistant={onOpenAssistant}
            onOpenDiscover={onOpenDiscover}
            onOpenPi={() => void openPiTerminal()}
          />
          <section className="chat-area">
            {selectedContact ? (
              isChatRoomThreadKey(selectedContact) && selectedFamilyRoom ? (
                <FamilyGroupChatPanel
                  threadKey={selectedContact}
                  room={selectedFamilyRoom}
                />
              ) : isChatRoomThreadKey(selectedContact) ? (
                <GroupChatPanel
                  threadKey={selectedContact}
                  room={selectedRoom}
                  onLeaveGroup={() => onSelectedContactChange(null)}
                />
              ) : isAiBotThread(selectedContact) ? (
                <BotChatPanel threadKey={selectedContact} />
              ) : isFamilyThreadKey(selectedContact) ? (
                <FamilyChatPanel threadKey={selectedContact} />
              ) : (
                <ContactChatPanel
                  selectedContact={selectedContact}
                  onSelectContact={onSelectedContactChange}
                />
              )
            ) : (
              <div className="no-chat-selected">
                <div className="no-chat-selected-icon">
                  <ChatIcon size={48} />
                </div>
                {bonds.length === 0 ? (
                  <>
                    <h3>{t("chat.welcomeTitle")}</h3>
                    <p>{t("chat.welcomeDesc")}</p>
                    {onOpenDiscover && (
                      <button type="button" className="primary" style={{ marginTop: "1rem" }} onClick={onOpenDiscover}>
                        {t("chat.openDiscover")}
                      </button>
                    )}
                    {/* Show "Open EnvoyAI" only when AI is not disabled */}
                    {onOpenAssistant && nodeConfig?.modelProviders?.mode !== "disabled" && (
                      <button type="button" className="secondary" style={{ marginTop: "0.5rem" }} onClick={onOpenAssistant}>
                        {t("chat.openAssistant")}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <h3>{t("chat.selectContact")}</h3>
                    <p>{t("chat.selectContactDesc")}</p>
                    {onOpenAssistant && nodeConfig?.modelProviders?.mode !== "disabled" && (
                      <button type="button" className="primary" style={{ marginTop: "1rem" }} onClick={onOpenAssistant}>
                        {t("chat.openAssistant")}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {piProjectModalOpen ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => {
            if (!piEnsureBusy) setPiProjectModalOpen(false);
          }}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pi-project-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="pi-project-modal-title">
              {piProjectForceRestart
                ? t("pi.changeProjectTitle", "Change Pi project folder")
                : t("pi.chooseProjectTitle", "Choose Pi project folder")}
            </h2>
            <p className="modal-desc">
              {tauriShell
                ? t(
                    "pi.chooseProjectDescBrowse",
                    "Pi runs in this folder (reads AGENTS.md, edits files, runs shell). Use Browse to pick a folder.",
                  )
                : t(
                    "pi.chooseProjectDesc",
                    "Pi runs in this folder (reads AGENTS.md, edits files, runs shell). Use an absolute path. You can run up to 5 Pi terminals on different projects.",
                  )}
            </p>
            {tauriShell ? (
              <div className="modal-field">
                <span>{t("pi.projectPathLabel", "Project folder")}</span>
                <div className="modal-field-row">
                  <input
                    type="text"
                    value={piProjectDraft}
                    readOnly
                    placeholder={t("pi.projectPathBrowsePlaceholder", "No folder selected yet")}
                    disabled={piEnsureBusy}
                    aria-label={t("pi.projectPathLabel", "Project folder")}
                  />
                  <button
                    type="button"
                    className="secondary"
                    disabled={piEnsureBusy}
                    onClick={() => void browsePiProject()}
                  >
                    {t("pi.browseFolder", "Browse…")}
                  </button>
                </div>
              </div>
            ) : (
              <label className="modal-field">
                <span>{t("pi.projectPathLabel", "Project folder")}</span>
                <input
                  type="text"
                  value={piProjectDraft}
                  onChange={(e) => setPiProjectDraft(e.target.value)}
                  placeholder={t("pi.projectPathPlaceholder", "/path/to/your/repo")}
                  disabled={piEnsureBusy}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitPiProject();
                  }}
                />
              </label>
            )}
            {piEnsureError ? <p className="modal-error">{piEnsureError}</p> : null}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={piEnsureBusy}
                onClick={() => setPiProjectModalOpen(false)}
              >
                {t("common.cancel", "Cancel")}
              </button>
              {tauriShell ? (
                <button
                  type="button"
                  className="primary"
                  disabled={piEnsureBusy}
                  onClick={() => void browsePiProject()}
                >
                  {piEnsureBusy
                    ? t("pi.ensuringTerminal", "Starting Pi coding terminal…")
                    : t("pi.browseFolder", "Browse…")}
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={piEnsureBusy || !piProjectDraft.trim()}
                  onClick={submitPiProject}
                >
                  {piEnsureBusy
                    ? t("pi.ensuringTerminal", "Starting Pi coding terminal…")
                    : piProjectForceRestart
                      ? t("pi.restartWithProject", "Restart Pi here")
                      : t("pi.startWithProject", "Start Pi")}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
