/**
 * Sticky Coding composer prefs (mode / fast / thinking) per task key.
 */

import type {
  CodingThinkingEffort,
  CodingWorkingMode,
} from "./coding-composer-capabilities.js";

const STORAGE_KEY = "envoymesh.codingComposerPrefs";

export type CodingComposerPrefs = {
  mode: CodingWorkingMode;
  fast: boolean;
  thinking: CodingThinkingEffort;
  /** Last model string shown/chosen in the toolbar. */
  model?: string;
};

const DEFAULT_PREFS: CodingComposerPrefs = {
  mode: "code",
  fast: false,
  thinking: "off",
};

function loadAll(): Record<string, CodingComposerPrefs> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, CodingComposerPrefs>;
  } catch {
    return {};
  }
}

function saveAll(all: Record<string, CodingComposerPrefs>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* private mode */
  }
}

export function codingComposerSessionKey(parts: {
  kind: "eh" | "pi" | "ext";
  id: string;
}): string {
  return `${parts.kind}:${parts.id.trim()}`;
}

export function loadCodingComposerPrefs(
  sessionKey: string,
): CodingComposerPrefs {
  const row = loadAll()[sessionKey];
  if (!row) return { ...DEFAULT_PREFS };
  return {
    mode:
      row.mode === "ask" || row.mode === "plan" || row.mode === "code"
        ? row.mode
        : "code",
    fast: Boolean(row.fast),
    thinking:
      row.thinking === "low" ||
      row.thinking === "medium" ||
      row.thinking === "high" ||
      row.thinking === "off"
        ? row.thinking
        : "off",
    ...(row.model?.trim() ? { model: row.model.trim() } : {}),
  };
}

export function saveCodingComposerPrefs(
  sessionKey: string,
  patch: Partial<CodingComposerPrefs>,
): CodingComposerPrefs {
  const all = loadAll();
  const next: CodingComposerPrefs = {
    ...loadCodingComposerPrefs(sessionKey),
    ...patch,
  };
  all[sessionKey] = next;
  saveAll(all);
  return next;
}
