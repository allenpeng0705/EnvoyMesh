/**
 * Cross-device continuity runtime (Phase 25).
 *
 * Extracted from `node-service-impl.ts`. The continuity service tracks
 * active agent sessions across devices, enabling the owner to resume
 * tasks from any device. State is held in a per-profile JSON file so
 * sessions survive restarts. Real cross-device sync is wired via
 * sync.state in a follow-on.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  completeContinuitySession as csComplete,
  getResumableSessions as csResumable,
  startContinuitySession as csStart,
  updateContinuitySession as csUpdate,
  type ContinuityDeps,
  type ContinuitySession,
} from "./continuity-service.js";

/* ---------- Store: owns the in-memory list + JSON file ---------- */

export interface ContinuityStoreDeps {
  /** Resolve the JSON file path under the local profile dir, or null if unavailable. */
  getFilePath(): string | null;
}

export class ContinuityStore {
  private readonly getFilePath: () => string | null;
  private sessions: ContinuitySession[] = [];
  private loaded = false;

  constructor(opts: ContinuityStoreDeps) {
    this.getFilePath = opts.getFilePath;
  }

  /** Read the session list from disk, dropping malformed entries. */
  async loadFromDisk(): Promise<ContinuitySession[]> {
    const path = this.getFilePath();
    if (!path) return [];
    let parsed: unknown;
    try {
      const raw = await readFile(path, "utf8");
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!parsed || typeof parsed !== "object") return [];
    const sessions = (parsed as { sessions?: unknown }).sessions;
    if (!Array.isArray(sessions)) return [];
    this.sessions = sessions.filter(
      (s): s is ContinuitySession =>
        !!s &&
        typeof s === "object" &&
        typeof (s as Record<string, unknown>).sessionId === "string" &&
        typeof (s as Record<string, unknown>).description === "string",
    );
    this.loaded = true;
    return [...this.sessions];
  }

  /** Return a defensive copy of the in-memory list. */
  list(): ContinuitySession[] {
    return [...this.sessions];
  }

  /**
   * Upsert a single session (used as `saveSession` for the service).
   * Replaces any existing session with the same `sessionId`, then
   * persists the full list to disk.
   */
  async upsert(session: ContinuitySession): Promise<void> {
    const without = this.sessions.filter((s) => s.sessionId !== session.sessionId);
    this.sessions = [...without, session];
    await this.persist();
  }

  /** Overwrite the full session list (used by the class on reset). */
  async setAll(sessions: ContinuitySession[]): Promise<void> {
    this.sessions = sessions;
    await this.persist();
  }

  /** Drop all in-memory entries (no disk effect). */
  clear(): void {
    this.sessions = [];
    this.loaded = false;
  }

  /** Persist the in-memory list to the JSON file. */
  private async persist(): Promise<void> {
    const path = this.getFilePath();
    if (!path) return;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({ version: "0.1", sessions: this.sessions }, null, 2),
      { mode: 0o600 },
    );
  }
}

/* ---------- High-level operations (wrappers over the service module) ---------- */

export interface ContinuityContext {
  /** The store the class constructs. The runtime never builds one internally. */
  store: ContinuityStore;
  /** Resolve the local device id, used as the origin device for new sessions. */
  getDeviceId(): string;
}

function buildDeps(ctx: ContinuityContext): ContinuityDeps {
  return {
    listSessions: () => Promise.resolve(ctx.store.list()),
    saveSession: (session) => ctx.store.upsert(session),
    getDeviceId: () => ctx.getDeviceId(),
  };
}

export async function startContinuitySessionViaRuntime(
  ctx: ContinuityContext,
  description: string,
  opts?: { correlationId?: string; deviceType?: string },
): Promise<ContinuitySession & { deviceType?: string }> {
  // Build the session with deviceType pre-applied so we save exactly once.
  // The continuity-service dep's saveSession writes the full list —
  // passing it the enriched session means a single read+write per start
  // call, with no race window between saves.
  const created = await csStart(
    {
      ...buildDeps(ctx),
      getDeviceId: () => opts?.deviceType ?? ctx.getDeviceId(),
    },
    description,
    opts?.correlationId,
  );
  // Defensive: if saveSession was somehow never invoked (it always is
  // in the current continuity-service), still return a value that
  // includes the deviceType. The session came from csStart which we
  // just called.
  return { ...created, deviceType: opts?.deviceType };
}

export async function updateContinuitySessionViaRuntime(
  ctx: ContinuityContext,
  sessionId: string,
  update: { progress?: string; currentStep?: number; totalSteps?: number; description?: string },
): Promise<ContinuitySession | null> {
  return csUpdate(buildDeps(ctx), sessionId, update);
}

export async function completeContinuitySessionViaRuntime(
  ctx: ContinuityContext,
  sessionId: string,
): Promise<void> {
  await csComplete(buildDeps(ctx), sessionId);
}

export async function getResumableSessionsViaRuntime(
  ctx: ContinuityContext,
): Promise<ContinuitySession[]> {
  return csResumable(buildDeps(ctx));
}

/* ---------- File-path helper ---------- */

export function buildContinuityFilePath(profileDir: string | null): string | null {
  if (!profileDir) return null;
  return join(profileDir, "continuity-sessions.json");
}