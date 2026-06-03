/**
 * Continuity Service (Phase 25B)
 *
 * Tracks active agent sessions across devices, enabling the owner to
 * resume tasks from any device. Session state is stored locally and
 * synced via sync.state when devices reconnect.
 */

import { randomUUID } from "node:crypto";

export interface ContinuitySession {
  sessionId: string;
  correlationId: string;
  /** What the owner was working on. */
  description: string;
  /** Free-text progress message (e.g. "Researching Kubernetes operators"). */
  progress: string;
  /** Current step number (0-indexed). */
  currentStep: number;
  /** Total number of steps in the workflow (0 = unknown). */
  totalSteps: number;
  /** Device that started the session. */
  originDevice: string;
  /** ISO timestamp of last update. */
  lastUpdatedAt: string;
  /** Whether the session is still active. */
  active: boolean;
}

export interface ContinuityDeps {
  /** List all active continuity sessions. */
  listSessions: () => Promise<ContinuitySession[]>;
  /** Save/update a session. */
  saveSession: (session: ContinuitySession) => Promise<void>;
  /** Get the current device identifier. */
  getDeviceId: () => string;
}

/**
 * Create a new continuity session when a task starts.
 */
export async function startContinuitySession(
  deps: ContinuityDeps,
  description: string,
  correlationId?: string,
): Promise<ContinuitySession> {
  const session: ContinuitySession = {
    sessionId: randomUUID(),
    correlationId: correlationId ?? randomUUID(),
    description,
    progress: "Starting...",
    currentStep: 0,
    totalSteps: 0,
    originDevice: deps.getDeviceId(),
    lastUpdatedAt: new Date().toISOString(),
    active: true,
  };
  await deps.saveSession(session);
  return session;
}

/**
 * Update progress on an active continuity session.
 */
export async function updateContinuitySession(
  deps: ContinuityDeps,
  sessionId: string,
  update: { progress?: string; currentStep?: number; totalSteps?: number; description?: string },
): Promise<ContinuitySession | null> {
  const sessions = await deps.listSessions();
  const session = sessions.find((s) => s.sessionId === sessionId && s.active);
  if (!session) return null;

  session.progress = update.progress ?? session.progress;
  session.currentStep = update.currentStep ?? session.currentStep;
  session.totalSteps = update.totalSteps ?? session.totalSteps;
  session.description = update.description ?? session.description;
  session.lastUpdatedAt = new Date().toISOString();
  await deps.saveSession(session);
  return session;
}

/**
 * Complete a continuity session (mark as inactive).
 */
export async function completeContinuitySession(
  deps: ContinuityDeps,
  sessionId: string,
): Promise<void> {
  const sessions = await deps.listSessions();
  const session = sessions.find((s) => s.sessionId === sessionId);
  if (session) {
    session.active = false;
    session.currentStep = session.totalSteps;
    session.progress = "Completed";
    session.lastUpdatedAt = new Date().toISOString();
    await deps.saveSession(session);
  }
}

/**
 * Get sessions that can be resumed on the current device.
 */
export async function getResumableSessions(
  deps: ContinuityDeps,
): Promise<ContinuitySession[]> {
  const sessions = await deps.listSessions();
  return sessions
    .filter((s) => s.active)
    .sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime());
}
