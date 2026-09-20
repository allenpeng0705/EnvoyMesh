/**
 * Coding Tier B harness panel — isolated from Ext Agent product.
 * Streaming harnesses (codex / claudecode) reuse `eh:timeline` under
 * `__ext__:${sessionId}`; one-shot backends stay sync ask.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  codingHarnessLabel,
  codingHarnessToExtAgentId,
  extTimelineChatId,
  type CodingHarnessId,
  type EhPermissionEvent,
  type ExtAgentInstallGuide,
  type ExtAgentReachability,
} from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useEhTimeline } from "../../hooks/useEhTimeline.js";
import { useEhAttachments } from "../../hooks/useEhAttachments.js";
import type { ExtProbeStatus } from "../../lib/coding-status-label.js";
import {
  codingComposerCapabilities,
} from "../../lib/coding-composer-capabilities.js";
import {
  fastToggleSlash,
  shapeCodingComposerPrompt,
} from "../../lib/coding-composer-prompt.js";
import {
  codingComposerSessionKey,
  loadCodingComposerPrefs,
  saveCodingComposerPrefs,
  type CodingComposerPrefs,
} from "../../lib/coding-composer-state.js";
import {
  getCodingExtSession,
  loadCodingExtSessions,
  maybeAutoTitleCodingExtSession,
  updateCodingExtSessionRuntime,
} from "../../lib/coding-sessions.js";
import {
  mergeAgentPromptWithAttachments,
  toAgentAttachmentRefs,
} from "../../lib/agent-attachments.js";
import { AgentAttachmentComposerLeading } from "../AgentAttachmentComposerLeading.js";
import { CodingComposerToolbar } from "../CodingComposerToolbar.js";
import { CodingImportSessionModal } from "../CodingImportSessionModal.js";
import { EhChatComposer } from "../ehui/EhChatComposer.js";
import { EhPermissionDock } from "../ehui/EhPermissionDock.js";
import { ExtAgentInstallGuideCard } from "../ExtAgentInstallGuideCard.js";
import { ExtAgentSwitcherInstallDialog } from "../ExtAgentSwitcherInstallDialog.js";

/** Harnesses that emit assistant token deltas via eh:timeline. */
const STREAMING_EXT_HARNESSES = new Set<CodingHarnessId>([
  "codex",
  "claudecode",
]);

export type CodingHarnessPanelProps = {
  harness: CodingHarnessId;
  cwd: string;
  sessionId: string;
  /** Coding task header / sidebar status (busy + probe). */
  onStatusChange?: (status: ExtProbeStatus | null) => void;
  /** Switch to another Ext session (Import session). */
  onSwitchSession?: (sessionId: string) => void;
};

/** @deprecated Use CodingHarnessPanelProps */
export type ExtAgentCodingPanelProps = CodingHarnessPanelProps;

type LocalMsg = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  streaming?: boolean;
};

export function CodingHarnessPanel({
  harness,
  cwd,
  sessionId,
  onStatusChange,
  onSwitchSession,
}: CodingHarnessPanelProps) {
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
  const threadRef = useRef<HTMLDivElement | null>(null);
  const prefsKey = codingComposerSessionKey({ kind: "ext", id: sessionId });
  const caps = useMemo(() => codingComposerCapabilities(harness), [harness]);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<LocalMsg[]>([]);
  /**
   * A tool the agent is waiting to be allowed to run.
   *
   * The node asks only for tools the session's permission policy does not already cover, and the
   * turn is blocked until this is answered (or its timeout denies it) — so this is the one piece of
   * state that must not be lost while the panel is on screen.
   */
  const [pendingPermission, setPendingPermission] = useState<EhPermissionEvent | null>(null);
  const [reach, setReach] = useState<ExtAgentReachability | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<CodingComposerPrefs>(() =>
    loadCodingComposerPrefs(prefsKey),
  );
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);

  const attachments = useEhAttachments(cwd, (message) => setLocalError(message));

  useEffect(() => {
    let next = loadCodingComposerPrefs(prefsKey);
    if (
      caps.permissionAskDisabledReason &&
      next.permissionPolicy === "always-confirm"
    ) {
      next = saveCodingComposerPrefs(prefsKey, {
        permissionPolicy: "safe-only",
      });
    }
    setPrefs(next);
  }, [prefsKey, caps.permissionAskDisabledReason]);

  useEffect(() => {
    const session = getCodingExtSession(sessionId);
    if (session?.model && !prefs.model) {
      setPrefs((p) => {
        const next = saveCodingComposerPrefs(prefsKey, { model: session.model });
        return next;
      });
    }
  }, [sessionId, prefsKey, prefs.model]);

  useEffect(() => {
    let cancelled = false;
    const getCatalog = nodeService.getExtAgentCommandCatalog;
    if (!getCatalog) {
      setModelSuggestions([]);
      return;
    }
    void getCatalog({ agentId })
      .then((cat) => {
        if (cancelled) return;
        setModelSuggestions(cat.models?.map((m) => m.id ?? String(m)) ?? []);
      })
      .catch(() => {
        if (!cancelled) setModelSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, nodeService]);

  const patchPrefs = useCallback(
    (patch: Partial<CodingComposerPrefs>) => {
      const next = saveCodingComposerPrefs(prefsKey, patch);
      setPrefs(next);
      if (patch.model !== undefined || patch.permissionPolicy !== undefined) {
        updateCodingExtSessionRuntime(sessionId, {
          ...(patch.model !== undefined ? { model: patch.model } : {}),
        });
        const session = getCodingExtSession(sessionId);
        void nodeService.setCodingHarnessRuntime?.({
          codingSessionId: sessionId,
          cwd: session?.cwd || cwd,
          runtime: {
            ...(patch.model?.trim()
              ? { model: patch.model.trim() }
              : session?.model
                ? { model: session.model }
                : next.model?.trim()
                  ? { model: next.model.trim() }
                  : {}),
            ...(session?.providerKind
              ? { providerKind: session.providerKind }
              : {}),
            ...(session?.endpoint ? { endpoint: session.endpoint } : {}),
            ...(next.permissionPolicy
              ? { permissionPolicy: next.permissionPolicy }
              : {}),
          },
        });
      }
    },
    [prefsKey, sessionId, cwd, nodeService],
  );

  const refreshProbe = useCallback(async () => {
    try {
      const r = await nodeService.probeExtAgent({ agentId });
      setReach(r);
      return r;
    } catch {
      setReach(null);
      return null;
    }
  }, [agentId, nodeService]);

  useEffect(() => {
    void refreshProbe();
  }, [refreshProbe]);

  /**
   * The agent's tool prompt (`coding:permission`), and the two rules that keep it honest.
   *
   * **Only this session's prompts.** Several Coding tasks can be open at once and the event is
   * broadcast to every client, so a prompt from another session would put a card in front of the
   * wrong conversation — and answering it from here would still reach the right agent, which is
   * worse: the user would be approving a tool they cannot see the context for.
   *
   * **No prompt outlives its turn.** The node expires an unanswered prompt after its own timeout
   * and denies the tool; once the turn is over there is nothing left to answer, so a card that
   * stayed would be a button that does nothing.
   */
  useEffect(() => {
    setPendingPermission(null);
    return nodeService.on("coding:permission", (event) => {
      if (event.sessionId !== sessionId) return;
      setPendingPermission(event);
    });
  }, [nodeService, sessionId]);

  useEffect(() => {
    if (!busy) setPendingPermission(null);
  }, [busy]);

  const streamingAssistant = useMemo(() => {
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
      role: "assistant" as const,
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

  const importRows = useMemo(() => {
    return loadCodingExtSessions()
      .filter(
        (s) =>
          s.id !== sessionId &&
          s.harness === harness &&
          s.cwd === cwd,
      )
      .map((s) => ({
        id: s.id,
        title: s.title,
        subtitle: s.model,
      }));
  }, [sessionId, harness, cwd, importOpen]);

  const send = async () => {
    const text = draft.trim();
    if ((!text && attachments.attachments.length === 0) || busy) return;
    setLocalError(null);

    const latest = await refreshProbe();
    if (
      latest?.installState === "not-installed" ||
      (latest?.installGuide && !latest.installGuide.installed)
    ) {
      setInstallOpen(true);
      return;
    }

    let contextText = "";
    if (attachments.attachments.length > 0 && nodeService.buildAgentAttachmentContext) {
      try {
        const built = await nodeService.buildAgentAttachmentContext({
          attachments: toAgentAttachmentRefs(attachments.attachments),
        });
        contextText = built.contextText?.trim() ?? "";
      } catch (e: unknown) {
        setLocalError(e instanceof Error ? e.message : String(e));
        return;
      }
    }

    const shaped = shapeCodingComposerPrompt(text, prefs, caps);
    const prompt = mergeAgentPromptWithAttachments(shaped, contextText);
    if (!prompt.trim()) return;

    setDraft("");
    attachments.clear();
    const userMsg: LocalMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      text: prompt,
    };
    setMessages((prev) => [...prev, userMsg]);
    maybeAutoTitleCodingExtSession(sessionId, text || prompt);
    setBusy(true);
    try {
      const session = getCodingExtSession(sessionId);
      if (!nodeService.askCodingHarness) {
        throw new Error(
          "askCodingHarness is not available on this home node — update EnvoyMesh.",
        );
      }
      const model = (prefs.model ?? session?.model)?.trim();
      const reply = await nodeService.askCodingHarness({
        codingSessionId: sessionId,
        harness,
        prompt,
        cwd: session?.cwd || cwd,
        runtime: {
          ...(model ? { model } : {}),
          ...(session?.providerKind
            ? { providerKind: session.providerKind }
            : {}),
          ...(session?.endpoint ? { endpoint: session.endpoint } : {}),
          ...(prefs.permissionPolicy
            ? { permissionPolicy: prefs.permissionPolicy }
            : {}),
        },
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

      <div className="ext-agent-coding-panel__composer-stack">
        {pendingPermission ? (
          <EhPermissionDock
            permission={pendingPermission}
            onDismiss={() => setPendingPermission(null)}
            answer={(requestId, allowed) =>
              nodeService.codingRespondToPermission({ requestId, allowed })
            }
          />
        ) : null}
        <form
          className="ext-agent-coding-panel__composer pi-chat-composer eh-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <EhChatComposer
            value={draft}
            onChange={setDraft}
            busy={busy}
            onSubmit={() => void send()}
            placeholder={t(
              "codingView.extAgentPlaceholder",
              "Message {name}…",
              { name: label },
            )}
            hasAttachments={attachments.attachments.length > 0}
            attachLeading={
              <AgentAttachmentComposerLeading
                attachments={attachments.attachments}
                busy={attachments.busy}
                disabled={!cwd}
                pickTitle={t("eh.attachProjectFile", "Attach project file")}
                attachAriaLabel={t("eh.attachProjectFile", "Attach project file")}
                fileInputRef={attachments.fileInputRef}
                onFileInputChange={attachments.handleFileInputChange}
                onOpenPicker={attachments.openPicker}
                onRemove={attachments.remove}
                onClearAll={attachments.clear}
              />
            }
          />
        </form>
        <CodingComposerToolbar
          harness={harness}
          prefs={prefs}
          onPrefsChange={patchPrefs}
          modelSuggestions={modelSuggestions}
          busy={busy}
          onImportSession={() => setImportOpen(true)}
          onFastToggle={(enabled) => {
            if (!caps.fast) return;
            void sendFastSlash(enabled);
          }}
        />
      </div>

      <CodingImportSessionModal
        open={importOpen}
        rows={importRows}
        onClose={() => setImportOpen(false)}
        onPick={(id) => {
          setImportOpen(false);
          onSwitchSession?.(id);
        }}
      />

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

  async function sendFastSlash(enabled: boolean) {
    if (!nodeService.askCodingHarness) return;
    const session = getCodingExtSession(sessionId);
    try {
      await nodeService.askCodingHarness({
        codingSessionId: sessionId,
        harness,
        prompt: fastToggleSlash(enabled),
        cwd: session?.cwd || cwd,
        runtime: {
          ...(session?.model ? { model: session.model } : {}),
          ...(session?.providerKind
            ? { providerKind: session.providerKind }
            : {}),
          ...(session?.endpoint ? { endpoint: session.endpoint } : {}),
        },
      });
    } catch {
      /* best-effort */
    }
  }
}

/** @deprecated Prefer CodingHarnessPanel */
export const ExtAgentCodingPanel = CodingHarnessPanel;
