/**
 * Reset OpenClaw EnvoyAI-related sessions under the gateway state dir.
 * EnvoyAI trash clears the Social chat log; without this, OpenClaw keeps
 * multi-MB trajectory history and Local inference stays slow.
 */

import { existsSync } from "node:fs";
import { unlink, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { openClawGatewayStateDir } from "./openclaw-workspace.js";

export type ResetOpenClawEnvoyAiSessionsResult = {
  removedSessions: number;
  removedFiles: number;
};

function isEnvoyAiOpenClawSessionKey(key: string): boolean {
  const k = key.trim().toLowerCase();
  if (!k) return false;
  // Primary DM / UI agent session plus EnvoyMesh channel sessions.
  if (k === "agent:main:main") return true;
  if (k.includes(":envoymesh:")) return true;
  return false;
}

async function unlinkSessionArtifacts(sessionFile: string): Promise<number> {
  let removed = 0;
  const targets = [
    sessionFile,
    // Companion trajectory dumps (often larger than the jsonl).
    sessionFile.replace(/\.jsonl$/i, ".trajectory.jsonl"),
    `${sessionFile}.trajectory.jsonl`,
  ];
  // Also try sibling by session id stem.
  const dir = dirname(sessionFile);
  const stem = basename(sessionFile).replace(/\.jsonl$/i, "");
  if (stem && stem !== basename(sessionFile)) {
    targets.push(join(dir, `${stem}.trajectory.jsonl`));
  }
  const seen = new Set<string>();
  for (const path of targets) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    if (!existsSync(path)) continue;
    try {
      await unlink(path);
      removed += 1;
    } catch {
      /* best-effort */
    }
  }
  return removed;
}

/**
 * Delete EnvoyAI / EnvoyMesh OpenClaw session index entries and their files.
 * Best-effort: missing dirs or parse errors return zeros.
 */
export async function resetOpenClawEnvoyAiSessions(
  profileDir: string,
): Promise<ResetOpenClawEnvoyAiSessionsResult> {
  const sessionsDir = join(openClawGatewayStateDir(profileDir), "agents", "main", "sessions");
  const indexPath = join(sessionsDir, "sessions.json");
  if (!existsSync(indexPath)) {
    return { removedSessions: 0, removedFiles: 0 };
  }

  let index: Record<string, unknown>;
  try {
    const raw = await readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { removedSessions: 0, removedFiles: 0 };
    }
    index = parsed as Record<string, unknown>;
  } catch {
    return { removedSessions: 0, removedFiles: 0 };
  }

  let removedSessions = 0;
  let removedFiles = 0;
  const next: Record<string, unknown> = { ...index };

  for (const [key, value] of Object.entries(index)) {
    if (!isEnvoyAiOpenClawSessionKey(key)) continue;
    delete next[key];
    removedSessions += 1;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const sessionFile = (value as { sessionFile?: unknown }).sessionFile;
      if (typeof sessionFile === "string" && sessionFile.trim()) {
        removedFiles += await unlinkSessionArtifacts(sessionFile.trim());
      }
    }
  }

  if (removedSessions === 0) {
    return { removedSessions: 0, removedFiles: 0 };
  }

  try {
    await writeFile(indexPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  } catch (err) {
    console.warn(
      "[openclaw] failed to write sessions.json after EnvoyAI clear:",
      err instanceof Error ? err.message : String(err),
    );
  }

  return { removedSessions, removedFiles };
}

/** Exported for unit tests. */
export const _isEnvoyAiOpenClawSessionKeyForTest = isEnvoyAiOpenClawSessionKey;
