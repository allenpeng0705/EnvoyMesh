/**
 * Context Memory on-disk layout (shared constants, no I/O).
 *
 * Default bank: `{profileDir}/context-memory/facts.jsonl`
 * Named bank:   `{profileDir}/context-memory/ns/<namespace>/facts.jsonl`
 * User dict:    `{profileDir}/context-memory/user-dict.json` (all banks)
 */
import { join } from "node:path";

export const CONTEXT_MEMORY_DIR = "context-memory";
export const CONTEXT_MEMORY_FACTS_FILE = "facts.jsonl";
export const CONTEXT_MEMORY_EDGES_FILE = "edges.jsonl";
export const CONTEXT_MEMORY_NS_DIR = "ns";
export const CONTEXT_MEMORY_DEFAULT_NAMESPACE = "default";

/** True when namespace is empty/default or a safe [a-z0-9_-]{1,48} name. */
export function isValidContextMemoryNamespace(input?: string | null): boolean {
  const raw = String(input ?? "")
    .trim()
    .toLowerCase();
  if (!raw || raw === CONTEXT_MEMORY_DEFAULT_NAMESPACE) return true;
  return /^[a-z0-9][a-z0-9_-]{0,47}$/.test(raw);
}

/**
 * Safe namespace: 1–48 chars, alnum / _ / - only.
 * Invalid non-empty values throw (never silently alias to default — that
 * would collide distinct configs onto one bank).
 */
export function normalizeContextMemoryNamespace(
  input?: string | null,
): string {
  const raw = String(input ?? "")
    .trim()
    .toLowerCase();
  if (!raw || raw === CONTEXT_MEMORY_DEFAULT_NAMESPACE) {
    return CONTEXT_MEMORY_DEFAULT_NAMESPACE;
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(raw)) {
    throw new Error(`context-memory: invalid namespace "${String(input).slice(0, 64)}"`);
  }
  return raw;
}

export function contextMemoryBankDir(
  profileDir: string,
  namespace?: string | null,
): string {
  const ns = normalizeContextMemoryNamespace(namespace);
  if (ns === CONTEXT_MEMORY_DEFAULT_NAMESPACE) {
    return join(profileDir, CONTEXT_MEMORY_DIR);
  }
  return join(profileDir, CONTEXT_MEMORY_DIR, CONTEXT_MEMORY_NS_DIR, ns);
}

export function contextMemoryFactsPath(
  profileDir: string,
  namespace?: string | null,
): string {
  return join(contextMemoryBankDir(profileDir, namespace), CONTEXT_MEMORY_FACTS_FILE);
}

export function contextMemoryEdgesPath(
  profileDir: string,
  namespace?: string | null,
): string {
  return join(contextMemoryBankDir(profileDir, namespace), CONTEXT_MEMORY_EDGES_FILE);
}
