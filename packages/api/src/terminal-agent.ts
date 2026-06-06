export type TerminalCommandRiskTier = "safe" | "moderate" | "destructive";

/** WebSocket / home-remote RPC budget for terminal assist calls that invoke an LLM. */
export const TERMINAL_ASSIST_RPC_TIMEOUT_MS = 120_000;

/** When safe proposals may auto-execute after generation. Default: always-confirm. */
export type TerminalAutoRunPolicy = "off" | "safe-only" | "always-confirm";

export interface TerminalCommandProposal {
  proposalId: string;
  sessionId: string;
  command: string;
  riskTier: TerminalCommandRiskTier;
  rationale?: string;
  requiresConfirmation: boolean;
  createdAt: string;
}

export interface TerminalAssistPlan {
  planId: string;
  sessionId: string;
  title: string;
  steps: string[];
  createdAt: string;
  source: "openclaw" | "manual";
  completedStepIndices?: number[];
  skippedStepIndices?: number[];
  currentStepIndex?: number;
}

export interface TerminalFailureDetection {
  failed: boolean;
  snippet?: string;
  reason?: string;
}

export interface TerminalDetectFailureParams {
  sessionId: string;
}

export interface TerminalSuggestFixParams {
  sessionId: string;
}

export interface TerminalStartGoalLoopParams {
  sessionId: string;
  goal: string;
  maxSteps?: number;
}

export interface TerminalAdvanceGoalLoopParams {
  sessionId: string;
}

export interface TerminalCancelGoalLoopParams {
  sessionId: string;
}

export type TerminalGoalLoopStepStatus =
  | "complete"
  | "awaiting_confirm"
  | "continuing"
  | "failed_output"
  | "max_steps";

export interface TerminalGoalLoopState {
  active: boolean;
  goal?: string;
  stepCount: number;
  maxSteps: number;
}

export interface TerminalGoalLoopStepResult {
  status: TerminalGoalLoopStepStatus;
  stepCount: number;
  goal?: string;
  proposal?: TerminalCommandProposal;
  executed?: boolean;
  failure?: TerminalFailureDetection;
}

export interface TerminalSendContextToAssistantParams {
  sessionId: string;
  userPrompt?: string;
  maxBytes?: number;
}

export interface TerminalSendContextToAssistantResult {
  correlationId: string;
  answerPreview: string;
}

export interface TerminalUpdatePlanProgressParams {
  sessionId: string;
  planId: string;
  completedStepIndex?: number;
  skippedStepIndex?: number;
}

export interface TerminalGetScrollbackPreviewParams {
  sessionId: string;
  maxBytes?: number;
}

export interface TerminalGetScrollbackPreviewResult {
  sessionId: string;
  scrollback: string;
}

export interface TerminalResumeGoalLoopParams {
  sessionId: string;
}

export interface TerminalRunFromNaturalLanguageParams {
  sessionId: string;
  prompt: string;
}

export interface TerminalExecuteProposalParams {
  sessionId: string;
  proposalId: string;
  confirmed?: boolean;
}

export interface TerminalSetAssistModelOverrideParams {
  sessionId: string;
  modelName?: string;
}

export interface TerminalSetInlineSuggestParams {
  sessionId: string;
  enabled: boolean;
}

export interface TerminalExplainScrollbackParams {
  sessionId: string;
  topic?: string;
}

export interface TerminalExplainScrollbackResult {
  explanation: string;
}

export interface TerminalSuggestCommandParams {
  sessionId: string;
  partialInput: string;
}

export interface TerminalSuggestCommandResult {
  suggestions: string[];
  completion?: string;
}

export interface TerminalObserveStepParams {
  sessionId: string;
  goal?: string;
  timeoutMs?: number;
  stableMs?: number;
}

export interface TerminalObserveStepResult {
  stable: boolean;
  waitedMs: number;
  scrollbackBytes: number;
  nextProposal?: TerminalCommandProposal;
}

export interface TerminalOpenClawPlanParams {
  sessionId: string;
  prompt: string;
}

export interface TerminalOpenClawPlanResult {
  plan: TerminalAssistPlan;
  preamble?: string;
}

export interface TerminalRunPlanStepParams {
  sessionId: string;
  planId: string;
  stepIndex: number;
}

export interface TerminalEnablePrepareModeParams {
  sessionId: string;
  enabled: boolean;
}

export interface TerminalEnablePrepareModeResult {
  enabled: boolean;
  markerWritten: boolean;
}

export interface TerminalWatchStepParams {
  sessionId: string;
  goal: string;
  lastScrollbackBytes?: number;
}

export interface TerminalWatchStepResult {
  scrollbackBytes: number;
  changed: boolean;
  note?: string;
  proposal?: TerminalCommandProposal;
}

export interface TerminalPinContextSessionParams {
  sessionId: string;
  /** Omit or empty to unpin. */
  contextSessionId?: string;
}

export interface TerminalAssistTurnRecord {
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}

export interface TerminalEnableExecPaneParams {
  sessionId: string;
  enabled: boolean;
}

export interface TerminalEnableExecPaneResult {
  enabled: boolean;
  execSessionId?: string;
}

export interface TerminalSetBackgroundWatchParams {
  sessionId: string;
  goal: string;
  stableMs?: number;
}

export interface TerminalClearBackgroundWatchParams {
  sessionId: string;
}

export interface TerminalBackgroundWatchState {
  active: boolean;
  goal?: string;
  stableMs?: number;
}

export interface TerminalWatchReadyEvent {
  sessionId: string;
  goal: string;
  stable: boolean;
  proposal?: TerminalCommandProposal;
  note?: string;
}

export interface TerminalAssistantProposalEvent {
  sessionId: string;
  proposal?: TerminalCommandProposal;
}

export interface TerminalAssistState {
  sessionId: string;
  assistModelOverride?: string;
  defaultModelName?: string;
  pendingProposal?: TerminalCommandProposal;
  autoRunPolicy?: TerminalAutoRunPolicy;
  inlineSuggestEnabled?: boolean;
  agentModeDefault?: boolean;
  lastGoal?: string;
  recentProposals?: TerminalCommandProposal[];
  activePlan?: TerminalAssistPlan;
  prepareModeEnabled?: boolean;
  watchGoal?: string;
  pinnedContextSessionId?: string;
  goalLoop?: TerminalGoalLoopState;
  lastFailure?: TerminalFailureDetection;
  canResumeGoal?: boolean;
  resumeGoal?: string;
  execPaneEnabled?: boolean;
  execSessionId?: string;
  assistantCorrelationId?: string;
  assistantProposal?: TerminalCommandProposal;
  backgroundWatch?: TerminalBackgroundWatchState;
}

export interface TerminalAssistSettingsSnapshot {
  /** Optional override — when unset, terminal assist uses {@link chatModelName}. */
  terminalAssistModelName?: string;
  /** Primary chat model from Settings → AI (modelProviders.modelName). */
  chatModelName?: string;
  terminalCommandAllowPatterns?: readonly string[];
  terminalCommandDenyPatterns?: readonly string[];
  terminalCommandDestructivePatterns?: readonly string[];
  terminalAgentModeDefault?: boolean;
  terminalAutoRunPolicy?: TerminalAutoRunPolicy;
  terminalInlineSuggestEnabled?: boolean;
}
