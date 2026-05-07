/**
 * Mode Controller for AI Agent
 *
 * Manages agent operating modes:
 * - Reactive: Agent assists only when owner initiates. All sensitive actions require approval.
 * - Proactive: Agent acts autonomously within configured bounds. Escalates important items.
 *
 * Mode switching based on:
 * - Owner online status (via WebSocket connection)
 * - Schedule (online hours)
 * - Per-contact overrides
 */

import { createAuditEvent } from "@envoymesh/local-store";
import type { LocalTaskStore } from "@envoymesh/local-store";

/**
 * Agent operating mode.
 */
export type AgentMode = "reactive" | "proactive";

/**
 * Cron schedule expression for time-based mode switching.
 * Format: minute hour day-of-month month day-of-week
 * Examples:
 *   "0 9 * * 1-5" = 9 AM on weekdays
 *   "0 22 * * *" = 10 PM every day
 */
export type CronSchedule = string;

/**
 * Agent mode configuration.
 */
export interface AgentModeConfig {
  /** Current mode */
  mode: AgentMode;
  /** Default mode when owner is online */
  defaultMode: AgentMode;
  /** Cron schedule for proactive mode (when to switch to proactive) */
  proactiveSchedule?: CronSchedule;
  /** Cron schedule for reactive mode (when to switch back to reactive) */
  reactiveSchedule?: CronSchedule;
  /** Minutes owner must be disconnected before switching to proactive (default: 5) */
  offlineMinutesBeforeProactive: number;
  /** Per-contact mode overrides */
  perContactOverrides: Record<string, AgentMode>;
}

/**
 * Mode transition event.
 */
export interface ModeTransitionEvent {
  fromMode: AgentMode;
  toMode: AgentMode;
  reason: "owner_connect" | "owner_disconnect" | "schedule" | "manual" | "contact_override";
  timestamp: string;
  triggeredBy?: string;
}

/**
 * Create default mode configuration.
 */
export function createDefaultModeConfig(): AgentModeConfig {
  return {
    mode: "reactive",
    defaultMode: "reactive",
    offlineMinutesBeforeProactive: 5,
    perContactOverrides: {},
  };
}

/**
 * Parse cron expression - checks if a given time matches the cron expression.
 * Simplified implementation for basic cron expressions.
 * Returns the next activation time if the current time matches, otherwise null.
 */
export function getNextCronActivation(cron: CronSchedule, after: Date): Date | null {
  const parts = cron.split(" ");
  if (parts.length !== 5) return null;

  const [minuteStr, hourStr, dayOfMonthStr, monthStr, dayOfWeekStr] = parts;

  const minute = minuteStr === "*" ? null : parseInt(minuteStr, 10);
  const hour = hourStr === "*" ? null : parseInt(hourStr, 10);
  const dayOfMonth = dayOfMonthStr === "*" ? null : parseInt(dayOfMonthStr, 10);
  const month = monthStr === "*" ? null : parseInt(monthStr, 10);
  const dayOfWeek = dayOfWeekStr === "*" ? null : parseInt(dayOfWeekStr, 10);

  const result = new Date(after);
  result.setSeconds(0, 0);

  // Check if the given time matches the cron expression
  const currentMinute = result.getUTCMinutes();
  const currentHour = result.getUTCHours();
  const currentDayOfMonth = result.getUTCDate();
  const currentMonth = result.getUTCMonth() + 1;
  const currentDayOfWeek = result.getUTCDay();

  const minuteMatches = minute === null || minute === currentMinute;
  const hourMatches = hour === null || hour === currentHour;
  const dayOfMonthMatches = dayOfMonth === null || dayOfMonth === currentDayOfMonth;
  const monthMatches = month === null || month === currentMonth;
  const dayOfWeekMatches = dayOfWeek === null || dayOfWeek === currentDayOfWeek;

  if (!minuteMatches || !hourMatches || !dayOfMonthMatches || !monthMatches || !dayOfWeekMatches) {
    return null;
  }

  // Current time matches - return next occurrence
  const next = new Date(result);
  if (minute !== null) {
    next.setMinutes(next.getMinutes() + 1);
  } else {
    next.setMinutes(next.getMinutes() + 1);
  }

  return next;
}

/**
 * Mode Controller manages agent operating mode transitions.
 */
export class ModeController {
  private config: AgentModeConfig;
  private lastOwnerActivity: Date;
  private ownerConnected: boolean;
  private transitionHistory: ModeTransitionEvent[];
  private taskStore: Pick<LocalTaskStore, "appendAuditEvent"> | null;

  constructor(
    config: AgentModeConfig,
    taskStore: Pick<LocalTaskStore, "appendAuditEvent"> | null = null,
  ) {
    this.config = config;
    this.lastOwnerActivity = new Date();
    this.ownerConnected = false;
    this.transitionHistory = [];
    this.taskStore = taskStore;
  }

  /**
   * Get current mode configuration.
   */
  getConfig(): AgentModeConfig {
    return { ...this.config };
  }

  /**
   * Update mode configuration.
   */
  updateConfig(updates: Partial<AgentModeConfig>): void {
    const oldMode = this.config.mode;
    this.config = { ...this.config, ...updates };

    if (updates.mode && updates.mode !== oldMode) {
      this.recordTransition(oldMode, updates.mode, "manual");
    }
  }

  /**
   * Get current effective mode for a contact.
   */
  getModeForContact(contactOwnerId: string): AgentMode {
    // Check per-contact override first
    if (this.config.perContactOverrides[contactOwnerId]) {
      return this.config.perContactOverrides[contactOwnerId];
    }
    return this.config.mode;
  }

  /**
   * Set per-contact mode override.
   */
  setContactMode(contactOwnerId: string, mode: AgentMode | null): void {
    if (mode === null) {
      delete this.config.perContactOverrides[contactOwnerId];
    } else {
      this.config.perContactOverrides[contactOwnerId] = mode;
    }
  }

  /**
   * Mark owner as connected (via WebSocket/mobile app).
   */
  markOwnerConnected(): void {
    if (!this.ownerConnected) {
      const oldMode = this.config.mode;
      this.ownerConnected = true;

      // Switch to reactive mode when owner connects
      if (this.config.defaultMode === "reactive" && this.config.mode !== "reactive") {
        this.config.mode = "reactive";
        this.recordTransition(oldMode, "reactive", "owner_connect");
      }

      this.lastOwnerActivity = new Date();
    } else {
      this.lastOwnerActivity = new Date();
    }
  }

  /**
   * Mark owner as disconnected.
   */
  markOwnerDisconnected(): void {
    if (this.ownerConnected) {
      this.ownerConnected = false;
    }
  }

  /**
   * Record owner activity (message sent, etc).
   */
  recordOwnerActivity(): void {
    this.lastOwnerActivity = new Date();
  }

  /**
   * Check if agent should switch to proactive mode based on offline time.
   * Call this periodically (e.g., every minute).
   */
  checkOfflineTransition(): AgentMode | null {
    if (this.ownerConnected) {
      return null;
    }

    if (this.config.defaultMode !== "proactive") {
      return null;
    }

    const now = new Date();
    const offlineMs = now.getTime() - this.lastOwnerActivity.getTime();
    const offlineMinutes = offlineMs / (1000 * 60);

    if (
      offlineMinutes >= this.config.offlineMinutesBeforeProactive &&
      this.config.mode === "reactive"
    ) {
      const oldMode = this.config.mode;
      this.config.mode = "proactive";
      this.recordTransition(oldMode, "proactive", "owner_disconnect");
      return "proactive";
    }

    return null;
  }

  /**
   * Check if schedule should trigger a mode change.
   * Call this periodically.
   */
  checkScheduleTransition(): AgentMode | null {
    const now = new Date();

    // Check proactive schedule
    if (this.config.proactiveSchedule && this.config.mode === "reactive") {
      const proactiveNext = getNextCronActivation(this.config.proactiveSchedule, now);
      if (proactiveNext && proactiveNext.getTime() <= now.getTime() + 60000) {
        // Within 1 minute of activation
        const oldMode = this.config.mode;
        this.config.mode = "proactive";
        this.recordTransition(oldMode, "proactive", "schedule");
        return "proactive";
      }
    }

    // Check reactive schedule
    if (this.config.reactiveSchedule && this.config.mode === "proactive") {
      const reactiveNext = getNextCronActivation(this.config.reactiveSchedule, now);
      if (reactiveNext && reactiveNext.getTime() <= now.getTime() + 60000) {
        const oldMode = this.config.mode;
        this.config.mode = "reactive";
        this.recordTransition(oldMode, "reactive", "schedule");
        return "reactive";
      }
    }

    return null;
  }

  /**
   * Check if proactive actions should be allowed based on current mode and policies.
   */
  canPerformProactiveAction(): boolean {
    return this.config.mode === "proactive";
  }

  /**
   * Check if actions require approval based on current mode.
   */
  requiresApproval(): boolean {
    return this.config.mode === "reactive";
  }

  /**
   * Get mode transition history.
   */
  getTransitionHistory(): ModeTransitionEvent[] {
    return [...this.transitionHistory];
  }

  /**
   * Get current mode.
   */
  getCurrentMode(): AgentMode {
    return this.config.mode;
  }

  /**
   * Get time since last owner activity.
   */
  getTimeSinceLastActivity(): number {
    return Date.now() - this.lastOwnerActivity.getTime();
  }

  /**
   * Is owner currently connected?
   */
  isOwnerConnected(): boolean {
    return this.ownerConnected;
  }

  /**
   * Record a mode transition and audit it.
   */
  private recordTransition(
    fromMode: AgentMode,
    toMode: AgentMode,
    reason: ModeTransitionEvent["reason"],
    triggeredBy?: string,
  ): void {
    const event: ModeTransitionEvent = {
      fromMode,
      toMode,
      reason,
      timestamp: new Date().toISOString(),
      triggeredBy,
    };

    this.transitionHistory.push(event);

    // Keep only last 100 transitions
    if (this.transitionHistory.length > 100) {
      this.transitionHistory = this.transitionHistory.slice(-100);
    }

    // Audit the transition
    if (this.taskStore) {
      void this.taskStore.appendAuditEvent(
        createAuditEvent({
          type: "autonomous.decided",
          intent: undefined,
          outcome: "record",
          summary: `Agent mode transition: ${fromMode} → ${toMode} (${reason})`,
          createdAt: event.timestamp,
        }),
      );
    }
  }
}

/**
 * Build the mesh.set-mode tool.
 */
export function buildSetModeTool(
  controller: ModeController,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; mode?: string; error?: string }> {
  return async (params) => {
    const mode = params.mode as string | undefined;

    if (mode !== "reactive" && mode !== "proactive") {
      return {
        ok: false,
        error: `Invalid mode: ${mode}. Must be "reactive" or "proactive"`,
      };
    }

    controller.updateConfig({ mode: mode as AgentMode });
    return { ok: true, mode };
  };
}

/**
 * Build the mesh.get-mode tool.
 */
export function buildGetModeTool(
  controller: ModeController,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; mode?: string; config?: AgentModeConfig }> {
  return async () => {
    return {
      ok: true,
      mode: controller.getCurrentMode(),
      config: controller.getConfig(),
    };
  };
}

/**
 * Build the mesh.set-contact-mode tool.
 */
export function buildSetContactModeTool(
  controller: ModeController,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; contact?: string; mode?: string; error?: string }> {
  return async (params) => {
    const contactOwnerId = params.contactOwnerId as string | undefined;
    const mode = params.mode as string | undefined;

    if (!contactOwnerId) {
      return { ok: false, error: "contactOwnerId is required" };
    }

    if (mode !== "reactive" && mode !== "proactive" && mode !== null) {
      return {
        ok: false,
        error: `Invalid mode: ${mode}. Must be "reactive", "proactive", or null to clear`,
      };
    }

    controller.setContactMode(
      contactOwnerId,
      mode === null ? null : (mode as AgentMode | null),
    );
    return { ok: true, contact: contactOwnerId, mode: mode ?? "default" };
  };
}
