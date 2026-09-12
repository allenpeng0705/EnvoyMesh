/**
 * Top-level Terminal view — shell PTY only.
 * Pi / Envoy Harness coding sessions live under the Coding tab.
 */
import { useEffect, useMemo, useState } from "react";
import type { TerminalSessionSummary } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import {
  loadTerminalSelectedSessionId,
  saveTerminalSelectedSessionId,
} from "../../lib/storage.js";
import {
  OPEN_TERMINAL_EVENT,
  takePendingTerminalOpen,
  type OpenTerminalDetail,
} from "../../lib/open-terminal-nav.js";
import { openCoding } from "../../lib/open-coding-nav.js";
import { TerminalPanel } from "../terminals/TerminalPanel.js";
import { TerminalSidebar } from "../terminals/TerminalSidebar.js";

function isShellSession(s: TerminalSessionSummary): boolean {
  return s.role !== "pi" && s.role !== "envoy-harness";
}

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
  const { connectionStatus } = useNodeState();
  const [terminalSessions, setTerminalSessions] = useState<TerminalSessionSummary[]>([]);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(() =>
    loadTerminalSelectedSessionId(),
  );

  const homeRemote = connectionStatus?.homeRemote;
  const terminalsAvailable =
    connectionStatus?.terminalsAvailable === true || homeRemote?.terminalsAvailable === true;

  const shellSessions = useMemo(
    () => terminalSessions.filter((s) => s.state === "running" && isShellSession(s)),
    [terminalSessions],
  );

  const selectedTerminal = useMemo(
    () => shellSessions.find((s) => s.sessionId === selectedTerminalId) ?? null,
    [selectedTerminalId, shellSessions],
  );

  useEffect(() => {
    saveTerminalSelectedSessionId(selectedTerminalId);
  }, [selectedTerminalId]);

  // If selection points at a coding PTY (or missing), pick a shell session.
  useEffect(() => {
    if (selectedTerminalId && selectedTerminal) return;
    if (selectedTerminalId && !selectedTerminal) {
      const coding = terminalSessions.find(
        (s) =>
          s.sessionId === selectedTerminalId &&
          (s.role === "pi" || s.role === "envoy-harness"),
      );
      if (coding) {
        openCoding(
          coding.role === "pi"
            ? { harness: "pi", sessionId: coding.sessionId }
            : { harness: "envoy-harness" },
        );
      }
      setSelectedTerminalId(shellSessions[0]?.sessionId ?? null);
      return;
    }
    if (!selectedTerminalId && shellSessions[0]) {
      setSelectedTerminalId(shellSessions[0].sessionId);
    }
  }, [selectedTerminalId, selectedTerminal, shellSessions, terminalSessions]);

  useEffect(() => {
    const runDetail = (detail?: OpenTerminalDetail | null) => {
      if (detail?.startPi) {
        openCoding({
          harness: "pi",
          startNew: detail.startNew !== false,
        });
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
        <div className="chat-view-terminals-body">
          <TerminalSidebar
            selectedSessionId={selectedTerminalId}
            onSelectSession={(id) => {
              setSelectedTerminalId(id || null);
            }}
            onSessionsChange={setTerminalSessions}
            disabled={!terminalsAvailable}
            onOpenAssistant={onOpenAssistant}
          />
          <TerminalPanel
            session={selectedTerminal}
            onOpenAssistant={onOpenAssistant}
            active={active}
          />
        </div>
      </div>
    </div>
  );
}
