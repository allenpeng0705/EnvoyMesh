/**
 * Coding Tier B panel — Ext Agent ask in Coding chrome.
 * Streaming harnesses (codex / claudecode) reuse `eh:timeline` under
 * `__ext__:${sessionId}`; one-shot backends stay sync ask.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  codingHarnessLabel,
  codingHarnessToExtAgentId,
  extTimelineChatId,
  type CodingHarnessId,
  type ExtAgentInstallGuide,
  type ExtAgentReachability,
} from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useEhTimeline } from "../../hooks/useEhTimeline.js";
import type { ExtProbeStatus } from "../../lib/coding-status-label.js";
import { maybeAutoTitleCodingExtSession } from "../../lib/coding-sessions.js";
import { ExtAgentInstallGuideCard } from "../ExtAgentInstallGuideCard.js";
import { ExtAgentSwitcherInstallDialog } from "../ExtAgentSwitcherInstallDialog.js";

/** Harnesses that emit assistant token deltas via eh:timeline. */
const STREAMING_EXT_HARNESSES = new Set<CodingHarnessId>([
  "codex",
  "claudecode",
]);

export type ExtAgentCodingPanelProps = {
  harness: CodingHarnessId;
  cwd: string;
  sessionId: string;
  /** Coding workspace header / sidebar status (busy + probe). */
  onStatusChange?: (status: ExtProbeStatus | null) => void;
};

type LocalMsg = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  streaming?: boolean;
};

export function ExtAgentCodingPanel({
  harness,
  cwd,
  sessionId,
  onStatusChange,
}: ExtAgentCodingPanelProps) {
  const t = useT();
  const nodeService = useNodeService();
  const agentId = codingHarnessToExtAgentId(harness) ?? harness;
  const label = codingHarnessLabel(harness);
  const canStream = STREAMING_EXT_HARNESSES.has(harness);
  const timelineChatId = useMemo(
    () => extTimelineChatId(sessionId),
    [sessionId],
  );
  const timeline = useEhTimeline(nodeService, timelineChatId);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<LocalMsg[]>([]);
  const [reach, setReach] = useState<ExtAgentReachability | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const refreshProbe = useCallback(async () => {
    try {
      const r = await nodeService.probeExtAgent({ agentId });
      setReach(r);
      return r;
    } catch (e: unknown) {
      setLocalError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [agentId, nodeService]);

  useEffect(() => {
    setMessages([]);
    setLocalError(null);
    void (async () => {
      try {
        await nodeService.setExtAgentProjectPath?.({
          agentId,
          path: cwd,
        });
      } catch {
        // non-fatal — ask still works without cwd for some agents
      }
      await refreshProbe();
    })();
  }, [agentId, cwd, nodeService, refreshProbe, sessionId]);

  const streamingAssistant = useMemo((): LocalMsg | null => {
    if (!canStream || !busy) return null;
    const item = timeline.items.find(
      (i) =>
        i.type === "message" &&
        i.role === "assistant" &&
        i.id === `turn:${sessionId}:assistant`,
    );
    if (!item || item.type !== "message") return null;
    if (!item.text.trim() && !item.streaming) return null;
    return {
      id: item.id,
      role: "assistant",
      text: item.text,
      streaming: item.streaming === true,
    };
  }, [busy, canStream, sessionId, timeline.items]);

  const displayMessages = useMemo(() => {
    if (!streamingAssistant) return messages;
    return [...messages, streamingAssistant];
  }, [messages, streamingAssistant]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [displayMessages, busy]);

  const needsInstall =
    reach?.installState === "not-installed" ||
    (reach?.installGuide != null && reach.installGuide.installed === false);

  useEffect(() => {
    if (!onStatusChange) return;
    if (busy) {
      onStatusChange("busy");
      return;
    }
    if (!reach) {
      onStatusChange(null);
      return;
    }
    if (needsInstall) onStatusChange("install");
    else if (reach.reachable || reach.installState === "installed") {
      onStatusChange("ready");
    } else onStatusChange("unknown");
  }, [busy, reach, needsInstall, onStatusChange]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setLocalError(null);

    const latest = await refreshProbe();
    if (
      latest?.installState === "not-installed" ||
      (latest?.installGuide && !latest.installGuide.installed)
    ) {
      setInstallOpen(true);
      return;
    }

    setDraft("");
    const userMsg: LocalMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
    };
    setMessages((prev) => [...prev, userMsg]);
    maybeAutoTitleCodingExtSession(sessionId, text);
    setBusy(true);
    try {
      const reply = await nodeService.askExtAgent({
        agentId,
        prompt: text,
        ...(canStream ? { streamSessionId: sessionId } : {}),
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: reply.trim() || t("codingView.emptyReply", "(empty reply)"),
        },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setLocalError(msg);
      if (/install|not found|ENOENT|missing/i.test(msg)) {
        setInstallOpen(true);
        await refreshProbe();
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `s-${Date.now()}`,
          role: "system",
          text: msg,
        },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const guide: ExtAgentInstallGuide | undefined = reach?.installGuide;

  return (
    <div
      className="ext-agent-coding-panel"
      data-testid="ext-agent-coding-panel"
      data-harness={harness}
      data-session-id={sessionId}
      data-streaming={canStream ? "true" : "false"}
    >
      <div className="ext-agent-coding-panel__meta">
        <span className="ext-agent-coding-panel__harness">{label}</span>
        <span className="ext-agent-coding-panel__cwd" title={cwd}>
          {cwd}
        </span>
        {reach ? (
          <span
            className={
              needsInstall
                ? "ext-agent-coding-panel__badge ext-agent-coding-panel__badge--install"
                : reach.reachable
                  ? "ext-agent-coding-panel__badge ext-agent-coding-panel__badge--ready"
                  : "ext-agent-coding-panel__badge"
            }
            data-testid="ext-agent-coding-probe-badge"
          >
            {needsInstall
              ? t("codingView.harnessNeedsInstall", "Install")
              : reach.reachable
                ? t("codingView.harnessReady", "Ready")
                : t("codingView.harnessProbeUnknown", "Check install")}
          </span>
        ) : null}
      </div>

      {needsInstall && guide && reach ? (
        <div className="ext-agent-coding-panel__install">
          <ExtAgentInstallGuideCard
            agentId={agentId}
            installGuide={guide}
            installState={reach.installState}
            onRetry={() => void refreshProbe()}
          />
          <button
            type="button"
            className="secondary"
            data-testid="ext-agent-coding-open-install"
            onClick={() => setInstallOpen(true)}
          >
            {t("codingView.openInstallGuide", "Install guide")}
          </button>
        </div>
      ) : null}

      <div
        className="ext-agent-coding-panel__thread"
        ref={threadRef}
        data-testid="ext-agent-coding-thread"
      >
        {displayMessages.length === 0 ? (
          <div className="coding-pane-empty">
            <p>
              {t(
                "codingView.extAgentEmpty",
                "Ask {name} about this project. Each message runs as a one-shot CLI ask.",
                { name: label },
              )}
            </p>
          </div>
        ) : (
          displayMessages.map((m) => (
            <div
              key={m.id}
              className={`ext-agent-coding-msg ext-agent-coding-msg--${m.role}${
                m.streaming ? " ext-agent-coding-msg--streaming" : ""
              }`}
              data-testid={`ext-agent-coding-msg-${m.role}`}
              data-streaming={m.streaming ? "true" : undefined}
            >
              <pre>{m.text}</pre>
            </div>
          ))
        )}
        {busy && !streamingAssistant?.text ? (
          <p className="ext-agent-coding-panel__busy" data-testid="ext-agent-coding-busy">
            {t("codingView.thinking", "Working…")}
          </p>
        ) : null}
      </div>

      {localError ? (
        <p className="modal-error" role="alert">
          {localError}
        </p>
      ) : null}

      <form
        className="ext-agent-coding-panel__composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={draft}
          disabled={busy}
          placeholder={t(
            "codingView.extAgentPlaceholder",
            "Message {name}…",
            { name: label },
          )}
          onChange={(e) => setDraft(e.target.value)}
          data-testid="ext-agent-coding-input"
        />
        <button
          type="submit"
          className="primary"
          disabled={busy || !draft.trim()}
          data-testid="ext-agent-coding-send"
        >
          {t("common.send", "Send")}
        </button>
      </form>

      {installOpen && guide && reach ? (
        <ExtAgentSwitcherInstallDialog
          agentId={agentId}
          agentName={label}
          installGuide={guide}
          installState={reach.installState}
          resolved={reach.installState === "installed"}
          onClose={() => setInstallOpen(false)}
          onRetry={() => {
            void refreshProbe().then((r) => {
              if (r?.installState === "installed") setInstallOpen(false);
            });
          }}
        />
      ) : null}
    </div>
  );
}
