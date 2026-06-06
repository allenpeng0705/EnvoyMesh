import { randomUUID, createHash } from "node:crypto";

import {
  stripModelThinking,
  type ModelProviderConfig,
  type TerminalAssistSettingsSnapshot,
  type TerminalAssistState,
  type TerminalAssistTurnRecord,
  type TerminalCancelGoalLoopParams,
  type TerminalClearBackgroundWatchParams,
  type TerminalCommandProposal,
  type TerminalAdvanceGoalLoopParams,
  type TerminalDetectFailureParams,
  type TerminalEnableExecPaneParams,
  type TerminalEnableExecPaneResult,
  type TerminalFailureDetection,
  type TerminalGoalLoopStepResult,
  type TerminalEnablePrepareModeParams,
  type TerminalEnablePrepareModeResult,
  type TerminalExecuteProposalParams,
  type TerminalExplainScrollbackParams,
  type TerminalExplainScrollbackResult,
  type TerminalObserveStepParams,
  type TerminalObserveStepResult,
  type TerminalOpenClawPlanParams,
  type TerminalOpenClawPlanResult,
  type TerminalPinContextSessionParams,
  type TerminalRunFromNaturalLanguageParams,
  type TerminalRunPlanStepParams,
  type TerminalResumeGoalLoopParams,
  type TerminalGetScrollbackPreviewParams,
  type TerminalGetScrollbackPreviewResult,
  type TerminalSendContextToAssistantParams,
  type TerminalSendContextToAssistantResult,
  type TerminalSetAssistModelOverrideParams,
  type TerminalSetInlineSuggestParams,
  type TerminalSetBackgroundWatchParams,
  type TerminalStartGoalLoopParams,
  type TerminalSuggestFixParams,
  type TerminalSuggestCommandParams,
  type TerminalSuggestCommandResult,
  type TerminalUpdatePlanProgressParams,
  type TerminalWatchStepParams,
  type TerminalWatchStepResult,
  type TerminalWatchReadyEvent,
} from "@envoymesh/api";
import { createAuditEvent, type LocalTaskStore } from "@envoymesh/local-store";
import {
  buildModelProviders,
  compileTerminalCommandPatterns,
  evaluateEgressContent,
  parseTerminalCommandProposal,
  parseTerminalSuggestResponse,
  resolveProposalRisk,
  routeModelRequest,
  inferTerminalCommandFallback,
} from "@envoymesh/models";

import {
  buildTerminalAssistPrompt,
  buildTerminalExplainPrompt,
  buildTerminalSuggestPrompt,
  scrubTerminalScrollback,
  squashTerminalTurnHistory,
} from "./terminal-assist-prompt.js";
import {
  formatAssistContextBlock,
  loadAssistContextSnippets,
  stripAssistContextMarkers,
  type TerminalAssistContextReaders,
} from "./terminal-assist-context.js";
import {
  savePersistedAssistState,
  sessionToPersisted,
  type PersistedAssistSession,
  type PersistedAssistStateFile,
} from "./terminal-assist-persist.js";
import { commandFromPlanStep, parseNumberedPlanSteps } from "./terminal-plan-parser.js";
import { detectGoalSuccess, detectTerminalFailure } from "./terminal-failure-detect.js";
import { parseAssistantTerminalCommand } from "./terminal-assistant-command.js";
import type { TerminalManager } from "./terminal-manager.js";

interface StoredProposal extends TerminalCommandProposal {}

interface GoalLoopState {
  goal: string;
  stepCount: number;
  maxSteps: number;
  active: boolean;
}

interface SessionAssistState {
  inlineSuggestEnabled?: boolean;
  lastGoal?: string;
  turnHistory: TerminalAssistTurnRecord[];
  proposalHistory: TerminalCommandProposal[];
  activePlan?: import("@envoymesh/api").TerminalAssistPlan;
  prepareModeEnabled?: boolean;
  watchGoal?: string;
  lastWatchScrollbackBytes?: number;
  pinnedContextSessionId?: string;
  goalLoop?: GoalLoopState;
  hydratedFromPersist?: boolean;
  backgroundWatch?: {
    goal: string;
    stableMs: number;
    lastScrollbackBytes: number;
    lastChangeAt: number;
    lastFiredAt?: number;
  };
  execPaneEnabled?: boolean;
}

const MAX_PROPOSAL_HISTORY = 8;
const MAX_TURN_HISTORY = 20;
const MAX_SAFE_CHAIN = 3;
const DEFAULT_OBSERVE_STABLE_MS = 500;
const DEFAULT_OBSERVE_TIMEOUT_MS = 30_000;
const DEFAULT_GOAL_LOOP_MAX_STEPS = 10;
const DEFAULT_ASSISTANT_CONTEXT_BYTES = 16_384;
const DEFAULT_BACKGROUND_WATCH_STABLE_MS = 3000;
const BACKGROUND_WATCH_COOLDOWN_MS = 30_000;

export interface TerminalAgentAssistOptions {
  manager: TerminalManager;
  taskStore?: LocalTaskStore;
  profileDir?: string;
  initialPersistedSessions?: Record<string, PersistedAssistSession>;
  contextReaders?: TerminalAssistContextReaders;
  getModelProviders: () => Promise<ModelProviderConfig>;
  getAssistSettings: () => Promise<TerminalAssistSettingsSnapshot>;
  askOpenClaw?: (prompt: string) => Promise<string>;
  sendToAssistant?: (message: string, correlationId: string) => Promise<string>;
}

export class TerminalAgentAssist {
  private readonly manager: TerminalManager;
  private readonly taskStore?: LocalTaskStore;
  private readonly getModelProviders: () => Promise<ModelProviderConfig>;
  private readonly getAssistSettings: () => Promise<TerminalAssistSettingsSnapshot>;
  private readonly askOpenClaw?: (prompt: string) => Promise<string>;
  private readonly sendToAssistant?: (message: string, correlationId: string) => Promise<string>;
  private readonly profileDir?: string;
  private readonly contextReaders: TerminalAssistContextReaders;
  private readonly persistedFile: PersistedAssistStateFile;
  private persistDebounce: ReturnType<typeof setTimeout> | null = null;
  private readonly assistModelOverrides = new Map<string, string>();
  private readonly pendingProposals = new Map<string, StoredProposal>();
  private readonly sessionState = new Map<string, SessionAssistState>();
  private readonly assistantProposals = new Map<string, StoredProposal>();

  constructor(options: TerminalAgentAssistOptions) {
    this.manager = options.manager;
    this.taskStore = options.taskStore;
    this.getModelProviders = options.getModelProviders;
    this.getAssistSettings = options.getAssistSettings;
    this.askOpenClaw = options.askOpenClaw;
    this.sendToAssistant = options.sendToAssistant;
    this.profileDir = options.profileDir;
    this.contextReaders = options.contextReaders ?? {};
    this.persistedFile = {
      version: 1,
      sessions: { ...(options.initialPersistedSessions ?? {}) },
    };
  }

  async getAssistState(sessionId: string): Promise<TerminalAssistState> {
    this.requireRunningSession(sessionId);
    const settings = await this.getAssistSettings();
    const session = this.getSessionState(sessionId);
    const override = this.assistModelOverrides.get(sessionId);
    const pending = [...this.pendingProposals.values()].find((p) => p.sessionId === sessionId);
    return {
      sessionId,
      assistModelOverride: override,
      defaultModelName: this.resolveAssistModelName(sessionId, settings),
      pendingProposal: pending ? { ...pending } : undefined,
      autoRunPolicy: settings.terminalAutoRunPolicy ?? "always-confirm",
      inlineSuggestEnabled: session.inlineSuggestEnabled ?? settings.terminalInlineSuggestEnabled ?? false,
      agentModeDefault: settings.terminalAgentModeDefault ?? false,
      lastGoal: session.lastGoal,
      recentProposals: session.proposalHistory.map((p) => ({ ...p })),
      activePlan: session.activePlan ? { ...session.activePlan, steps: [...session.activePlan.steps] } : undefined,
      prepareModeEnabled: session.prepareModeEnabled ?? false,
      watchGoal: session.watchGoal,
      pinnedContextSessionId: session.pinnedContextSessionId,
      goalLoop: session.goalLoop
        ? {
            active: session.goalLoop.active,
            goal: session.goalLoop.goal,
            stepCount: session.goalLoop.stepCount,
            maxSteps: session.goalLoop.maxSteps,
          }
        : undefined,
      lastFailure: this.detectFailureForSession(sessionId, session),
      canResumeGoal: Boolean(session.goalLoop?.goal ? !session.goalLoop.active : session.lastGoal),
      resumeGoal: session.goalLoop?.goal ?? session.lastGoal,
      execPaneEnabled: this.manager.isExecPaneEnabled(sessionId),
      execSessionId: this.manager.getExecSessionId(sessionId),
      assistantCorrelationId: sessionId,
      assistantProposal: this.assistantProposals.has(sessionId)
        ? { ...this.assistantProposals.get(sessionId)! }
        : undefined,
      backgroundWatch: session.backgroundWatch
        ? {
            active: true,
            goal: session.backgroundWatch.goal,
            stableMs: session.backgroundWatch.stableMs,
          }
        : undefined,
    };
  }

  async getScrollbackPreview(
    params: TerminalGetScrollbackPreviewParams,
  ): Promise<TerminalGetScrollbackPreviewResult> {
    const sessionId = params.sessionId.trim();
    this.requireRunningSession(sessionId);
    const maxBytes = params.maxBytes ?? 8000;
    const scrollback = scrubTerminalScrollback(this.manager.getScrollbackTail(sessionId, maxBytes));
    return { sessionId, scrollback };
  }

  async resumeGoalLoop(params: TerminalResumeGoalLoopParams): Promise<TerminalGoalLoopStepResult> {
    const sessionId = params.sessionId.trim();
    this.requireRunningSession(sessionId);
    const session = this.getSessionState(sessionId);
    const goal = (session.goalLoop?.goal ?? session.lastGoal)?.trim();
    if (!goal) {
      throw new Error("terminal.agent.noGoal");
    }
    if (!session.goalLoop) {
      session.goalLoop = {
        goal,
        stepCount: 0,
        maxSteps: DEFAULT_GOAL_LOOP_MAX_STEPS,
        active: true,
      };
    } else {
      session.goalLoop.active = true;
    }
    session.lastGoal = goal;
    this.schedulePersist(sessionId);
    void this.audit("terminal.agent.proposed", `goal loop resumed for ${sessionId}`, sessionId);
    return this.advanceGoalLoop({ sessionId });
  }

  async detectFailure(params: TerminalDetectFailureParams): Promise<TerminalFailureDetection> {
    const sessionId = params.sessionId.trim();
    this.requireRunningSession(sessionId);
    return this.detectFailureForSession(sessionId, this.getSessionState(sessionId));
  }

  async suggestFixFromFailure(params: TerminalSuggestFixParams): Promise<TerminalCommandProposal> {
    const sessionId = params.sessionId.trim();
    const session = this.getSessionState(sessionId);
    const failure = this.detectFailureForSession(sessionId, session);
    if (!failure.failed) {
      throw new Error("terminal.agent.noFailureDetected");
    }
    const snippet = failure.snippet ?? failure.reason ?? "unknown error";
    return this.runFromNaturalLanguage({
      sessionId,
      prompt:
        `The terminal shows a failure (${failure.reason ?? "error"}). ` +
        `Propose a single shell command to diagnose or fix it.\n\nFailure context:\n${snippet}`,
    });
  }

  async startGoalLoop(params: TerminalStartGoalLoopParams): Promise<TerminalGoalLoopStepResult> {
    const sessionId = params.sessionId.trim();
    const goal = params.goal.trim();
    if (!goal) {
      throw new Error("terminal.agent.promptRequired");
    }
    this.requireRunningSession(sessionId);
    const session = this.getSessionState(sessionId);
    session.goalLoop = {
      goal,
      stepCount: 0,
      maxSteps: params.maxSteps ?? DEFAULT_GOAL_LOOP_MAX_STEPS,
      active: true,
    };
    session.lastGoal = goal;
    void this.audit("terminal.agent.proposed", `goal loop started for ${sessionId}`, sessionId);
    this.schedulePersist(sessionId);

    const proposal = await this.runFromNaturalLanguage({ sessionId, prompt: goal });
    const pending = [...this.pendingProposals.values()].find((p) => p.sessionId === sessionId);
    if (!pending) {
      return {
        status: "continuing",
        stepCount: session.goalLoop.stepCount,
        goal,
        executed: true,
        proposal,
      };
    }
    return {
      status: pending.requiresConfirmation ? "awaiting_confirm" : "continuing",
      stepCount: session.goalLoop.stepCount,
      goal,
      proposal: pending,
      executed: !pending.requiresConfirmation,
    };
  }

  async advanceGoalLoop(params: TerminalAdvanceGoalLoopParams): Promise<TerminalGoalLoopStepResult> {
    const sessionId = params.sessionId.trim();
    const session = this.getSessionState(sessionId);
    const loop = session.goalLoop;
    if (!loop?.active) {
      throw new Error("terminal.agent.goalLoopInactive");
    }
    this.requireRunningSession(sessionId);

    await this.waitForStableOutput(sessionId, DEFAULT_OBSERVE_STABLE_MS, DEFAULT_OBSERVE_TIMEOUT_MS);
    const scrollback = this.buildAssistScrollback(sessionId, session);

    if (detectGoalSuccess(scrollback, loop.goal)) {
      loop.active = false;
      this.schedulePersist(sessionId);
      return { status: "complete", stepCount: loop.stepCount, goal: loop.goal };
    }

    const failure = detectTerminalFailure(scrollback, { prepareModeEnabled: session.prepareModeEnabled });
    if (failure.failed) {
      return {
        status: "failed_output",
        stepCount: loop.stepCount,
        goal: loop.goal,
        failure,
      };
    }

    loop.stepCount += 1;
    if (loop.stepCount > loop.maxSteps) {
      loop.active = false;
      this.schedulePersist(sessionId);
      return { status: "max_steps", stepCount: loop.stepCount, goal: loop.goal };
    }

    const settings = await this.getAssistSettings();
    const proposal = await this.proposeGoalStep({
      sessionId,
      session,
      goal: loop.goal,
      settings,
      promptSuffix: "Propose the single best next shell command toward this goal based on the latest terminal output.",
    });

    const autoRan = await this.maybeAutoRunProposal(sessionId, proposal, settings, loop.goal);
    if (autoRan.executed) {
      if (autoRan.goalComplete) {
        loop.active = false;
        return { status: "complete", stepCount: loop.stepCount, goal: loop.goal, executed: true, proposal };
      }
      if (autoRan.pendingProposal) {
        return {
          status: "awaiting_confirm",
          stepCount: loop.stepCount,
          goal: loop.goal,
          proposal: autoRan.pendingProposal,
        };
      }
      return { status: "continuing", stepCount: loop.stepCount, goal: loop.goal, executed: true, proposal };
    }

    return {
      status: "awaiting_confirm",
      stepCount: loop.stepCount,
      goal: loop.goal,
      proposal,
    };
  }

  async cancelGoalLoop(params: TerminalCancelGoalLoopParams): Promise<TerminalAssistState> {
    const sessionId = params.sessionId.trim();
    this.requireRunningSession(sessionId);
    const session = this.getSessionState(sessionId);
    if (session.goalLoop) {
      session.goalLoop.active = false;
    }
    void this.audit("terminal.agent.denied", `goal loop cancelled for ${sessionId}`, sessionId);
    this.schedulePersist(sessionId);
    return this.getAssistState(sessionId);
  }

  async clearResumeGoal(params: { sessionId: string }): Promise<TerminalAssistState> {
    const sessionId = params.sessionId.trim();
    this.requireRunningSession(sessionId);
    const session = this.getSessionState(sessionId);
    delete session.lastGoal;
    delete session.goalLoop;
    this.schedulePersist(sessionId);
    return this.getAssistState(sessionId);
  }

  async sendContextToAssistant(
    params: TerminalSendContextToAssistantParams,
  ): Promise<TerminalSendContextToAssistantResult> {
    if (!this.sendToAssistant) {
      throw new Error("terminal.agent.assistantUnavailable");
    }
    const sessionId = params.sessionId.trim();
    const live = this.requireRunningSession(sessionId);
    const session = this.getSessionState(sessionId);
    const maxBytes = params.maxBytes ?? DEFAULT_ASSISTANT_CONTEXT_BYTES;
    const scrollback = this.buildAssistScrollback(sessionId, session).slice(-maxBytes);
    const userPrompt = params.userPrompt?.trim() || "Help me with this terminal session.";
    const message =
      `[Terminal session ${sessionId}]\n` +
      `cwd: ${live.summary.cwd}\n` +
      `shell: ${live.summary.shell}\n` +
      (session.lastGoal ? `lastGoal: ${session.lastGoal}\n` : "") +
      `\nScrollback (tail, read-only):\n${scrollback}\n\n---\nOwner question: ${userPrompt}`;

    void this.audit("terminal.agent.proposed", `context sent to assistant for ${sessionId}`, sessionId);
    const answer = await this.sendToAssistant(message, sessionId);
    return {
      correlationId: sessionId,
      answerPreview: answer.slice(0, 500),
    };
  }

  async updatePlanProgress(params: TerminalUpdatePlanProgressParams): Promise<TerminalAssistState> {
    const sessionId = params.sessionId.trim();
    const session = this.getSessionState(sessionId);
    const plan = session.activePlan;
    if (!plan || plan.planId !== params.planId.trim()) {
      throw new Error("terminal.agent.planNotFound");
    }
    this.requireRunningSession(sessionId);

    const completed = new Set(plan.completedStepIndices ?? []);
    const skipped = new Set(plan.skippedStepIndices ?? []);
    if (params.completedStepIndex !== undefined) {
      completed.add(params.completedStepIndex);
      skipped.delete(params.completedStepIndex);
    }
    if (params.skippedStepIndex !== undefined) {
      skipped.add(params.skippedStepIndex);
      completed.delete(params.skippedStepIndex);
    }
    plan.completedStepIndices = [...completed].sort((a, b) => a - b);
    plan.skippedStepIndices = [...skipped].sort((a, b) => a - b);
    plan.currentStepIndex = plan.steps.findIndex(
      (_, index) => !completed.has(index) && !skipped.has(index),
    );
    if (plan.currentStepIndex < 0) {
      plan.currentStepIndex = undefined;
    }
    this.schedulePersist(sessionId);
    return this.getAssistState(sessionId);
  }

  async enableExecPane(params: TerminalEnableExecPaneParams): Promise<TerminalEnableExecPaneResult> {
    const sessionId = params.sessionId.trim();
    this.requireRunningSession(sessionId);
    if (params.enabled) {
      const execSessionId = await this.manager.enableExecPane(sessionId);
      this.getSessionState(sessionId).execPaneEnabled = true;
      this.schedulePersist(sessionId);
      return { enabled: true, execSessionId };
    }
    await this.manager.disableExecPane(sessionId);
    this.getSessionState(sessionId).execPaneEnabled = false;
    this.schedulePersist(sessionId);
    return { enabled: false };
  }

  async setBackgroundWatch(params: TerminalSetBackgroundWatchParams): Promise<TerminalAssistState> {
    const sessionId = params.sessionId.trim();
    const goal = params.goal.trim();
    if (!goal) throw new Error("terminal.agent.promptRequired");
    this.requireRunningSession(sessionId);
    const session = this.getSessionState(sessionId);
    session.backgroundWatch = {
      goal,
      stableMs: params.stableMs ?? DEFAULT_BACKGROUND_WATCH_STABLE_MS,
      lastScrollbackBytes: this.manager.getScrollback(sessionId).length,
      lastChangeAt: Date.now(),
    };
    session.watchGoal = goal;
    this.schedulePersist(sessionId);
    return this.getAssistState(sessionId);
  }

  async clearBackgroundWatch(params: TerminalClearBackgroundWatchParams): Promise<TerminalAssistState> {
    const sessionId = params.sessionId.trim();
    this.requireRunningSession(sessionId);
    delete this.getSessionState(sessionId).backgroundWatch;
    this.schedulePersist(sessionId);
    return this.getAssistState(sessionId);
  }

  async onSessionActivity(sessionId: string): Promise<TerminalWatchReadyEvent[]> {
    const session = this.sessionState.get(sessionId);
    if (!session?.backgroundWatch) return [];
    if (!this.manager.getLiveSession(sessionId)) return [];

    const now = Date.now();
    const watch = session.backgroundWatch;
    const size = this.manager.getScrollback(sessionId).length;
    if (size !== watch.lastScrollbackBytes) {
      watch.lastScrollbackBytes = size;
      watch.lastChangeAt = now;
      return [];
    }
    if (now - watch.lastChangeAt < watch.stableMs) return [];
    if (watch.lastFiredAt && now - watch.lastFiredAt < BACKGROUND_WATCH_COOLDOWN_MS) return [];

    watch.lastFiredAt = now;
    this.schedulePersist(sessionId);

    let proposal: TerminalCommandProposal | undefined;
    try {
      proposal = await this.runFromNaturalLanguage({
        sessionId,
        prompt: `Background watch goal: ${watch.goal}. Propose the single best next shell command based on stable terminal output.`,
      });
    } catch {
      //
    }

    return [
      {
        sessionId,
        goal: watch.goal,
        stable: true,
        proposal,
        note: proposal ? "terminal.agent.watchProposal" : "terminal.agent.observeStable",
      },
    ];
  }

  async ingestAssistantReply(sessionId: string, answer: string): Promise<TerminalCommandProposal | undefined> {
    const parsed = parseAssistantTerminalCommand(answer);
    if (!parsed) return undefined;
    this.requireRunningSession(sessionId);
    const settings = await this.getAssistSettings();
    const stored = await this.createStoredProposal({
      sessionId,
      command: parsed.command,
      rationale: parsed.rationale ?? "From EnvoyAI",
      settings,
    });
    const entry = this.pendingProposals.get(stored.proposalId);
    if (entry) {
      entry.requiresConfirmation = true;
      this.assistantProposals.set(sessionId, { ...entry });
      void this.audit("terminal.agent.proposed", `assistant command for ${sessionId}`, sessionId);
      return { ...entry };
    }
    return undefined;
  }

  dismissAssistantProposal(sessionId: string): void {
    const proposal = this.assistantProposals.get(sessionId);
    if (proposal) {
      this.pendingProposals.delete(proposal.proposalId);
    }
    this.assistantProposals.delete(sessionId);
  }

  async setAssistModelOverride(params: TerminalSetAssistModelOverrideParams): Promise<TerminalAssistState> {
    const sessionId = params.sessionId.trim();
    this.requireRunningSession(sessionId);
    const modelName = params.modelName?.trim();
    if (modelName) {
      this.assistModelOverrides.set(sessionId, modelName);
    } else {
      this.assistModelOverrides.delete(sessionId);
    }
    void this.audit("terminal.agent.modelChanged", `session ${sessionId} model=${modelName ?? "default"}`, sessionId);
    return this.getAssistState(sessionId);
  }

  async setInlineSuggestEnabled(params: TerminalSetInlineSuggestParams): Promise<TerminalAssistState> {
    const sessionId = params.sessionId.trim();
    this.requireRunningSession(sessionId);
    this.getSessionState(sessionId).inlineSuggestEnabled = params.enabled;
    return this.getAssistState(sessionId);
  }

  async runFromNaturalLanguage(params: TerminalRunFromNaturalLanguageParams): Promise<TerminalCommandProposal> {
    const sessionId = params.sessionId.trim();
    const userPrompt = params.prompt.trim();
    if (!userPrompt) {
      throw new Error("terminal.agent.promptRequired");
    }
    const live = this.requireRunningSession(sessionId);
    const session = this.getSessionState(sessionId);
    const strippedGoal = stripAssistContextMarkers(userPrompt);
    this.appendTurn(sessionId, { role: "user", text: userPrompt, createdAt: new Date().toISOString() });

    const settings = await this.getAssistSettings();
    const turnContext = squashTerminalTurnHistory(session.turnHistory.slice(-MAX_TURN_HISTORY));
    const userPromptWithTurns = turnContext
      ? `${userPrompt}\n\nRecent assist turns:\n${turnContext}`
      : userPrompt;
    const prompt = await this.buildAssistPromptForSession(sessionId, session, userPromptWithTurns, live);

    const proposal = await this.proposeFromModel({
      sessionId,
      prompt,
      userPrompt: strippedGoal || userPrompt,
      taskType: "terminal.assist",
      settings,
    });

    this.appendTurn(sessionId, {
      role: "assistant",
      text: proposal.command,
      createdAt: new Date().toISOString(),
    });

    const policy = settings.terminalAutoRunPolicy ?? "always-confirm";
    if (policy === "safe-only" && proposal.riskTier === "safe" && !proposal.requiresConfirmation) {
      await this.executeProposal({
        sessionId,
        proposalId: proposal.proposalId,
      });
      if (session.goalLoop?.active) {
        await this.continueSafeOnlyChain(sessionId, session, settings, session.goalLoop.goal);
      }
      this.schedulePersist(sessionId);
      return proposal;
    }

    this.schedulePersist(sessionId);
    return proposal;
  }

  async suggestCommand(params: TerminalSuggestCommandParams): Promise<TerminalSuggestCommandResult> {
    const sessionId = params.sessionId.trim();
    const partialInput = params.partialInput;
    if (!partialInput.trim() || partialInput.trim().length < 2) {
      return { suggestions: [] };
    }

    const live = this.requireRunningSession(sessionId);
    const scrollback = this.manager.getScrollback(sessionId).toString("utf8");
    const prompt = buildTerminalSuggestPrompt({
      scrollback,
      partialInput,
      cwd: live.summary.cwd,
      shell: live.summary.shell,
    });
    if (!prompt) {
      return { suggestions: [] };
    }

    const settings = await this.getAssistSettings();
    const providers = await this.buildAssistProviders(sessionId, settings);
    const modelResult = await routeModelRequest(
      {
        taskType: "terminal.suggest",
        prompt,
        sensitivity: "private",
        requesterPeerId: "local",
        ownerApproved: true,
      },
      providers,
    );

    if (modelResult.decision.action !== "allow") {
      return { suggestions: [] };
    }

    const parsed = parseTerminalSuggestResponse(stripModelThinking(modelResult.response?.text ?? ""));
    if (!parsed.ok) {
      return { suggestions: [] };
    }

    const suggestions = (parsed.result.suggestions ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
    const completion = parsed.result.completion?.trim();
    if (completion && !suggestions.includes(completion)) {
      suggestions.unshift(completion);
    }

    return {
      suggestions,
      completion: completion ?? suggestions[0],
    };
  }

  async observeStep(params: TerminalObserveStepParams): Promise<TerminalObserveStepResult> {
    const sessionId = params.sessionId.trim();
    this.requireRunningSession(sessionId);
    const stableMs = params.stableMs ?? DEFAULT_OBSERVE_STABLE_MS;
    const timeoutMs = params.timeoutMs ?? DEFAULT_OBSERVE_TIMEOUT_MS;
    const goal = params.goal?.trim();

    const start = Date.now();
    const wait = await this.waitForStableOutput(sessionId, stableMs, timeoutMs);
    const stable = wait.stable;

    let nextProposal: TerminalCommandProposal | undefined;
    if (stable && goal) {
      nextProposal = await this.runFromNaturalLanguage({ sessionId, prompt: goal });
    }

    return {
      stable,
      waitedMs: Date.now() - start,
      scrollbackBytes: wait.scrollbackBytes,
      nextProposal,
    };
  }

  async executeProposal(params: TerminalExecuteProposalParams): Promise<void> {
    const sessionId = params.sessionId.trim();
    const proposalId = params.proposalId.trim();
    this.requireRunningSession(sessionId);

    const proposal = this.pendingProposals.get(proposalId);
    if (!proposal || proposal.sessionId !== sessionId) {
      throw new Error("terminal.agent.proposalNotFound");
    }

    if (proposal.requiresConfirmation && params.confirmed !== true) {
      void this.audit("terminal.agent.denied", `confirm required for ${proposalId}`, sessionId);
      throw new Error("terminal.agent.confirmRequired");
    }

    const egress = evaluateEgressContent({ text: proposal.command });
    if (!egress.ok) {
      void this.audit("terminal.agent.denied", egress.reason ?? "egress blocked", sessionId);
      throw new Error("terminal.agent.egressBlocked");
    }

    const payload = `${proposal.command}\n`;
    this.manager.writeStdin(sessionId, Buffer.from(payload, "utf8"));
    this.pendingProposals.delete(proposalId);
    if (this.assistantProposals.get(sessionId)?.proposalId === proposalId) {
      this.assistantProposals.delete(sessionId);
    }
    void this.audit(
      "terminal.agent.executed",
      `executed ${proposalId} tier=${proposal.riskTier} hash=${commandHash(proposal.command)}`,
      sessionId,
    );
  }

  async explainScrollback(params: TerminalExplainScrollbackParams): Promise<TerminalExplainScrollbackResult> {
    const sessionId = params.sessionId.trim();
    const live = this.requireRunningSession(sessionId);
    const scrollback = this.manager.getScrollback(sessionId).toString("utf8");
    const prompt = buildTerminalExplainPrompt({
      scrollback,
      topic: params.topic,
      cwd: live.summary.cwd,
    });

    const settings = await this.getAssistSettings();
    const providers = await this.buildAssistProviders(sessionId, settings);
    const modelResult = await routeModelRequest(
      {
        taskType: "terminal.explain",
        prompt,
        sensitivity: "private",
        requesterPeerId: "local",
        ownerApproved: true,
      },
      providers,
    );

    if (modelResult.decision.action !== "allow") {
      throw new Error("terminal.agent.modelDenied");
    }

    const explanation = stripModelThinking(modelResult.response?.text ?? "").trim();
    if (!explanation) {
      throw new Error("terminal.agent.emptyExplanation");
    }

    return { explanation };
  }

  async openClawPlan(params: TerminalOpenClawPlanParams): Promise<TerminalOpenClawPlanResult> {
    if (!this.askOpenClaw) {
      throw new Error("terminal.agent.openclawUnavailable");
    }
    const sessionId = params.sessionId.trim();
    const prompt = params.prompt.trim();
    if (!prompt) {
      throw new Error("terminal.agent.promptRequired");
    }
    this.requireRunningSession(sessionId);
    const planText = await this.askOpenClaw(
      `Create a numbered shell command plan for the owner's terminal session. ` +
        `Request: ${prompt}\n` +
        `Format: numbered steps (1. 2. 3.), one shell command per step. Planning only — do not claim execution.`,
    );
    const steps = parseNumberedPlanSteps(planText);
    if (steps.length === 0) {
      throw new Error("terminal.agent.planEmpty");
    }
    const plan = {
      planId: randomUUID(),
      sessionId,
      title: prompt.slice(0, 160),
      steps,
      createdAt: new Date().toISOString(),
      source: "openclaw" as const,
      completedStepIndices: [],
      skippedStepIndices: [],
      currentStepIndex: 0,
    };
    this.getSessionState(sessionId).activePlan = plan;
    this.schedulePersist(sessionId);
    return { plan, preamble: planText.slice(0, 4000) };
  }

  async runPlanStep(params: TerminalRunPlanStepParams): Promise<TerminalCommandProposal> {
    const sessionId = params.sessionId.trim();
    const session = this.getSessionState(sessionId);
    const plan = session.activePlan;
    if (!plan || plan.planId !== params.planId.trim()) {
      throw new Error("terminal.agent.planNotFound");
    }
    const step = plan.steps[params.stepIndex];
    if (!step) {
      throw new Error("terminal.agent.planStepNotFound");
    }
    this.requireRunningSession(sessionId);
    const settings = await this.getAssistSettings();
    return this.createStoredProposal({
      sessionId,
      command: commandFromPlanStep(step),
      rationale: `Plan step ${params.stepIndex + 1}/${plan.steps.length}`,
      settings,
    });
  }

  async enablePrepareMode(params: TerminalEnablePrepareModeParams): Promise<TerminalEnablePrepareModeResult> {
    const sessionId = params.sessionId.trim();
    this.requireRunningSession(sessionId);
    const session = this.getSessionState(sessionId);
    if (!params.enabled) {
      session.prepareModeEnabled = false;
      return { enabled: false, markerWritten: false };
    }
    session.prepareModeEnabled = true;
    const marker = "export PS1='[envoy-prepare exit:$?] \\u@\\h:\\w\\$ '\n";
    this.manager.writeStdin(sessionId, Buffer.from(marker, "utf8"));
    return { enabled: true, markerWritten: true };
  }

  async watchStep(params: TerminalWatchStepParams): Promise<TerminalWatchStepResult> {
    const sessionId = params.sessionId.trim();
    const goal = params.goal.trim();
    if (!goal) {
      throw new Error("terminal.agent.promptRequired");
    }
    this.requireRunningSession(sessionId);
    const session = this.getSessionState(sessionId);
    session.watchGoal = goal;
    const scrollbackBytes = this.manager.getScrollback(sessionId).length;
    const lastBytes = params.lastScrollbackBytes ?? session.lastWatchScrollbackBytes ?? 0;
    session.lastWatchScrollbackBytes = scrollbackBytes;
    if (scrollbackBytes <= lastBytes) {
      return { scrollbackBytes, changed: false, note: "terminal.agent.watchNoChange" };
    }
    const proposal = await this.runFromNaturalLanguage({
      sessionId,
      prompt: `Watch goal: ${goal}. Propose the single best next shell command based on NEW terminal output.`,
    });
    return { scrollbackBytes, changed: true, proposal };
  }

  async pinContextSession(params: TerminalPinContextSessionParams): Promise<TerminalAssistState> {
    const sessionId = params.sessionId.trim();
    this.requireRunningSession(sessionId);
    const contextSessionId = params.contextSessionId?.trim();
    if (contextSessionId) {
      this.requireRunningSession(contextSessionId);
    }
    this.getSessionState(sessionId).pinnedContextSessionId = contextSessionId || undefined;
    this.schedulePersist(sessionId);
    return this.getAssistState(sessionId);
  }

  clearPendingForSession(sessionId: string): void {
    for (const [id, proposal] of this.pendingProposals) {
      if (proposal.sessionId === sessionId) {
        this.pendingProposals.delete(id);
      }
    }
  }

  dismissPendingProposal(sessionId: string): void {
    this.clearPendingForSession(sessionId);
  }

  private resolveAssistModelName(
    sessionId: string,
    settings: TerminalAssistSettingsSnapshot,
  ): string | undefined {
    const sessionOverride = this.assistModelOverrides.get(sessionId)?.trim();
    if (sessionOverride) return sessionOverride;
    const explicitAssist = settings.terminalAssistModelName?.trim();
    if (explicitAssist) return explicitAssist;
    return settings.chatModelName?.trim() || undefined;
  }

  private async buildAssistProviders(
    sessionId: string,
    settings: TerminalAssistSettingsSnapshot,
  ) {
    const modelProviders = await this.getModelProviders();
    if (modelProviders.mode === "disabled") {
      return [];
    }
    const modelNameOverride = this.resolveAssistModelName(sessionId, settings);
    return buildModelProviders(modelProviders, true, {
      trustedLocalAssist: true,
      ...(modelNameOverride ? { modelNameOverride } : {}),
    });
  }

  private async proposeFromModel(input: {
    sessionId: string;
    prompt: string;
    userPrompt?: string;
    taskType: "terminal.assist";
    settings: TerminalAssistSettingsSnapshot;
  }): Promise<StoredProposal> {
    const { sessionId, prompt, userPrompt, taskType, settings } = input;
    const modelProviders = await this.getModelProviders();
    if (modelProviders.mode === "disabled") {
      throw new Error("terminal.agent.modelDisabled");
    }
    const providers = await this.buildAssistProviders(sessionId, settings);
    if (providers.length === 0) {
      throw new Error("terminal.agent.modelDisabled");
    }

    let modelResult;
    try {
      modelResult = await routeModelRequest(
        {
          taskType,
          prompt,
          sensitivity: "private",
          requesterPeerId: "local",
          ownerApproved: true,
        },
        providers,
      );
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      void this.audit("terminal.agent.denied", `model request failed: ${reason}`, sessionId);
      throw new Error(`terminal.agent.modelFailed:${reason.slice(0, 240)}`);
    }

    if (modelResult.decision.action !== "allow") {
      const reason =
        "reason" in modelResult.decision ? modelResult.decision.reason : "unknown";
      void this.audit("terminal.agent.denied", `model denied: ${reason}`, sessionId);
      if (reason.includes("semantic_firewall")) {
        throw new Error("terminal.agent.promptBlocked");
      }
      if (modelResult.decision.action === "approval_required") {
        throw new Error("terminal.agent.modelApprovalRequired");
      }
      throw new Error(`terminal.agent.modelDenied:${reason.slice(0, 240)}`);
    }

    const rawText = stripModelThinking(modelResult.response?.text ?? "");
    const parsed = parseTerminalCommandProposal(rawText);
    if (!parsed.ok) {
      const inferred = inferTerminalCommandFallback(
        rawText,
        userPrompt ?? this.getSessionState(sessionId).lastGoal ?? prompt,
      );
      if (inferred) {
        return this.createStoredProposal({
          sessionId,
          command: inferred,
          rationale: rawText.trim().slice(0, 500) || "Inferred from model response",
          settings,
        });
      }
      void this.audit("terminal.agent.denied", parsed.reason, sessionId);
      throw new Error(parsed.reason);
    }

    return this.createStoredProposal({
      sessionId,
      command: parsed.proposal.command,
      rationale: parsed.proposal.rationale?.trim() || undefined,
      modelHint: parsed.proposal.riskTier,
      settings,
    });
  }

  private buildAssistScrollback(sessionId: string, session: SessionAssistState): string {
    const primary = this.manager.getScrollback(sessionId).toString("utf8");
    const pinnedId = session.pinnedContextSessionId;
    if (!pinnedId || pinnedId === sessionId) {
      return primary;
    }
    const pinned = this.manager.getScrollback(pinnedId).toString("utf8");
    return `[Pinned context session ${pinnedId}]\n${pinned}\n\n[Active session ${sessionId}]\n${primary}`;
  }

  private createStoredProposal(input: {
    sessionId: string;
    command: string;
    rationale?: string;
    modelHint?: import("@envoymesh/api").TerminalCommandRiskTier;
    settings: TerminalAssistSettingsSnapshot;
  }): StoredProposal {
    const allowPatterns = compileTerminalCommandPatterns(input.settings.terminalCommandAllowPatterns);
    const denyPatterns = compileTerminalCommandPatterns(input.settings.terminalCommandDenyPatterns);
    const destructivePatterns = compileTerminalCommandPatterns(input.settings.terminalCommandDestructivePatterns);
    const autoRunPolicy = input.settings.terminalAutoRunPolicy ?? "always-confirm";
    const { riskTier, requiresConfirmation } = resolveProposalRisk(input.command, input.modelHint, {
      allowPatterns,
      denyPatterns,
      destructivePatterns,
      autoRunPolicy,
    });
    const proposal: StoredProposal = {
      proposalId: randomUUID(),
      sessionId: input.sessionId,
      command: input.command.trim(),
      riskTier,
      rationale: input.rationale
        ? stripModelThinking(input.rationale).trim() || undefined
        : undefined,
      requiresConfirmation,
      createdAt: new Date().toISOString(),
    };
    this.pendingProposals.set(proposal.proposalId, proposal);
    const session = this.getSessionState(input.sessionId);
    session.proposalHistory.unshift({ ...proposal });
    session.proposalHistory.splice(MAX_PROPOSAL_HISTORY);
    void this.audit(
      "terminal.agent.proposed",
      `proposal ${proposal.proposalId} tier=${riskTier} hash=${commandHash(proposal.command)}`,
      input.sessionId,
    );
    return { ...proposal };
  }

  private getSessionState(sessionId: string): SessionAssistState {
    let state = this.sessionState.get(sessionId);
    if (!state) {
      state = { turnHistory: [], proposalHistory: [] };
      this.sessionState.set(sessionId, state);
    }
    if (!state.hydratedFromPersist) {
      const row = this.persistedFile.sessions[sessionId];
      if (row) {
        state.lastGoal = row.lastGoal ?? state.lastGoal;
        state.watchGoal = row.watchGoal ?? state.watchGoal;
        state.pinnedContextSessionId = row.pinnedContextSessionId ?? state.pinnedContextSessionId;
        state.activePlan = row.activePlan ? { ...row.activePlan, steps: [...row.activePlan.steps] } : state.activePlan;
        if (row.goalLoop) {
          state.goalLoop = {
            goal: row.goalLoop.goal,
            stepCount: row.goalLoop.stepCount,
            maxSteps: row.goalLoop.maxSteps,
            active: false,
          };
        }
        if (row.execPaneEnabled) {
          state.execPaneEnabled = true;
        }
        if (row.backgroundWatchGoal) {
          state.backgroundWatch = {
            goal: row.backgroundWatchGoal,
            stableMs: row.backgroundWatchStableMs ?? DEFAULT_BACKGROUND_WATCH_STABLE_MS,
            lastScrollbackBytes: this.manager.getScrollback(sessionId).length,
            lastChangeAt: Date.now(),
          };
        }
        if (row.execPaneEnabled && !this.manager.isExecPaneEnabled(sessionId)) {
          void this.manager.enableExecPane(sessionId).then(() => {
            state.execPaneEnabled = true;
          }).catch(() => {
            //
          });
        }
      }
      state.hydratedFromPersist = true;
    }
    return state;
  }

  private schedulePersist(sessionId: string): void {
    if (!this.profileDir) return;
    const session = this.sessionState.get(sessionId);
    if (!session) return;
    const persisted = sessionToPersisted({
      lastGoal: session.lastGoal,
      watchGoal: session.watchGoal,
      goalLoop: session.goalLoop,
      activePlan: session.activePlan,
      pinnedContextSessionId: session.pinnedContextSessionId,
      execPaneEnabled: session.execPaneEnabled ?? this.manager.isExecPaneEnabled(sessionId),
      backgroundWatch: session.backgroundWatch
        ? { goal: session.backgroundWatch.goal, stableMs: session.backgroundWatch.stableMs }
        : undefined,
    });
    if (persisted) {
      this.persistedFile.sessions[sessionId] = persisted;
    } else {
      delete this.persistedFile.sessions[sessionId];
    }
    if (this.persistDebounce) clearTimeout(this.persistDebounce);
    this.persistDebounce = setTimeout(() => {
      this.persistDebounce = null;
      void savePersistedAssistState(this.profileDir!, this.persistedFile).catch(() => {
        //
      });
    }, 500);
  }

  private async buildAssistPromptForSession(
    sessionId: string,
    session: SessionAssistState,
    userPrompt: string,
    live: { summary: { cwd: string; shell: string } },
  ): Promise<string> {
    const scrollback = this.buildAssistScrollback(sessionId, session);
    const stripped = stripAssistContextMarkers(userPrompt);
    const snippets = await loadAssistContextSnippets({
      prompt: userPrompt,
      cwd: live.summary.cwd,
      readers: this.contextReaders,
    });
    if (snippets.length > 0) {
      void this.audit(
        "terminal.agent.proposed",
        `context snippets loaded count=${snippets.length} session=${sessionId}`,
        sessionId,
      );
    }
    const contextBlock = formatAssistContextBlock(snippets);
    return buildTerminalAssistPrompt({
      scrollback,
      userPrompt: stripped,
      cwd: live.summary.cwd,
      shell: live.summary.shell,
      contextBlock,
    });
  }

  private appendTurn(sessionId: string, turn: TerminalAssistTurnRecord): void {
    const session = this.getSessionState(sessionId);
    session.turnHistory.push(turn);
    if (session.turnHistory.length > MAX_TURN_HISTORY) {
      session.turnHistory.splice(0, session.turnHistory.length - MAX_TURN_HISTORY);
    }
  }

  private requireRunningSession(sessionId: string) {
    const live = this.manager.getLiveSession(sessionId);
    if (!live) {
      throw new Error("terminal.sessionNotFound");
    }
    if (live.summary.state !== "running") {
      throw new Error("terminal.sessionNotRunning");
    }
    return live;
  }

  private detectFailureForSession(sessionId: string, session: SessionAssistState): TerminalFailureDetection {
    const scrollback = this.buildAssistScrollback(sessionId, session);
    return detectTerminalFailure(scrollback, { prepareModeEnabled: session.prepareModeEnabled });
  }

  private async waitForStableOutput(
    sessionId: string,
    stableMs: number,
    timeoutMs: number,
  ): Promise<{ stable: boolean; scrollbackBytes: number }> {
    const start = Date.now();
    let lastSize = this.manager.getScrollback(sessionId).length;
    let lastChange = Date.now();

    while (Date.now() - start < timeoutMs) {
      await sleep(100);
      const size = this.manager.getScrollback(sessionId).length;
      if (size !== lastSize) {
        lastSize = size;
        lastChange = Date.now();
      } else if (Date.now() - lastChange >= stableMs) {
        break;
      }
    }

    return {
      stable: Date.now() - lastChange >= stableMs,
      scrollbackBytes: lastSize,
    };
  }

  private async proposeGoalStep(input: {
    sessionId: string;
    session: SessionAssistState;
    goal: string;
    settings: TerminalAssistSettingsSnapshot;
    promptSuffix: string;
  }): Promise<StoredProposal> {
    const live = this.requireRunningSession(input.sessionId);
    const userPrompt = `Goal: ${input.goal}\n${input.promptSuffix}`;
    const turnContext = squashTerminalTurnHistory(input.session.turnHistory.slice(-MAX_TURN_HISTORY));
    const fullPrompt = turnContext ? `${userPrompt}\n\nRecent assist turns:\n${turnContext}` : userPrompt;
    const prompt = await this.buildAssistPromptForSession(
      input.sessionId,
      input.session,
      fullPrompt,
      live,
    );
    const proposal = await this.proposeFromModel({
      sessionId: input.sessionId,
      prompt,
      userPrompt: input.goal,
      taskType: "terminal.assist",
      settings: input.settings,
    });
    this.appendTurn(input.sessionId, {
      role: "assistant",
      text: proposal.command,
      createdAt: new Date().toISOString(),
    });
    return proposal;
  }

  private async maybeAutoRunProposal(
    sessionId: string,
    proposal: StoredProposal,
    settings: TerminalAssistSettingsSnapshot,
    goal?: string,
  ): Promise<{ executed: boolean; pendingProposal?: StoredProposal; goalComplete?: boolean }> {
    const policy = settings.terminalAutoRunPolicy ?? "always-confirm";
    if (policy !== "safe-only" || proposal.riskTier !== "safe" || proposal.requiresConfirmation) {
      return { executed: false, pendingProposal: proposal };
    }
    await this.executeProposal({ sessionId, proposalId: proposal.proposalId });
    const session = this.getSessionState(sessionId);
    await this.continueSafeOnlyChain(sessionId, session, settings, goal);
    const scrollback = this.buildAssistScrollback(sessionId, session);
    if (goal && detectGoalSuccess(scrollback, goal)) {
      return { executed: true, goalComplete: true, pendingProposal: undefined };
    }
    const pending = [...this.pendingProposals.values()].find((p) => p.sessionId === sessionId);
    return { executed: true, pendingProposal: pending ? { ...pending } : undefined };
  }

  private async continueSafeOnlyChain(
    sessionId: string,
    session: SessionAssistState,
    settings: TerminalAssistSettingsSnapshot,
    goalContext?: string,
  ): Promise<void> {
    const policy = settings.terminalAutoRunPolicy ?? "always-confirm";
    if (policy !== "safe-only" || !session.goalLoop?.active) return;

    const goal = goalContext ?? session.goalLoop?.goal ?? session.lastGoal;
    for (let i = 0; i < MAX_SAFE_CHAIN - 1; i += 1) {
      await this.waitForStableOutput(sessionId, DEFAULT_OBSERVE_STABLE_MS, 5000);
      const scrollback = this.buildAssistScrollback(sessionId, session);
      if (detectTerminalFailure(scrollback, { prepareModeEnabled: session.prepareModeEnabled }).failed) {
        break;
      }
      if (goal && detectGoalSuccess(scrollback, goal)) {
        if (session.goalLoop) session.goalLoop.active = false;
        break;
      }

      const proposal = await this.proposeGoalStep({
        sessionId,
        session,
        goal: goal ?? "continue diagnostics",
        settings,
        promptSuffix:
          "Propose the single best next safe read-only or diagnostic shell command based on the latest output. Avoid writes unless required to fix a clear failure.",
      });

      if (proposal.riskTier !== "safe" || proposal.requiresConfirmation) {
        break;
      }
      await this.executeProposal({ sessionId, proposalId: proposal.proposalId });
      if (session.goalLoop) {
        session.goalLoop.stepCount += 1;
        if (session.goalLoop.stepCount > session.goalLoop.maxSteps) {
          session.goalLoop.active = false;
          break;
        }
      }
    }
  }

  private async audit(
    type: "terminal.agent.proposed" | "terminal.agent.executed" | "terminal.agent.denied" | "terminal.agent.modelChanged",
    summary: string,
    sessionId: string,
  ): Promise<void> {
    if (!this.taskStore) return;
    try {
      await this.taskStore.appendAuditEvent(
        createAuditEvent({
          type,
          intent: "chat.message",
          messageId: randomUUID(),
          remotePeerId: "local",
          direction: "local",
          verificationStatus: "verified",
          latencyMs: 0,
          outcome: type === "terminal.agent.denied" ? "deny" : "record",
          summary,
          correlationId: sessionId,
        }),
      );
    } catch {
      //
    }
  }
}

function commandHash(command: string): string {
  return createHash("sha256").update(command).digest("hex").slice(0, 12);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
