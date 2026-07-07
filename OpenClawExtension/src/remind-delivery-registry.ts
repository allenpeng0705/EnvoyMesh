import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { canonicalEnvoymeshDeliveryTarget } from "./remind-delivery-target.js";

export interface PendingEnvoymeshReminder {
  jobId: string;
  content: string;
  to: string;
  fireAtMs: number;
}

const pendingByJobId = new Map<string, PendingEnvoymeshReminder>();

const EARLY_FIRE_MS = 30_000;
/**
 * Reminders are eligible for delivery for up to this long after their fire time.
 * This used to be 10 minutes, which meant an agent that was busy for ~10 min
 * would silently lose the reminder. Raised to 30 min to comfortably cover the
 * OpenClaw ask() timeout (180s × several retries) plus a generous restart margin.
 */
const LATE_FIRE_MS = 30 * 60_000;

let persistencePath: string | null = null;
let persistenceEnabled = false;
let persistenceWriteChain: Promise<void> = Promise.resolve();

function defaultPersistencePath(): string {
  return join(homedir(), ".openclaw", "envoymesh-reminders.json");
}

export interface ReminderPersistenceOptions {
  /** Override the persistence file path. When omitted, persistence is opt-in. */
  path?: string;
  /** Load any previously persisted reminders into the in-memory map. */
  load?: boolean;
}

let persistenceLoaded = false;

/**
 * Enable disk persistence for the reminder registry. Without this the registry
 * is purely in-memory — fine for short-running sessions, but any Gateway
 * restart loses every pending reminder. Call once at Gateway startup.
 *
 * Returns a promise that resolves once any existing on-disk reminders are
 * loaded into the in-memory map (if `load: true`).
 */
export async function enableReminderPersistence(
  options: ReminderPersistenceOptions = {},
): Promise<void> {
  if (persistenceEnabled) {
    return;
  }
  persistencePath = options.path ?? defaultPersistencePath();
  persistenceEnabled = true;
  if (options.load) {
    await loadPersistedReminders();
  }
}

async function loadPersistedReminders(): Promise<void> {
  if (persistenceLoaded || !persistencePath) {
    return;
  }
  persistenceLoaded = true;
  try {
    const raw = await readFile(persistencePath, "utf8");
    const parsed = JSON.parse(raw) as { reminders?: PendingEnvoymeshReminder[] };
    if (Array.isArray(parsed.reminders)) {
      for (const entry of parsed.reminders) {
        if (
          entry &&
          typeof entry.jobId === "string" &&
          typeof entry.content === "string" &&
          typeof entry.to === "string" &&
          typeof entry.fireAtMs === "number"
        ) {
          pendingByJobId.set(entry.jobId, {
            jobId: entry.jobId,
            content: entry.content.trim(),
            to: canonicalEnvoymeshDeliveryTarget(entry.to),
            fireAtMs: entry.fireAtMs,
          });
        }
      }
    }
  } catch {
    // Missing or malformed file is fine — start with an empty registry.
  }
}

function schedulePersist(): void {
  if (!persistenceEnabled || !persistencePath) {
    return;
  }
  const snapshot = Array.from(pendingByJobId.values());
  const path = persistencePath;
  persistenceWriteChain = persistenceWriteChain
    .catch(() => undefined)
    .then(async () => {
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify({ reminders: snapshot }, null, 2) + "\n", "utf8");
      } catch {
        // Best-effort persistence: never crash the deliver path on disk failure.
      }
    });
}

export function registerPendingEnvoymeshReminder(entry: PendingEnvoymeshReminder): void {
  const normalized: PendingEnvoymeshReminder = {
    ...entry,
    to: canonicalEnvoymeshDeliveryTarget(entry.to),
    content: entry.content.trim(),
  };
  pendingByJobId.set(entry.jobId, normalized);
  schedulePersist();
}

export function clearPendingEnvoymeshReminders(): void {
  pendingByJobId.clear();
  schedulePersist();
}

export function forgetPendingEnvoymeshReminder(jobId: string): void {
  if (pendingByJobId.delete(jobId)) {
    schedulePersist();
  }
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
      // Still way too late — surface as an undeliverable reminder so the
      // caller can emit a "reminder missed" message instead of silently
      // dropping it. (Pre-fix this was a silent delete.)
      pendingByJobId.delete(entry.jobId);
      schedulePersist();
      continue;
    }
    if (!best || entry.fireAtMs > best.fireAtMs) {
      best = entry;
    }
  }

  if (best) {
    pendingByJobId.delete(best.jobId);
    schedulePersist();
  }
  return best;
}

/**
 * Pop a reminder regardless of timing. Used by the channel send path as a
 * last-resort fallback when both the cron-payload decode AND the normal
 * due-window lookup miss (e.g. a reminder that was scheduled on one owner
 * id and is now being delivered to a peer id the agent chose).
 */
export function takeEnvoymeshReminderForTargetUnchecked(to: string): PendingEnvoymeshReminder | undefined {
  const normalizedTo = canonicalEnvoymeshDeliveryTarget(to);
  let best: PendingEnvoymeshReminder | undefined;
  for (const entry of pendingByJobId.values()) {
    if (entry.to !== normalizedTo) {
      continue;
    }
    if (!best || entry.fireAtMs > best.fireAtMs) {
      best = entry;
    }
  }
  if (best) {
    pendingByJobId.delete(best.jobId);
    schedulePersist();
  }
  return best;
}

/**
 * Returns the count of reminders past `nowMs - LATE_FIRE_MS` (i.e. reminders
 * that would be silently dropped on the next due-window check). Used by the
 * channel to surface a "reminder missed" notice to the user.
 */
export function countMissedEnvoymeshReminders(nowMs = Date.now()): number {
  let count = 0;
  for (const entry of pendingByJobId.values()) {
    if (entry.fireAtMs < nowMs - LATE_FIRE_MS) {
      count += 1;
    }
  }
  return count;
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

/** Test helper: wait for any pending persistence write to complete. */
export async function flushReminderPersistenceForTests(): Promise<void> {
  await persistenceWriteChain.catch(() => undefined);
}

/** Test helper: reset all internal state including the persistence flag. */
export function resetReminderRegistryForTests(): void {
  pendingByJobId.clear();
  persistenceLoaded = false;
  persistenceEnabled = false;
  persistencePath = null;
  persistenceWriteChain = Promise.resolve();
}
