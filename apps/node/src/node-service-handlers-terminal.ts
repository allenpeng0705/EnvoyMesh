/**
 * Terminal manager + terminal-agent-assist public API runtime (Step 33).
 *
 * Extracted from `node-service-impl.ts`. Owns all the public terminal
 * methods (~25 methods) that are 1-line delegations to the terminal
 * manager or terminal agent-assist. The runtime takes a loose
 * `any`-typed context.
 *
 * Methods extracted:
 *   - terminalAttach, terminalRunFromNaturalLanguage,
 *     terminalExecuteProposal, terminalSetAssistModelOverride,
 *     terminalGetAssistState, terminalExplainScrollback,
 *     terminalSuggestCommand, terminalObserveStep,
 *     terminalSetInlineSuggestEnabled, terminalOpenClawPlan,
 *     terminalRunPlanStep, terminalEnablePrepareMode,
 *     terminalWatchStep, terminalPinContextSession,
 *     terminalDetectFailure, terminalSuggestFixFromFailure,
 *     terminalStartGoalLoop, terminalAdvanceGoalLoop,
 *     terminalCancelGoalLoop, terminalClearResumeGoal,
 *     terminalSendContextToAssistant, terminalUpdatePlanProgress,
 *     terminalGetScrollbackPreview, terminalResumeGoalLoop,
 *     terminalEnableExecPane, terminalEnqueueAssistJob,
 *     terminalGetHerdrStatus, terminalSyncHerdrEnvs,
 *     terminalEnrichEnvsViaHerdr
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export function terminalAttachViaRuntime(deps: any, params: any): any {
  return Promise.resolve(deps.requireTerminalManager().terminalAttach(params));
}

export function terminalRunFromNaturalLanguageViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().runFromNaturalLanguage(params);
}

export function terminalExecuteProposalViaRuntime(
  deps: any,
  params: any,
): Promise<void> {
  return deps.requireTerminalAgentAssist().executeProposal(params);
}

export function terminalSetAssistModelOverrideViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().setAssistModelOverride(params);
}

export function terminalGetAssistStateViaRuntime(
  deps: any,
  sessionId: string,
): any {
  return deps.requireTerminalAgentAssist().getAssistState(sessionId.trim());
}

export function terminalExplainScrollbackViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().explainScrollback(params);
}

export function terminalSuggestCommandViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().suggestCommand(params);
}

export function terminalObserveStepViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().observeStep(params);
}

export function terminalSetInlineSuggestEnabledViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().setInlineSuggestEnabled(params);
}

export function terminalOpenClawPlanViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().openClawPlan(params);
}

export function terminalRunPlanStepViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().runPlanStep(params);
}

export function terminalEnablePrepareModeViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().enablePrepareMode(params);
}

export function terminalWatchStepViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().watchStep(params);
}

export function terminalPinContextSessionViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().pinContextSession(params);
}

export function terminalDetectFailureViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().detectFailure(params);
}

export function terminalSuggestFixFromFailureViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().suggestFixFromFailure(params);
}

export function terminalStartGoalLoopViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().startGoalLoop(params);
}

export function terminalAdvanceGoalLoopViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().advanceGoalLoop(params);
}

export function terminalCancelGoalLoopViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().cancelGoalLoop(params);
}

export function terminalClearResumeGoalViaRuntime(
  deps: any,
  sessionId: string,
): any {
  return deps.requireTerminalAgentAssist().clearResumeGoal({ sessionId });
}

export function terminalSendContextToAssistantViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().sendContextToAssistant(params);
}

export function terminalUpdatePlanProgressViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().updatePlanProgress(params);
}

export function terminalGetScrollbackPreviewViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().getScrollbackPreview(params);
}

export function terminalResumeGoalLoopViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().resumeGoalLoop(params);
}

export function terminalEnableExecPaneViaRuntime(
  deps: any,
  params: any,
): any {
  return deps.requireTerminalAgentAssist().enableExecPane(params);
}