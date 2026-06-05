import { resolveExpiresAtMsFromDurationMs } from "openclaw/plugin-sdk/number-runtime";
import { canonicalEnvoymeshDeliveryTarget, normalizeEnvoymeshDeliveryTarget } from "./remind-delivery-target.js";
import { encodeEnvoymeshCronPayload } from "./remind-payload.js";
import {
  extractCronJobId,
  registerPendingEnvoymeshReminder,
} from "./remind-delivery-registry.js";

const CHANNEL_ID = "envoymesh";
const DEFAULT_ACCOUNT_ID = "default";

export interface RemindParams {
  action: "add" | "list" | "remove";
  content?: string;
  to?: string;
  time?: string;
  timezone?: string;
  name?: string;
  jobId?: string;
}

interface RemindExecuteContext {
  fallbackTo?: string;
  fallbackAccountId?: string;
}

export type RemindCronAction =
  | { action: "list" }
  | { action: "remove"; jobId: string }
  | {
      action: "add";
      job: ReturnType<typeof buildOnceJob>["job"] | ReturnType<typeof buildCronJob>["job"];
    };

type RemindCronScheduler = (params: RemindCronAction) => Promise<unknown>;

type RemindCronPlan =
  | {
      ok: true;
      action: RemindParams["action"];
      cronAction: RemindCronAction;
      summary?: string;
      fireAtMs?: number;
      deliveryTo?: string;
      reminderContent?: string;
    }
  | {
      ok: false;
      error: string;
    };

export const RemindSchema = {
  type: "object",
  properties: {
    action: {
      type: "string",
      description:
        "Action type. add=create a reminder, list=show reminders, remove=delete a reminder.",
      enum: ["add", "list", "remove"],
    },
    content: {
      type: "string",
      description:
        'Reminder text the owner should receive, e.g. "drink water". Required when action=add.',
    },
    to: {
      type: "string",
      description:
        "Optional delivery target. Usually omitted — resolved from the current EnvoyAI chat.",
    },
    time: {
      type: "string",
      description:
        'When to fire. Relative: "5m", "1h", "90s". Recurring cron: "0 8 * * *". Required when action=add.',
    },
    timezone: {
      type: "string",
      description: 'Timezone for cron expressions. Defaults to host local timezone when omitted.',
    },
    name: {
      type: "string",
      description: "Optional job name.",
    },
    jobId: {
      type: "string",
      description: "Job id to remove (from list). Required when action=remove.",
    },
  },
  required: ["action"],
} as const;

export function parseRelativeTime(timeStr: string): number | null {
  const s = timeStr.trim().toLowerCase();
  if (/^\d+$/.test(s)) {
    return Number.parseInt(s, 10) * 60_000;
  }

  let totalMs = 0;
  let matched = false;
  let consumed = 0;
  const regex = /(\d+(?:\.\d+)?)\s*(d|h|m|s)\s*/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(s)) !== null) {
    if (match.index !== consumed) {
      return null;
    }
    matched = true;
    consumed = regex.lastIndex;
    const value = Number.parseFloat(match[1]);
    const unit = match[2];
    switch (unit) {
      case "d":
        totalMs += value * 86_400_000;
        break;
      case "h":
        totalMs += value * 3_600_000;
        break;
      case "m":
        totalMs += value * 60_000;
        break;
      case "s":
        totalMs += value * 1_000;
        break;
    }
  }
  return matched && consumed === s.length ? Math.round(totalMs) : null;
}

export function isCronExpression(timeStr: string): boolean {
  const parts = timeStr.trim().split(/\s+/);
  if (parts.length < 3 || parts.length > 6) {
    return false;
  }
  return parts.every((p) => /^[0-9*?/,LW#-]/.test(p));
}

export function generateJobName(content: string): string {
  const trimmed = content.trim();
  const short = trimmed.length > 20 ? `${trimmed.slice(0, 20)}…` : trimmed;
  return `Reminder: ${short}`;
}

function buildDirectReminderCronMessage(content: string, to: string): string {
  return encodeEnvoymeshCronPayload({
    type: "cron_reminder",
    content: content.trim(),
    targetAddress: normalizeEnvoymeshDeliveryTarget(to),
  });
}

function buildOnceJob(params: RemindParams, atMs: number, to: string, accountId: string) {
  const content = params.content!;
  const name = params.name || generateJobName(content);
  const normalizedTo = normalizeEnvoymeshDeliveryTarget(to);
  return {
    action: "add" as const,
    job: {
      name,
      schedule: { kind: "at" as const, at: new Date(atMs).toISOString() },
      sessionTarget: "isolated" as const,
      wakeMode: "now" as const,
      deleteAfterRun: true,
      payload: {
        kind: "agentTurn" as const,
        message: buildDirectReminderCronMessage(content, normalizedTo),
        lightContext: true,
        toolsAllow: [],
      },
      delivery: {
        mode: "announce" as const,
        channel: CHANNEL_ID,
        to: normalizeEnvoymeshDeliveryTarget(to),
        accountId,
      },
    },
  };
}

function buildCronJob(params: RemindParams, to: string, accountId: string) {
  const content = params.content!;
  const name = params.name || generateJobName(content);
  const tz = params.timezone?.trim();
  const normalizedTo = normalizeEnvoymeshDeliveryTarget(to);
  return {
    action: "add" as const,
    job: {
      name,
      schedule: {
        kind: "cron" as const,
        expr: params.time!.trim(),
        ...(tz ? { tz } : {}),
      },
      sessionTarget: "isolated" as const,
      wakeMode: "now" as const,
      payload: {
        kind: "agentTurn" as const,
        message: buildDirectReminderCronMessage(content, normalizedTo),
        lightContext: true,
        toolsAllow: [],
      },
      delivery: {
        mode: "announce" as const,
        channel: CHANNEL_ID,
        to: normalizeEnvoymeshDeliveryTarget(to),
        accountId,
      },
    },
  };
}

export function formatDelay(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h${minutes}m`;
}

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

function formatSchedulerError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function prepareRemindCronAction(
  params: RemindParams,
  ctx: RemindExecuteContext = {},
): RemindCronPlan {
  if (params.action === "list") {
    return { ok: true, action: "list", cronAction: { action: "list" } };
  }

  if (params.action === "remove") {
    if (!params.jobId) {
      return { ok: false, error: "jobId is required when action=remove. Use action=list first." };
    }
    return {
      ok: true,
      action: "remove",
      cronAction: { action: "remove", jobId: params.jobId },
    };
  }

  if (!params.content?.trim()) {
    return { ok: false, error: "content is required when action=add" };
  }
  const resolvedTo = params.to || ctx.fallbackTo;
  if (!resolvedTo?.trim()) {
    return {
      ok: false,
      error:
        "Unable to determine delivery target for action=add. " +
        "Reminders can only be scheduled from an active EnvoyAI chat.",
    };
  }
  if (!params.time?.trim()) {
    return { ok: false, error: "time is required when action=add" };
  }
  const resolvedAccountId = ctx.fallbackAccountId?.trim() || DEFAULT_ACCOUNT_ID;

  const normalizedTo = canonicalEnvoymeshDeliveryTarget(resolvedTo);

  if (isCronExpression(params.time)) {
    return {
      ok: true,
      action: "add",
      cronAction: buildCronJob(params, resolvedTo, resolvedAccountId),
      summary: `⏰ Recurring reminder: "${params.content.trim()}" (${params.time.trim()}${params.timezone ? `, tz=${params.timezone}` : ""})`,
      fireAtMs: Date.now(),
      deliveryTo: normalizedTo,
      reminderContent: params.content.trim(),
    };
  }

  const delayMs = parseRelativeTime(params.time);
  if (delayMs == null) {
    return {
      ok: false,
      error: `Could not parse time format: ${params.time}. Use values like 5m, 1h, 90s, or a cron expression.`,
    };
  }
  if (delayMs < 30_000) {
    return { ok: false, error: "Reminder delay must be at least 30 seconds" };
  }
  const atMs = resolveExpiresAtMsFromDurationMs(delayMs);
  if (atMs === undefined) {
    return { ok: false, error: "Reminder time is outside the supported Date range" };
  }

  return {
    ok: true,
    action: "add",
    cronAction: buildOnceJob(params, atMs, resolvedTo, resolvedAccountId),
    summary: `⏰ Reminder in ${formatDelay(delayMs)}: "${params.content.trim()}"`,
    fireAtMs: atMs,
    deliveryTo: normalizedTo,
    reminderContent: params.content.trim(),
  };
}

export async function executeScheduledRemind(
  params: RemindParams,
  ctx: RemindExecuteContext,
  scheduler: RemindCronScheduler,
) {
  const plan = prepareRemindCronAction(params, ctx);
  if (!plan.ok) {
    return json({ error: plan.error });
  }

  try {
    const cronResult = await scheduler(plan.cronAction);
    if (
      plan.action === "add" &&
      plan.deliveryTo &&
      plan.reminderContent &&
      typeof plan.fireAtMs === "number"
    ) {
      const jobId = extractCronJobId(cronResult);
      if (jobId) {
        registerPendingEnvoymeshReminder({
          jobId,
          content: plan.reminderContent,
          to: plan.deliveryTo,
          fireAtMs: plan.fireAtMs,
        });
      }
    }
    return json({
      ok: true,
      action: plan.action,
      summary: plan.summary,
      cronResult,
    });
  } catch (error) {
    return json({
      error: `Failed to schedule reminder: ${formatSchedulerError(error)}`,
      action: plan.action,
    });
  }
}
