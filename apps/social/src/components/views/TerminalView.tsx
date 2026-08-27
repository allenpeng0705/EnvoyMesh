/**
 * Top-level Terminal view (former Chat → Terminals).
 * Always mounted when selected — shows unavailable empty state when terminals are off.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { TerminalSessionSummary } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import {
  loadTerminalSelectedSessionId,
  saveTerminalSelectedSessionId,
} from "../../lib/storage.js";
import {
  OPEN_TERMINAL_EVENT,
  takePendingTerminalOpen,
  type OpenTerminalDetail,
} from "../../lib/open-terminal-nav.js";
import { HomeFolderPicker } from "../HomeFolderPicker.js";
import { TerminalPanel } from "../terminals/TerminalPanel.js";
import { TerminalSidebar } from "../terminals/TerminalSidebar.js";

export interface TerminalViewProps {
  onOpenAssistant?: () => void;
  /** True while this view is the active top tab (for TerminalPanel focus). */
  active?: boolean;
}

export function TerminalView({
  onOpenAssistant,
  active = true,
}: TerminalViewProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { connectionStatus, nodeConfig } = useNodeState();
  const [terminalSessions, setTerminalSessions] = useState<TerminalSessionSummary[]>([]);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(() =>
    loadTerminalSelectedSessionId(),
  );
  const [piEnsureError, setPiEnsureError] = useState<string | null>(null);
  const [piEnsureBusy, setPiEnsureBusy] = useState(false);
  const [piProjectModalOpen, setPiProjectModalOpen] = useState(false);
  const [piProjectDraft, setPiProjectDraft] = useState("");
  const [piProjectForceRestart, setPiProjectForceRestart] = useState(false);
  const [piRestartSessionId, setPiRestartSessionId] = useState<string | null>(null);
  /** Which coding TUI the project modal is serving (title/labels). */
  const [terminalMode, setTerminalMode] = useState<"pi" | "envoy">("pi");
  const preferPiSessionRef = useRef(false);
  const preferPiSessionIdRef = useRef<string | null>(null);

  const savedPiProjects = nodeConfig?.piSettings?.allowedPaths ?? [];
  const savedPiProject = savedPiProjects[0]?.trim() ?? "";
  /** U4+ — the Envoy TUI is the terminal surface when the backend is envoy-harness. */
  const savedEnvoyProject = nodeConfig?.envoyHarnessCwd?.trim() ?? "";

  const homeRemote = connectionStatus?.homeRemote;
  const terminalsAvailable =
    connectionStatus?.terminalsAvailable === true || homeRemote?.terminalsAvailable === true;

  const selectedTerminal = useMemo(
    () => terminalSessions.find((s) => s.sessionId === selectedTerminalId) ?? null,
    [selectedTerminalId, terminalSessions],
  );

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
    try {
      const result = terminalMode === "envoy"
        ? await nodeService.ensureEnvoyTerminalSession({
            projectPath,
            forceRestart: opts.forceRestart,
            sessionId: opts.sessionId ?? undefined,
          })
        : await nodeService.ensurePiTerminalSession({
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
        setPiProjectModalOpen(true);
      }
    } catch (e: unknown) {
      setPiEnsureError(e instanceof Error ? e.message : String(e));
    } finally {
      setPiEnsureBusy(false);
    }
  };

  const openTerminal = async (
    mode: "pi" | "envoy",
    opts?: {
    changeProject?: boolean;
    sessionId?: string;
    startNew?: boolean;
    },
  ) => {
    setTerminalMode(mode);
    const role = mode === "envoy" ? "envoy-harness" : "pi";
    const savedProject = mode === "envoy" ? savedEnvoyProject : savedPiProject;
    preferPiSessionRef.current = true;
    setPiEnsureError(null);

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
          ? sessions.find(
              (s) => s.sessionId === opts.sessionId && s.role === role,
            )
          : undefined) ??
        sessions.find(
          (s) => s.sessionId === selectedTerminalId && s.role === role,
        ) ??
        sessions.find((s) => s.role === role && s.state === "running");
      if (!target) {
        setPiEnsureError(
          mode === "envoy"
            ? t(
                "eh.noSessionToChange",
                "Start an Envoy session first, then change its project.",
              )
            : t(
                "pi.noPiToChange",
                "Start a Pi session first, then change its project.",
              ),
        );
        return;
      }
      setPiProjectForceRestart(true);
      setPiRestartSessionId(target.sessionId);
      setPiProjectDraft(target.cwd || savedProject);
      setPiProjectModalOpen(true);
      return;
    }

    if (!opts?.startNew) {
      const firstPi = sessions.find(
        (s) => s.role === role && s.state === "running",
      );
      if (firstPi) {
        preferPiSessionIdRef.current = firstPi.sessionId;
        setSelectedTerminalId(firstPi.sessionId);
        return;
      }
    }

    setPiProjectForceRestart(false);
    setPiRestartSessionId(null);
    setPiProjectDraft(savedProject);
    setPiProjectModalOpen(true);
  };

  const openPiTerminal = (opts?: {
    changeProject?: boolean;
    sessionId?: string;
    startNew?: boolean;
  }) => void openTerminal("pi", opts);

  const openEnvoyTerminal = (opts?: {
    changeProject?: boolean;
    sessionId?: string;
    startNew?: boolean;
  }) => void openTerminal("envoy", opts);

  const submitPiProject = () => {
    const path = piProjectDraft.trim();
    if (!path) {
      setPiEnsureError(t("pi.projectPathRequired", "Choose a project folder."));
      return;
    }
    void startPiWithPath(path, {
      forceRestart: piProjectForceRestart,
      sessionId: piRestartSessionId,
    });
  };

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

  const openPiTerminalRef = useRef(openPiTerminal);
  openPiTerminalRef.current = openPiTerminal;

  useEffect(() => {
    const runDetail = (detail?: OpenTerminalDetail | null) => {
      if (detail?.startPi) {
        void openPiTerminalRef.current({ startNew: detail.startNew === true });
      }
    };
    runDetail(takePendingTerminalOpen());
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<OpenTerminalDetail>).detail;
      runDetail(detail);
    };
    window.addEventListener(OPEN_TERMINAL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TERMINAL_EVENT, onOpen);
  }, []);

  if (!terminalsAvailable) {
    return (
      <div className="chat-view chat-view--terminals" data-testid="terminal-view">
        <div className="terminal-panel terminal-panel-empty chat-view-terminals-shell">
          <h3>{t("terminals.unavailable", "Terminals unavailable")}</h3>
          <p>
            {t(
              "terminals.unavailableDesc",
              "Connect to a home node that supports remote terminals, then try again.",
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-view chat-view--terminals" data-testid="terminal-view">
      <div className="chat-view-terminals-shell">
        {piEnsureError || piEnsureBusy ? (
          <div
            className={`terminal-pi-ensure-banner${piEnsureError ? " terminal-pi-ensure-banner--error" : ""}`}
            role="status"
          >
            {piEnsureBusy ? (
              <p>
                {terminalMode === "envoy"
                  ? t("eh.ensuringTerminal", "Starting Envoy TUI…")
                  : t("pi.ensuringTerminal", "Starting Pi coding terminal…")}
              </p>
            ) : (
              <>
                <p>{piEnsureError}</p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    terminalMode === "envoy"
                      ? void openEnvoyTerminal()
                      : void openPiTerminal()
                  }
                >
                  {terminalMode === "envoy"
                    ? t("eh.retryStart", "Retry Start Envoy")
                    : t("pi.retryStart", "Retry Start Pi")}
                </button>
              </>
            )}
          </div>
        ) : null}
        <div className="chat-view-terminals-body">
          <TerminalSidebar
            selectedSessionId={selectedTerminalId}
            onSelectSession={(id) => {
              setSelectedTerminalId(id || null);
            }}
            onSessionsChange={setTerminalSessions}
            disabled={!terminalsAvailable}
            onOpenAssistant={onOpenAssistant}
            onStartEnvoy={() => void openEnvoyTerminal({ startNew: true })}
            onStartPi={() => void openPiTerminal({ startNew: true })}
            onChangePiProject={(sessionId) =>
              void openPiTerminal({ changeProject: true, sessionId })
            }
            onChangeEnvoyProject={(sessionId) =>
              void openEnvoyTerminal({ changeProject: true, sessionId })
            }
          />
          <TerminalPanel
            session={selectedTerminal}
            onOpenAssistant={onOpenAssistant}
            active={active}
          />
        </div>
      </div>

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
                ? terminalMode === "envoy"
                  ? t("eh.changeProjectTitle", "Change Envoy project folder")
                  : t("pi.changeProjectTitle", "Change Pi project folder")
                : terminalMode === "envoy"
                  ? t("eh.chooseProjectTitle", "Choose Envoy project folder")
                  : t("pi.chooseProjectTitle", "Choose Pi project folder")}
            </h2>
            <p className="modal-desc">
              {terminalMode === "envoy"
                ? t(
                    "eh.chooseProjectDescBrowse",
                    "Envoy runs in this folder (reads AGENTS.md, edits files, runs shell). Use Browse to pick a folder.",
                  )
                : t(
                    "pi.chooseProjectDescBrowse",
                    "Pi runs in this folder (reads AGENTS.md, edits files, runs shell). Use Browse to pick a folder. You can run up to 5 Pi terminals on different projects.",
                  )}
            </p>
            <div className="modal-field">
              <span>{t("pi.projectPathLabel", "Project folder")}</span>
              <HomeFolderPicker
                value={piProjectDraft.trim() || undefined}
                onChange={(path) => {
                  setPiEnsureError(null);
                  setPiProjectDraft(path ?? "");
                }}
                title={
                  piProjectForceRestart
                    ? terminalMode === "envoy"
                      ? t("eh.changeProjectTitle", "Change Envoy project folder")
                      : t("pi.changeProjectTitle", "Change Pi project folder")
                    : terminalMode === "envoy"
                      ? t("eh.chooseProjectTitle", "Choose Envoy project folder")
                      : t("pi.chooseProjectTitle", "Choose Pi project folder")
                }
                disabled={piEnsureBusy}
              />
            </div>
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
              <button
                type="button"
                className="primary"
                disabled={piEnsureBusy || !piProjectDraft.trim()}
                onClick={submitPiProject}
              >
                {piEnsureBusy
                  ? terminalMode === "envoy"
                    ? t("eh.ensuringTerminal", "Starting Envoy TUI…")
                    : t("pi.ensuringTerminal", "Starting Pi coding terminal…")
                  : piProjectForceRestart
                    ? terminalMode === "envoy"
                      ? t("eh.restartWithProject", "Restart Envoy here")
                      : t("pi.restartWithProject", "Restart Pi here")
                    : terminalMode === "envoy"
                      ? t("eh.startWithProject", "Start")
                      : t("pi.startWithProject", "Start Pi")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
