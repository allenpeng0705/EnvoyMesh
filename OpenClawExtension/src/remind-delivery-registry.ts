import { canonicalEnvoymeshDeliveryTarget } from "./remind-delivery-target.js";

export interface PendingEnvoymeshReminder {
  jobId: string;
  content: string;
  to: string;
  fireAtMs: number;
}

const pendingByJobId = new Map<string, PendingEnvoymeshReminder>();

const EARLY_FIRE_MS = 30_000;
const LATE_FIRE_MS = 10 * 60_000;

export function registerPendingEnvoymeshReminder(entry: PendingEnvoymeshReminder): void {
  pendingByJobId.set(entry.jobId, {
    ...entry,
    to: canonicalEnvoymeshDeliveryTarget(entry.to),
    content: entry.content.trim(),
  });
}

export function clearPendingEnvoymeshReminders(): void {
  pendingByJobId.clear();
}

export function takeDueEnvoymeshReminderForTarget(
  to: string,
  nowMs = Date.now(),
): PendingEnvoymeshReminder | undefined {
  const normalizedTo = canonicalEnvoymeshDeliveryTarget(to);
  let best: PendingEnvoymeshReminder | undefined;

  for (const entry of pendingByJobId.values()) {
    if (entry.to !== normalizedTo) {
      continue;
    }
    if (entry.fireAtMs > nowMs + EARLY_FIRE_MS) {
      continue;
    }
    if (entry.fireAtMs < nowMs - LATE_FIRE_MS) {
      pendingByJobId.delete(entry.jobId);
      continue;
    }
    if (!best || entry.fireAtMs > best.fireAtMs) {
      best = entry;
    }
  }

  if (best) {
    pendingByJobId.delete(best.jobId);
  }
  return best;
}

export function extractCronJobId(cronResult: unknown): string | undefined {
  if (!cronResult || typeof cronResult !== "object") {
    return undefined;
  }
  const record = cronResult as Record<string, unknown>;
  const direct = record.id ?? record.jobId;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  const job = record.job;
  if (job && typeof job === "object") {
    const jobId = (job as Record<string, unknown>).id;
    if (typeof jobId === "string" && jobId.trim()) {
      return jobId.trim();
    }
  }
  return undefined;
}
