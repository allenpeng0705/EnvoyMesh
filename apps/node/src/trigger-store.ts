/**
 * Trigger Store for AI Agent
 *
 * Manages proactive triggers that initiate autonomous actions:
 * - Time-based: scheduled recurring actions
 * - Event-based: actions triggered by events
 * - Topic-based: actions triggered by topic matches
 */

import { randomUUID } from "node:crypto";

/**
 * Trigger type.
 */
export type TriggerType = "time" | "event" | "topic";

/**
 * Trigger status.
 */
export type TriggerStatus = "active" | "paused" | "fired" | "error";

/**
 * Time-based trigger condition.
 */
export interface TimeCondition {
  type: "time";
  /** Cron expression for recurring triggers */
  cron?: string;
  /** One-time trigger at specific date */
  at?: string;
  /** Interval in milliseconds for repeating triggers */
  intervalMs?: number;
}

/**
 * Event-based trigger condition.
 */
export interface EventCondition {
  type: "event";
  /** Event type to watch */
  eventType: "message_received" | "contact_offline" | "contact_online" | "escalation_detected" | "trust_changed";
  /** Contact owner ID filter (optional) */
  contactOwnerId?: string;
  /** Match expression */
  matchPattern?: string;
}

/**
 * Topic-based trigger condition.
 */
export interface TopicCondition {
  type: "topic";
  /** Keywords or phrases to match */
  keywords: string[];
  /** Whether to match all keywords (AND) or any (OR) */
  matchAll: boolean;
}

/**
 * Trigger condition.
 */
export type TriggerCondition = TimeCondition | EventCondition | TopicCondition;

/**
 * Trigger action.
 */
export interface TriggerAction {
  /** Action type */
  type: "send_chat" | "query_knowledge" | "send_digest" | "notify_owner" | "follow_up";
  /** Target contact (for send_chat, follow_up) */
  targetContactOwnerId?: string;
  /** Message template (supports {{variables}}) */
  messageTemplate?: string;
  /** Query for knowledge action */
  query?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Proactive trigger definition.
 */
export interface ProactiveTrigger {
  id: string;
  name: string;
  description?: string;
  triggerType: TriggerType;
  condition: TriggerCondition;
  action: TriggerAction;
  enabled: boolean;
  status: TriggerStatus;
  maxFiresPerDay: number;
  firesToday: number;
  lastFiredAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: "owner" | "agent";
}

/**
 * Trigger execution context.
 */
export interface TriggerContext {
  triggerId: string;
  triggerName: string;
  firedAt: string;
  reason: string;
  contactOwnerId?: string;
  eventData?: unknown;
}

/**
 * Trigger execution result.
 */
export interface TriggerResult {
  success: boolean;
  triggerId: string;
  firedAt: string;
  actionTaken: string;
  outcome: "executed" | "skipped" | "error";
  error?: string;
  auditEventId?: string;
}

/**
 * Create a new trigger.
 */
export function createTrigger(
  name: string,
  triggerType: TriggerType,
  condition: TriggerCondition,
  action: TriggerAction,
  createdBy: "owner" | "agent" = "owner",
): ProactiveTrigger {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name,
    triggerType,
    condition,
    action,
    enabled: true,
    status: "active",
    maxFiresPerDay: triggerType === "time" ? 1 : 10,
    firesToday: 0,
    createdAt: now,
    updatedAt: now,
    createdBy,
  };
}

/**
 * Parse cron expression to check if it matches a given time.
 * Simplified implementation for basic cron expressions.
 */
export function isCronMatch(cron: string, date: Date): boolean {
  const parts = cron.split(" ");
  if (parts.length !== 5) return false;

  const [minuteStr, hourStr, dayOfMonthStr, monthStr, dayOfWeekStr] = parts;

  const minute = minuteStr === "*" ? null : parseInt(minuteStr, 10);
  const hour = hourStr === "*" ? null : parseInt(hourStr, 10);
  const dayOfMonth = dayOfMonthStr === "*" ? null : parseInt(dayOfMonthStr, 10);
  const month = monthStr === "*" ? null : parseInt(monthStr, 10);
  const dayOfWeek = dayOfWeekStr === "*" ? null : parseInt(dayOfWeekStr, 10);

  const currentMinute = date.getUTCMinutes();
  const currentHour = date.getUTCHours();
  const currentDayOfMonth = date.getUTCDate();
  const currentMonth = date.getUTCMonth() + 1;
  const currentDayOfWeek = date.getUTCDay();

  if (minute !== null && minute !== currentMinute) return false;
  if (hour !== null && hour !== currentHour) return false;
  if (dayOfMonth !== null && dayOfMonth !== currentDayOfMonth) return false;
  if (month !== null && month !== currentMonth) return false;
  if (dayOfWeek !== null && dayOfWeek !== currentDayOfWeek) return false;

  return true;
}

/**
 * Check if a time trigger should fire.
 */
export function shouldFireTimeTrigger(trigger: ProactiveTrigger, now: Date): boolean {
  if (!trigger.enabled || trigger.status !== "active") return false;
  if (trigger.triggerType !== "time") return false;

  const condition = trigger.condition as TimeCondition;

  // Check daily fire limit
  if (trigger.firesToday >= trigger.maxFiresPerDay) return false;

  // Check one-time trigger
  if (condition.at) {
    const atDate = new Date(condition.at);
    if (now.getTime() >= atDate.getTime()) {
      return true;
    }
  }

  // Check cron-based trigger
  if (condition.cron) {
    return isCronMatch(condition.cron, now);
  }

  return false;
}

/**
 * Check if an event trigger should fire.
 */
export function shouldFireEventTrigger(
  trigger: ProactiveTrigger,
  eventType: string,
  eventData?: unknown,
): boolean {
  if (!trigger.enabled || trigger.status !== "active") return false;
  if (trigger.triggerType !== "event") return false;

  const condition = trigger.condition as EventCondition;

  if (condition.eventType !== eventType) return false;
  if (condition.contactOwnerId && eventData) {
    const data = eventData as { contactOwnerId?: string };
    if (data.contactOwnerId !== condition.contactOwnerId) return false;
  }

  // Check pattern match if specified
  if (condition.matchPattern && eventData) {
    const data = eventData as { message?: string };
    if (data.message && !data.message.toLowerCase().includes(condition.matchPattern.toLowerCase())) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a topic trigger should fire.
 */
export function shouldFireTopicTrigger(trigger: ProactiveTrigger, content: string): boolean {
  if (!trigger.enabled || trigger.status !== "active") return false;
  if (trigger.triggerType !== "topic") return false;

  const condition = trigger.condition as TopicCondition;
  const lowerContent = content.toLowerCase();

  if (condition.matchAll) {
    return condition.keywords.every((kw) => lowerContent.includes(kw.toLowerCase()));
  } else {
    return condition.keywords.some((kw) => lowerContent.includes(kw.toLowerCase()));
  }
}

/**
 * Reset daily fire counts (call at start of new day).
 */
export function resetDailyFireCounts(triggers: ProactiveTrigger[]): ProactiveTrigger[] {
  const now = new Date().toISOString();
  return triggers.map((t) => ({
    ...t,
    firesToday: 0,
    updatedAt: now,
  }));
}

/**
 * Trigger Store manages proactive triggers.
 */
export class TriggerStore {
  private triggers: Map<string, ProactiveTrigger>;
  private listeners: Map<string, (trigger: ProactiveTrigger) => void>;

  constructor() {
    this.triggers = new Map();
    this.listeners = new Map();
  }

  /**
   * Add a trigger.
   */
  addTrigger(trigger: ProactiveTrigger): void {
    this.triggers.set(trigger.id, trigger);
  }

  /**
   * Remove a trigger.
   */
  removeTrigger(triggerId: string): boolean {
    return this.triggers.delete(triggerId);
  }

  /**
   * Get a trigger by ID.
   */
  getTrigger(triggerId: string): ProactiveTrigger | undefined {
    return this.triggers.get(triggerId);
  }

  /**
   * Update a trigger.
   */
  updateTrigger(triggerId: string, updates: Partial<ProactiveTrigger>): ProactiveTrigger | undefined {
    const existing = this.triggers.get(triggerId);
    if (!existing) return undefined;

    const updated: ProactiveTrigger = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.triggers.set(triggerId, updated);

    // Notify listeners
    const listener = this.listeners.get(triggerId);
    if (listener) {
      listener(updated);
    }

    return updated;
  }

  /**
   * List all triggers.
   */
  listTriggers(): ProactiveTrigger[] {
    return Array.from(this.triggers.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * List triggers by type.
   */
  listTriggersByType(triggerType: TriggerType): ProactiveTrigger[] {
    return this.listTriggers().filter((t) => t.triggerType === triggerType);
  }

  /**
   * List enabled triggers.
   */
  listEnabledTriggers(): ProactiveTrigger[] {
    return this.listTriggers().filter((t) => t.enabled && t.status === "active");
  }

  /**
   * Register a listener for trigger updates.
   */
  onUpdate(triggerId: string, listener: (trigger: ProactiveTrigger) => void): () => void {
    this.listeners.set(triggerId, listener);
    return () => this.listeners.delete(triggerId);
  }

  /**
   * Check time triggers and return those that should fire.
   */
  checkTimeTriggers(now: Date = new Date()): ProactiveTrigger[] {
    return this.listEnabledTriggers()
      .filter((t) => t.triggerType === "time")
      .filter((t) => shouldFireTimeTrigger(t, now));
  }

  /**
   * Check event trigger and return if it should fire.
   */
  checkEventTrigger(
    triggerId: string,
    eventType: string,
    eventData?: unknown,
  ): boolean {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) return false;
    return shouldFireEventTrigger(trigger, eventType, eventData);
  }

  /**
   * Check topic triggers against content.
   */
  checkTopicTriggers(content: string): ProactiveTrigger[] {
    return this.listEnabledTriggers()
      .filter((t) => t.triggerType === "topic")
      .filter((t) => shouldFireTopicTrigger(t, content));
  }

  /**
   * Record that a trigger fired.
   */
  recordFire(triggerId: string, error?: string): void {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) return;

    const now = new Date().toISOString();
    this.updateTrigger(triggerId, {
      firesToday: trigger.firesToday + 1,
      lastFiredAt: now,
      lastError: error,
      status: error ? "error" : "fired",
    });
  }

  /**
   * Reset daily counts for all triggers.
   */
  resetDailyCounts(): void {
    const now = new Date().toISOString();
    for (const trigger of this.triggers.values()) {
      if (trigger.firesToday > 0) {
        this.triggers.set(trigger.id, {
          ...trigger,
          firesToday: 0,
          updatedAt: now,
        });
      }
    }
  }
}

/**
 * Build the mesh.list-triggers tool.
 */
export function buildListTriggersTool(
  store: TriggerStore,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; triggers: ProactiveTrigger[]; count: number }> {
  return async (params) => {
    const typeFilter = params.type as TriggerType | undefined;
    let triggers = store.listTriggers();

    if (typeFilter) {
      triggers = triggers.filter((t) => t.triggerType === typeFilter);
    }

    return { ok: true, triggers, count: triggers.length };
  };
}

/**
 * Build the mesh.add-trigger tool.
 */
export function buildAddTriggerTool(
  store: TriggerStore,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; trigger?: ProactiveTrigger; error?: string }> {
  return async (params) => {
    const name = params.name as string | undefined;
    const triggerType = params.triggerType as TriggerType | undefined;
    const condition = params.condition as TriggerCondition | undefined;
    const action = params.action as TriggerAction | undefined;
    const description = params.description as string | undefined;

    if (!name) {
      return { ok: false, error: "name is required" };
    }

    if (!triggerType || !["time", "event", "topic"].includes(triggerType)) {
      return { ok: false, error: "triggerType must be 'time', 'event', or 'topic'" };
    }

    if (!condition) {
      return { ok: false, error: "condition is required" };
    }

    if (!action) {
      return { ok: false, error: "action is required" };
    }

    const trigger = createTrigger(name, triggerType, condition, action);
    if (description) {
      trigger.description = description;
    }

    store.addTrigger(trigger);
    return { ok: true, trigger };
  };
}

/**
 * Build the mesh.remove-trigger tool.
 */
export function buildRemoveTriggerTool(
  store: TriggerStore,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }> {
  return async (params) => {
    const triggerId = params.triggerId as string | undefined;

    if (!triggerId) {
      return { ok: false, error: "triggerId is required" };
    }

    const removed = store.removeTrigger(triggerId);
    if (!removed) {
      return { ok: false, error: "Trigger not found" };
    }

    return { ok: true };
  };
}

/**
 * Build the mesh.update-trigger tool.
 */
export function buildUpdateTriggerTool(
  store: TriggerStore,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; trigger?: ProactiveTrigger; error?: string }> {
  return async (params) => {
    const triggerId = params.triggerId as string | undefined;
    const enabled = params.enabled as boolean | undefined;
    const name = params.name as string | undefined;
    const description = params.description as string | undefined;

    if (!triggerId) {
      return { ok: false, error: "triggerId is required" };
    }

    const existing = store.getTrigger(triggerId);
    if (!existing) {
      return { ok: false, error: "Trigger not found" };
    }

    const updates: Partial<ProactiveTrigger> = {};
    if (enabled !== undefined) updates.enabled = enabled;
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    const updated = store.updateTrigger(triggerId, updates);
    return { ok: true, trigger: updated };
  };
}
