/**
 * Client-side Coding Tier B (Ext Agent) session registry.
 * EH / Pi live on the home node; Tier B sessions are local only.
 */

import {
  codingHarnessLabel,
  ehChatTitleFromUserPrompt,
  EH_CHAT_PLACEHOLDER_TITLE,
  isCodingTierBHarness,
  type CodingHarnessId,
} from "@envoymesh/api";

const STORAGE_KEY = "envoymesh.codingExtSessions";

/** Fired when the Tier B session list changes. */
export const CODING_EXT_SESSIONS_CHANGED_EVENT =
  "envoymesh:coding-ext-sessions-changed";

export type CodingExtSession = {
  id: string;
  harness: CodingHarnessId;
  cwd: string;
  title: string;
  createdAt: string;
  lastUsedAt: string;
  model?: string;
  providerKind?: "openai-compatible" | "anthropic-compatible";
  endpoint?: string;
  apiKey?: string;
};

function emitChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CODING_EXT_SESSIONS_CHANGED_EVENT));
  }
}

function newId(harness: CodingHarnessId): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `ext:${harness}:${uuid}`;
}

export function loadCodingExtSessions(): CodingExtSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: CodingExtSession[] = [];
    const seen = new Set<string>();
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Partial<CodingExtSession>;
      const id = String(r.id ?? "").trim();
      const harness = String(r.harness ?? "").trim() as CodingHarnessId;
      const cwd = String(r.cwd ?? "").trim();
      if (!id || !cwd || !isCodingTierBHarness(harness)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      const createdAt =
        typeof r.createdAt === "string" && r.createdAt
          ? r.createdAt
          : new Date().toISOString();
      out.push({
        id,
        harness,
        cwd,
        title:
          typeof r.title === "string" && r.title.trim()
            ? r.title.trim()
            : EH_CHAT_PLACEHOLDER_TITLE,
        createdAt,
        lastUsedAt:
          typeof r.lastUsedAt === "string" && r.lastUsedAt
            ? r.lastUsedAt
            : createdAt,
        ...(typeof r.model === "string" && r.model.trim()
          ? { model: r.model.trim() }
          : {}),
        ...(r.providerKind === "openai-compatible" ||
        r.providerKind === "anthropic-compatible"
          ? { providerKind: r.providerKind }
          : {}),
        ...(typeof r.endpoint === "string" && r.endpoint.trim()
          ? { endpoint: r.endpoint.trim() }
          : {}),
        ...(typeof r.apiKey === "string" && r.apiKey.trim()
          ? { apiKey: r.apiKey.trim() }
          : {}),
      });
    }
    return out.sort((a, b) =>
      b.lastUsedAt.localeCompare(a.lastUsedAt),
    );
  } catch {
    return [];
  }
}

function saveCodingExtSessions(sessions: CodingExtSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    /* private mode */
  }
  emitChanged();
}

export function createCodingExtSession(opts: {
  harness: CodingHarnessId;
  cwd: string;
  title?: string;
  model?: string;
  providerKind?: "openai-compatible" | "anthropic-compatible";
  endpoint?: string;
  apiKey?: string;
}): CodingExtSession {
  if (!isCodingTierBHarness(opts.harness)) {
    throw new Error(`Not a Tier B harness: ${opts.harness}`);
  }
  const cwd = opts.cwd.trim();
  if (!cwd) throw new Error("cwd is required");
  const now = new Date().toISOString();
  const model = opts.model?.trim();
  const endpoint = opts.endpoint?.trim();
  const apiKey = opts.apiKey?.trim();
  const session: CodingExtSession = {
    id: newId(opts.harness),
    harness: opts.harness,
    cwd,
    title: opts.title?.trim() || EH_CHAT_PLACEHOLDER_TITLE,
    createdAt: now,
    lastUsedAt: now,
    ...(model ? { model } : {}),
    ...(opts.providerKind === "openai-compatible" ||
    opts.providerKind === "anthropic-compatible"
      ? { providerKind: opts.providerKind }
      : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(apiKey ? { apiKey } : {}),
  };
  const all = loadCodingExtSessions();
  all.unshift(session);
  saveCodingExtSessions(all);
  return session;
}

export function touchCodingExtSession(id: string): void {
  const all = loadCodingExtSessions();
  const i = all.findIndex((s) => s.id === id);
  if (i < 0) return;
  all[i] = { ...all[i], lastUsedAt: new Date().toISOString() };
  saveCodingExtSessions(all);
}

/** Whether title is still a create-time placeholder (safe to replace from first prompt). */
export function shouldAutoSetCodingExtTitle(
  title: string,
  harness: CodingHarnessId,
): boolean {
  const trimmed = title.trim();
  if (!trimmed || trimmed === EH_CHAT_PLACEHOLDER_TITLE) return true;
  if (trimmed === harness) return true;
  try {
    if (trimmed === codingHarnessLabel(harness)) return true;
  } catch {
    /* unknown harness label */
  }
  return false;
}

/** Persist a new title (e.g. first user prompt). No-op if session missing or title empty. */
export function updateCodingExtSessionTitle(id: string, title: string): void {
  const next = title.trim();
  if (!next) return;
  const all = loadCodingExtSessions();
  const i = all.findIndex((s) => s.id === id);
  if (i < 0) return;
  if (all[i].title === next) return;
  all[i] = {
    ...all[i],
    title: next,
    lastUsedAt: new Date().toISOString(),
  };
  saveCodingExtSessions(all);
}

/**
 * If the session still has a placeholder title, set it from the first user prompt.
 * Returns the title that was applied, or null if unchanged.
 */
export function maybeAutoTitleCodingExtSession(
  id: string,
  prompt: string,
): string | null {
  const session = getCodingExtSession(id);
  if (!session) return null;
  if (!shouldAutoSetCodingExtTitle(session.title, session.harness)) return null;
  const next = ehChatTitleFromUserPrompt(prompt);
  if (next === EH_CHAT_PLACEHOLDER_TITLE) return null;
  updateCodingExtSessionTitle(id, next);
  return next;
}

export function removeCodingExtSession(id: string): void {
  const next = loadCodingExtSessions().filter((s) => s.id !== id);
  saveCodingExtSessions(next);
}

export function getCodingExtSession(id: string): CodingExtSession | null {
  return loadCodingExtSessions().find((s) => s.id === id) ?? null;
}
