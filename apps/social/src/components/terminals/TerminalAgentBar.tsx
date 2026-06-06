import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import type {
  TerminalAssistPlan,
  TerminalAssistState,
  TerminalCommandProposal,
  TerminalGoalLoopStepResult,
} from "@envoymesh/api";
import { stripModelThinking } from "@envoymesh/api";

import { useT } from "../../context/I18nContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { saveAssistantLinkedTerminalSessionId } from "../../lib/storage.js";
import {
  parseTerminalSlashCommand,
  terminalSlashHelpText,
  type TerminalPanelMode,
} from "../../lib/terminal-slash-commands.js";

type AgentTurnTone = "info" | "success" | "error";
type AgentTurn =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "system"; text: string; tone?: AgentTurnTone }
  | { id: string; kind: "explain"; text: string };

type AgentTurnInput =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "system"; text: string; tone?: AgentTurnTone }
  | { kind: "explain"; text: string };

interface TerminalAgentBarProps {
  sessionId: string;
  mode: TerminalPanelMode;
  onModeChange: (mode: TerminalPanelMode) => void;
  onEditInTerminal: (command: string) => void;
  onOpenAssistant?: () => void;
  bootstrapPrompt?: string | null;
  onBootstrapPromptConsumed?: () => void;
  onSubmitComplete?: () => void;
}

function cleanAgentDisplayText(text: string): string {
  return stripModelThinking(text).trim();
}

function formatProposalAssistantText(proposal: TerminalCommandProposal): string {
  return `→ ${proposal.command.trim()}`;
}

function formatProposalRationale(rationale: string | undefined): string | undefined {
  if (!rationale?.trim()) return undefined;
  const clean = cleanAgentDisplayText(rationale);
  return clean || undefined;
}

export interface TerminalAgentBarHandle {
  submitLine: (line: string) => Promise<void>;
}

function planStepStatus(
  plan: TerminalAssistPlan,
  index: number,
): "completed" | "skipped" | "current" | "pending" {
  if (plan.completedStepIndices?.includes(index)) return "completed";
  if (plan.skippedStepIndices?.includes(index)) return "skipped";
  if ((plan.currentStepIndex ?? 0) === index) return "current";
  return "pending";
}

export const TerminalAgentBar = forwardRef<TerminalAgentBarHandle, TerminalAgentBarProps>(function TerminalAgentBar(
  {
    sessionId,
    mode,
    onModeChange,
    onEditInTerminal,
    onOpenAssistant,
    bootstrapPrompt,
    onBootstrapPromptConsumed,
    onSubmitComplete,
  },
  ref,
) {
  const nodeService = useNodeService();
  const t = useT();
  const threadRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [assistState, setAssistState] = useState<TerminalAssistState | null>(null);
  const [pending, setPending] = useState<TerminalCommandProposal | null>(null);

  const appendTurn = useCallback((turn: AgentTurnInput) => {
    setTurns((prev) => [...prev, { id: crypto.randomUUID(), ...turn }]);
  }, []);

  const formatAgentError = useCallback(
    (msg: string) => {
      if (msg === "terminal.agent.confirmRequired") return t("terminals.agent.confirmRequired");
      if (msg === "terminal.agent.modelDenied") return t("terminals.agent.modelDenied");
      if (msg.startsWith("terminal.agent.modelDenied:")) {
        return t("terminals.agent.modelDeniedDetail", {
          reason: msg.slice("terminal.agent.modelDenied:".length),
        });
      }
      if (msg === "terminal.agent.modelDisabled") return t("terminals.agent.modelDisabled");
      if (msg === "terminal.agent.modelApprovalRequired") return t("terminals.agent.modelApprovalRequired");
      if (msg === "terminal.agent.promptBlocked") return t("terminals.agent.promptBlocked");
      if (msg === "terminal.agent.openclawUnavailable") return t("terminals.agent.openclawUnavailable");
      if (msg === "terminal.agent.invalidJson") return t("terminals.agent.invalidJson");
      if (msg === "terminal.agent.invalidProposal") return t("terminals.agent.invalidProposal");
      if (msg.startsWith("terminal.agent.modelFailed:")) {
        return t("terminals.agent.modelFailed", { reason: msg.slice("terminal.agent.modelFailed:".length) });
      }
      if (msg.includes("timed out after")) {
        return t("terminals.agent.requestTimeout");
      }
      return msg;
    },
    [t],
  );

  const setMessage = useCallback(
    (text: string, tone: AgentTurnTone = "info") => {
      if (!text.trim()) return;
      const display = tone === "error" ? formatAgentError(text) : cleanAgentDisplayText(text);
      if (!display) return;
      appendTurn({ kind: "system", text: display, tone });
    },
    [appendTurn, formatAgentError],
  );

  const setExplainText = useCallback(
    (text: string) => {
      const clean = cleanAgentDisplayText(text);
      if (!clean) return;
      appendTurn({ kind: "explain", text: clean });
    },
    [appendTurn],
  );

  const finishSubmit = useCallback(() => {
    onSubmitComplete?.();
    inputRef.current?.focus();
  }, [onSubmitComplete]);

  const modelLabel =
    assistState?.assistModelOverride ??
    assistState?.defaultModelName ??
    t("terminals.agent.modelDefault");

  const refreshAssistState = useCallback(async () => {
    try {
      const state = await nodeService.terminalGetAssistState(sessionId);
      setAssistState(state);
      setPending(state.pendingProposal ?? null);
    } catch {
      setAssistState(null);
      setPending(null);
    }
  }, [nodeService, sessionId]);

  const applyGoalLoopResult = useCallback(
    (result: TerminalGoalLoopStepResult) => {
      if (result.proposal) {
        setPending(result.proposal);
      }
      switch (result.status) {
        case "complete":
          setMessage(t("terminals.agent.goalComplete"));
          setPending(null);
          break;
        case "max_steps":
          setMessage(t("terminals.agent.goalMaxSteps", { count: result.stepCount }));
          break;
        case "failed_output":
          setMessage(t("terminals.agent.goalFailedOutput"));
          break;
        case "awaiting_confirm":
          setMessage(
            t("terminals.agent.goalAwaitingConfirm", {
              step: result.stepCount,
              max: assistState?.goalLoop?.maxSteps ?? 10,
            }),
          );
          break;
        case "continuing":
          setMessage(t("terminals.agent.goalContinuing", { step: result.stepCount }));
          break;
        default:
          break;
      }
    },
    [assistState?.goalLoop?.maxSteps, setMessage, t],
  );

  const advanceGoalLoop = useCallback(async () => {
    let result = await nodeService.terminalAdvanceGoalLoop({ sessionId });
    applyGoalLoopResult(result);
    while (result.status === "continuing" && result.executed) {
      result = await nodeService.terminalAdvanceGoalLoop({ sessionId });
      applyGoalLoopResult(result);
    }
    await refreshAssistState();
  }, [applyGoalLoopResult, nodeService, refreshAssistState, sessionId]);

  useEffect(() => {
    void refreshAssistState();
    setTurns([]);
    setShowHelpPanel(false);
  }, [refreshAssistState, sessionId]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy, pending]);

  useEffect(() => {
    return nodeService.on("terminal:assistant-proposal", (event) => {
      if (event.sessionId !== sessionId) return;
      void refreshAssistState().then(() => {
        void nodeService.terminalGetAssistState(sessionId).then((state) => {
          if (state.pendingProposal) setPending(state.pendingProposal);
        });
      });
    });
  }, [nodeService, refreshAssistState, sessionId]);

  useEffect(() => {
    if (mode === "agent") {
      threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [mode, sessionId]);

  useEffect(() => {
    const prompt = bootstrapPrompt?.trim();
    if (!prompt || busy) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      try {
        appendTurn({ kind: "user", text: prompt });
        const proposal = await nodeService.terminalRunFromNaturalLanguage({ sessionId, prompt });
        if (!cancelled) {
          setPending(proposal);
          appendTurn({
            kind: "assistant",
            text: formatProposalAssistantText(proposal),
          });
          await refreshAssistState();
        }
      } catch (e: unknown) {
        if (!cancelled) setMessage(formatAgentError(e instanceof Error ? e.message : String(e)), "error");
      } finally {
        if (!cancelled) {
          setBusy(false);
          finishSubmit();
        }
        onBootstrapPromptConsumed?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appendTurn, bootstrapPrompt, busy, finishSubmit, nodeService, onBootstrapPromptConsumed, refreshAssistState, sessionId, setMessage, t]);

  const runProposal = useCallback(
    async (proposal: TerminalCommandProposal, confirmed: boolean) => {
      setBusy(true);
      try {
        await nodeService.terminalExecuteProposal({
          sessionId,
          proposalId: proposal.proposalId,
          confirmed: proposal.requiresConfirmation ? confirmed : undefined,
        });
        setPending(null);
        setMessage(t("terminals.agent.executed"), "success");
        await refreshAssistState();
        const state = await nodeService.terminalGetAssistState(sessionId);
        if (state.goalLoop?.active) {
          await advanceGoalLoop();
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setMessage(formatAgentError(msg === "terminal.agent.confirmRequired" ? t("terminals.agent.confirmRequired") : msg), "error");
      } finally {
        setBusy(false);
      }
    },
    [advanceGoalLoop, nodeService, refreshAssistState, sessionId, setMessage, t],
  );

  const handleSuggestFix = useCallback(async () => {
    setBusy(true);
    try {
      const proposal = await nodeService.terminalSuggestFixFromFailure({ sessionId });
      setPending(proposal);
      await refreshAssistState();
      setMessage(t("terminals.agent.suggestFixReady"));
    } catch (e: unknown) {
      setMessage(formatAgentError(e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setBusy(false);
    }
  }, [nodeService, refreshAssistState, sessionId, setMessage, t]);

  const handleAskEnvoyAi = useCallback(async () => {
    setBusy(true);
    try {
      const result = await nodeService.terminalSendContextToAssistant({ sessionId });
      await refreshAssistState();
      const state = await nodeService.terminalGetAssistState(sessionId);
      if (state.pendingProposal) {
        setPending(state.pendingProposal);
      }
      saveAssistantLinkedTerminalSessionId(sessionId);
      setMessage(t("terminals.agent.assistantSent", { preview: result.answerPreview.slice(0, 120) }));
      onOpenAssistant?.();
    } catch (e: unknown) {
      setMessage(formatAgentError(e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setBusy(false);
    }
  }, [nodeService, onOpenAssistant, refreshAssistState, sessionId, setMessage, t]);

  const handleProposePlanStep = useCallback(
    async (stepIndex: number) => {
      const plan = assistState?.activePlan;
      if (!plan) return;
      setBusy(true);
      try {
        const proposal = await nodeService.terminalRunPlanStep({
          sessionId,
          planId: plan.planId,
          stepIndex,
        });
        setPending(proposal);
        await refreshAssistState();
        setMessage(t("terminals.agent.planStep", { step: stepIndex + 1 }));
      } catch (e: unknown) {
        setMessage(formatAgentError(e instanceof Error ? e.message : String(e)), "error");
      } finally {
        setBusy(false);
      }
    },
    [assistState?.activePlan, nodeService, refreshAssistState, sessionId, setMessage, t],
  );

  const handleSkipPlanStep = useCallback(
    async (stepIndex: number) => {
      const plan = assistState?.activePlan;
      if (!plan) return;
      setBusy(true);
      try {
        await nodeService.terminalUpdatePlanProgress({
          sessionId,
          planId: plan.planId,
          skippedStepIndex: stepIndex,
        });
        await refreshAssistState();
        setMessage(t("terminals.agent.planStepSkipped", { step: stepIndex + 1 }));
      } catch (e: unknown) {
        setMessage(formatAgentError(e instanceof Error ? e.message : String(e)), "error");
      } finally {
        setBusy(false);
      }
    },
    [assistState?.activePlan, nodeService, refreshAssistState, sessionId, setMessage, t],
  );

  const handleSubmit = useCallback(
    async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      setShowHelpPanel(false);

      const action = parseTerminalSlashCommand(trimmed);
      if (!action) {
        setBusy(false);
        finishSubmit();
        return;
      }

      try {
        switch (action.type) {
          case "help":
            setShowHelpPanel(true);
            setMessage(t("terminals.agent.helpOpened"));
            break;
        case "manual":
          onModeChange("manual");
          setMessage(t("terminals.agent.switchedManual"));
          break;
        case "agent":
          onModeChange("agent");
          setMessage(t("terminals.agent.switchedAgent"));
          break;
        case "model_show":
          setMessage(t("terminals.agent.currentModel", { model: modelLabel }));
          break;
        case "model_list": {
          const cfg = await nodeService.getNodeConfig();
          const names = [
            cfg.terminalAssistModelName,
            cfg.modelProviders.modelName,
            cfg.modelProviders.mode,
          ].filter(Boolean);
          setMessage(names.length ? names.join(", ") : t("terminals.agent.modelDefault"));
          break;
        }
        case "model_set":
          await nodeService.terminalSetAssistModelOverride({ sessionId, modelName: action.modelName });
          await refreshAssistState();
          setMessage(t("terminals.agent.modelSet", { model: action.modelName }));
          break;
        case "model_default":
          await nodeService.terminalSetAssistModelOverride({ sessionId, modelName: "" });
          await refreshAssistState();
          setMessage(t("terminals.agent.modelCleared"));
          break;
        case "explain": {
          const result = await nodeService.terminalExplainScrollback({
            sessionId,
            topic: action.topic,
          });
          setExplainText(result.explanation);
          break;
        }
        case "suggest_on":
          await nodeService.terminalSetInlineSuggestEnabled({ sessionId, enabled: true });
          await refreshAssistState();
          setMessage(t("terminals.agent.suggestOn"));
          onModeChange("manual");
          break;
        case "suggest_off":
          await nodeService.terminalSetInlineSuggestEnabled({ sessionId, enabled: false });
          await refreshAssistState();
          setMessage(t("terminals.agent.suggestOff"));
          break;
        case "run":
          if (pending) {
            await runProposal(pending, true);
          } else {
            setMessage(t("terminals.agent.noPending"));
          }
          break;
        case "confirm":
          if (pending) {
            await runProposal(pending, true);
          } else {
            setMessage(t("terminals.agent.noPending"));
          }
          break;
        case "cancel":
          setPending(null);
          setMessage(t("terminals.agent.cancelled"));
          break;
        case "history": {
          const state = await nodeService.terminalGetAssistState(sessionId);
          const rows = (state.recentProposals ?? []).map(
            (p) => `[${p.riskTier}] ${p.command} (${p.createdAt})`,
          );
          setMessage(rows.length ? rows.join("\n") : t("terminals.agent.noHistory"));
          break;
        }
        case "observe": {
          const goal = assistState?.goalLoop?.goal ?? assistState?.lastGoal;
          if (!goal) {
            setMessage(t("terminals.agent.noGoal"));
            break;
          }
          setMessage(t("terminals.agent.observing"));
          const result = await nodeService.terminalObserveStep({ sessionId, goal });
          if (result.nextProposal) {
            setPending(result.nextProposal);
            await refreshAssistState();
            setMessage(
              result.stable
                ? t("terminals.agent.observeReady")
                : t("terminals.agent.observeTimeout"),
            );
          } else {
            setMessage(
              result.stable ? t("terminals.agent.observeStable") : t("terminals.agent.observeTimeout"),
            );
          }
          break;
        }
        case "openclaw": {
          await nodeService.terminalOpenClawPlan({
            sessionId,
            prompt: action.prompt,
          });
          await refreshAssistState();
          setMessage(t("terminals.agent.planReadyShort"));
          break;
        }
        case "prepare_on": {
          const result = await nodeService.terminalEnablePrepareMode({ sessionId, enabled: true });
          await refreshAssistState();
          setMessage(
            result.markerWritten
              ? t("terminals.agent.prepareOn")
              : t("terminals.agent.prepareFailed"),
          );
          break;
        }
        case "prepare_off": {
          await nodeService.terminalEnablePrepareMode({ sessionId, enabled: false });
          await refreshAssistState();
          setMessage(t("terminals.agent.prepareOff"));
          break;
        }
        case "watch": {
          const goal = action.goal || assistState?.lastGoal || assistState?.watchGoal;
          if (!goal) {
            setMessage(t("terminals.agent.noGoal"));
            break;
          }
          const result = await nodeService.terminalWatchStep({ sessionId, goal });
          if (result.proposal) {
            setPending(result.proposal);
            await refreshAssistState();
            setMessage(t("terminals.agent.watchProposal"));
          } else {
            setMessage(
              result.changed ? t("terminals.agent.watchChanged") : t("terminals.agent.watchNoChange"),
            );
          }
          break;
        }
        case "pin": {
          await nodeService.terminalPinContextSession({
            sessionId,
            contextSessionId: action.contextSessionId,
          });
          await refreshAssistState();
          setMessage(
            action.contextSessionId
              ? t("terminals.agent.pinned", { sessionId: action.contextSessionId })
              : t("terminals.agent.unpinned"),
          );
          break;
        }
        case "step": {
          await handleProposePlanStep(action.stepIndex);
          break;
        }
        case "goal": {
          const result = await nodeService.terminalStartGoalLoop({
            sessionId,
            goal: action.prompt,
          });
          applyGoalLoopResult(result);
          await refreshAssistState();
          if (result.status === "continuing" && result.executed) {
            await advanceGoalLoop();
          }
          break;
        }
        case "goal_stop": {
          await nodeService.terminalCancelGoalLoop({ sessionId });
          await refreshAssistState();
          setMessage(t("terminals.agent.goalStopped"));
          break;
        }
        case "goal_continue": {
          await advanceGoalLoop();
          break;
        }
        case "watchbg": {
          await nodeService.terminalSetBackgroundWatch({ sessionId, goal: action.goal });
          await refreshAssistState();
          setMessage(t("terminals.agent.watchBgOn"));
          break;
        }
        case "watchbg_off": {
          await nodeService.terminalClearBackgroundWatch({ sessionId });
          await refreshAssistState();
          setMessage(t("terminals.agent.watchBgOff"));
          break;
        }
        case "exec_on": {
          await nodeService.terminalEnableExecPane({ sessionId, enabled: true });
          await refreshAssistState();
          setMessage(t("terminals.agent.execPaneOn"));
          break;
        }
        case "exec_off": {
          await nodeService.terminalEnableExecPane({ sessionId, enabled: false });
          await refreshAssistState();
          setMessage(t("terminals.agent.execPaneOff"));
          break;
        }
        case "nl": {
          appendTurn({ kind: "user", text: action.prompt });
          const proposal = await nodeService.terminalRunFromNaturalLanguage({
            sessionId,
            prompt: action.prompt,
          });
          setPending(proposal);
          appendTurn({
            kind: "assistant",
            text: formatProposalAssistantText(proposal),
          });
          await refreshAssistState();
          const state = await nodeService.terminalGetAssistState(sessionId);
          if (!state.pendingProposal && state.autoRunPolicy === "safe-only") {
            setPending(null);
            setMessage(t("terminals.agent.executed"), "success");
          }
          break;
        }
        default:
          break;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(formatAgentError(msg), "error");
    } finally {
      setBusy(false);
      finishSubmit();
    }
  }, [
    appendTurn,
    advanceGoalLoop,
    applyGoalLoopResult,
    assistState?.autoRunPolicy,
    assistState?.goalLoop?.goal,
    assistState?.inlineSuggestEnabled,
    assistState?.lastGoal,
    assistState?.watchGoal,
    busy,
    handleProposePlanStep,
    mode,
    modelLabel,
    nodeService,
    onModeChange,
    finishSubmit,
    pending,
    refreshAssistState,
    runProposal,
    sessionId,
    setMessage,
    setExplainText,
    t,
  ]);

  useImperativeHandle(ref, () => ({ submitLine: handleSubmit }), [handleSubmit]);

  const submitDraft = useCallback(
    (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || busy) return;
      setDraft("");
      void handleSubmit(trimmed);
    },
    [busy, handleSubmit],
  );

  const handleDismissResumeGoal = useCallback(async () => {
    setBusy(true);
    try {
      await nodeService.terminalClearResumeGoal(sessionId);
      await refreshAssistState();
    } catch (e: unknown) {
      setMessage(formatAgentError(e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setBusy(false);
    }
  }, [formatAgentError, nodeService, refreshAssistState, sessionId, setMessage]);

  useEffect(() => {
    if (mode === "agent") {
      inputRef.current?.focus();
    }
  }, [mode, sessionId]);

  const helpText = terminalSlashHelpText({
    mode,
    modelLabel,
    autoRunPolicy: assistState?.autoRunPolicy ?? "always-confirm",
    inlineSuggest: assistState?.inlineSuggestEnabled ?? false,
  });

  const activePlan = assistState?.activePlan;
  const goalLoop = assistState?.goalLoop;
  const lastFailure = assistState?.lastFailure;
  const showResume =
    assistState?.canResumeGoal && !goalLoop?.active && (assistState.resumeGoal?.trim() ?? "");
  const fromEnvoyAi =
    Boolean(pending) &&
    Boolean(assistState?.assistantProposal) &&
    pending?.proposalId === assistState?.assistantProposal?.proposalId;
  const execPaneEnabled = assistState?.execPaneEnabled ?? false;

  const handleToggleExecPane = useCallback(async () => {
    setBusy(true);
    try {
      await nodeService.terminalEnableExecPane({ sessionId, enabled: !execPaneEnabled });
      await refreshAssistState();
      setMessage(execPaneEnabled ? t("terminals.agent.execPaneOff") : t("terminals.agent.execPaneOn"));
    } catch (e: unknown) {
      setMessage(formatAgentError(e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setBusy(false);
    }
  }, [execPaneEnabled, nodeService, refreshAssistState, sessionId, setMessage, t]);

  const handleResumeGoal = useCallback(async () => {
    setBusy(true);
    try {
      const result = await nodeService.terminalResumeGoalLoop({ sessionId });
      applyGoalLoopResult(result);
      await refreshAssistState();
    } catch (e: unknown) {
      setMessage(formatAgentError(e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setBusy(false);
    }
  }, [applyGoalLoopResult, nodeService, refreshAssistState, sessionId, setMessage]);

  if (mode !== "agent") {
    return null;
  }

  const showThread = turns.length > 0 || busy || showHelpPanel;

  return (
    <div className="terminal-agent-overlay" aria-label={t("terminals.agent.threadTitle")}>
      {(showResume || goalLoop?.active || lastFailure?.failed) && (
        <div className="terminal-agent-alerts">
          {showResume ? (
            <div className="terminal-goal-resume-banner">
              <span>{t("terminals.agent.resumeGoal", { goal: assistState?.resumeGoal ?? "" })}</span>
              <button type="button" disabled={busy} onClick={() => void handleResumeGoal()}>
                {t("terminals.agent.resumeGoalAction")}
              </button>
              <button type="button" disabled={busy} onClick={() => void handleDismissResumeGoal()}>
                {t("terminals.agent.resumeGoalDismiss")}
              </button>
            </div>
          ) : null}

          {goalLoop?.active ? (
            <div className="terminal-goal-loop-banner">
              <span>
                {t("terminals.agent.goalActive", {
                  goal: goalLoop.goal ?? "",
                  step: goalLoop.stepCount,
                  max: goalLoop.maxSteps,
                })}
              </span>
              <button type="button" disabled={busy} onClick={() => void advanceGoalLoop()}>
                {t("terminals.agent.goalContinue")}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  void nodeService.terminalCancelGoalLoop({ sessionId }).then(() => refreshAssistState());
                }}
              >
                {t("terminals.agent.goalStop")}
              </button>
            </div>
          ) : null}

          {lastFailure?.failed ? (
            <div className="terminal-failure-chip-row">
              <span className="terminal-failure-chip-label">{t("terminals.agent.failureDetected")}</span>
              <button type="button" disabled={busy} onClick={() => void handleSuggestFix()}>
                {t("terminals.agent.suggestFix")}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  void nodeService
                    .terminalExplainScrollback({ sessionId, topic: "Explain the failure in the terminal output" })
                    .then((r) => setExplainText(r.explanation))
                    .catch((e: unknown) =>
                      setMessage(formatAgentError(e instanceof Error ? e.message : String(e)), "error"),
                    );
                }}
              >
                {t("terminals.agent.explainFailure")}
              </button>
            </div>
          ) : null}
        </div>
      )}

      {activePlan ? (
        <details className="terminal-plan-checklist" open={activePlan.currentStepIndex !== undefined}>
          <summary className="terminal-plan-checklist-title">{activePlan.title}</summary>
          <ol className="terminal-plan-steps">
            {activePlan.steps.map((step, index) => {
              const status = planStepStatus(activePlan, index);
              return (
                <li key={`${activePlan.planId}-${index}`} className={`terminal-plan-step terminal-plan-step-${status}`}>
                  <span className="terminal-plan-step-label">{step}</span>
                  {status !== "completed" && status !== "skipped" ? (
                    <span className="terminal-plan-step-actions">
                      <button type="button" disabled={busy} onClick={() => void handleProposePlanStep(index)}>
                        {t("terminals.agent.planPropose")}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => void handleSkipPlanStep(index)}
                      >
                        {t("terminals.agent.planSkip")}
                      </button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </details>
      ) : null}

      {pending ? (
        <div className={`terminal-proposal terminal-proposal-dock terminal-proposal-${pending.riskTier}`}>
          <div className="terminal-proposal-header">
            {fromEnvoyAi ? (
              <span className="terminal-proposal-source">{t("terminals.agent.fromEnvoyAi")}</span>
            ) : null}
            <span className={`terminal-risk-badge terminal-risk-${pending.riskTier}`}>
              {pending.riskTier === "safe"
                ? t("terminals.agent.riskSafe")
                : pending.riskTier === "moderate"
                  ? t("terminals.agent.riskModerate")
                  : t("terminals.agent.riskDestructive")}
            </span>
            <code className="terminal-proposal-command">{pending.command}</code>
          </div>
          {formatProposalRationale(pending.rationale) ? (
            <p className="terminal-proposal-rationale">{formatProposalRationale(pending.rationale)}</p>
          ) : null}
          <div className="terminal-proposal-actions">
            <button type="button" disabled={busy} onClick={() => void runProposal(pending, true)}>
              {pending.requiresConfirmation ? t("terminals.agent.confirmRun") : t("terminals.agent.run")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onEditInTerminal(pending.command);
                onModeChange("manual");
              }}
            >
              {t("terminals.agent.editInTerminal")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPending(null);
                setMessage(t("terminals.agent.cancelled"));
              }}
            >
              {t("terminals.agent.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {showThread ? (
        <div ref={threadRef} className="terminal-agent-thread" aria-live="polite">
          {turns.map((turn) => (
            <div
              key={turn.id}
              className={`terminal-agent-turn terminal-agent-turn-${turn.kind}${
                turn.kind === "system" && turn.tone ? ` terminal-agent-turn-${turn.tone}` : ""
              }`}
            >
              {turn.kind === "user" ? (
                <div className="terminal-agent-turn-bubble">{cleanAgentDisplayText(turn.text)}</div>
              ) : turn.kind === "assistant" ? (
                <div className="terminal-agent-turn-bubble">{cleanAgentDisplayText(turn.text)}</div>
              ) : turn.kind === "explain" ? (
                <pre className="terminal-agent-turn-explain">{turn.text}</pre>
              ) : (
                <p className="terminal-agent-turn-system">{turn.text}</p>
              )}
            </div>
          ))}
          {busy ? <div className="terminal-agent-turn terminal-agent-turn-busy">{t("terminals.agent.thinking")}</div> : null}
        </div>
      ) : null}

      {showHelpPanel ? (
        <details className="terminal-agent-help" open>
          <summary>{t("terminals.agent.quickHelp")}</summary>
          <pre className="terminal-agent-help-body">{helpText}</pre>
        </details>
      ) : null}

      <div className="terminal-agent-prompt-actions">
        <button
          type="button"
          className={execPaneEnabled ? "active" : "secondary"}
          disabled={busy}
          title={t("terminals.agent.execPaneToggle")}
          onClick={() => void handleToggleExecPane()}
        >
          exec
        </button>
        {onOpenAssistant ? (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            title={t("terminals.agent.askEnvoyAi")}
            onClick={() => void handleAskEnvoyAi()}
          >
            AI
          </button>
        ) : null}
      </div>

      <form
        className="terminal-agent-prompt-row"
        onSubmit={(event) => {
          event.preventDefault();
          submitDraft(draft);
        }}
      >
        <span className="terminal-agent-prompt-label">envoy</span>
        <span className="terminal-agent-prompt-chevron">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          className="terminal-agent-inline-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={busy}
          placeholder={t("terminals.agent.promptPlaceholder")}
          aria-label={t("terminals.agent.promptAria")}
          autoComplete="off"
          spellCheck={false}
        />
      </form>
    </div>
  );
});
