/**
 * Shared helpers for one-shot CLI Ext Agent stdout parsing.
 *
 * Cursor / MiniMax (and similar) emit JSON or NDJSON; each agent has a
 * preferred field order. Keep extraction here so backends stay thin and
 * we do not cross-wire agent-specific shapes incorrectly.
 *
 * Rules:
 * - Return `null` when no assistant text is found (caller keeps raw stdout).
 * - Never invent text from unrelated keys.
 * - `prefer: "flat-first"` — Cursor (`result` / `text` before Messages blocks).
 * - `prefer: "content-first"` — MiniMax Messages API (`content[].text` first).
 */

export type OneShotJsonPrefer = "flat-first" | "content-first";

export interface ExtractOneShotAssistantTextOptions {
  /** Top-level string fields to try, in order. */
  flatKeys?: readonly string[];
  /**
   * Whether Messages-style `content` blocks are tried before or after
   * flat keys. Default: `"flat-first"`.
   */
  prefer?: OneShotJsonPrefer;
  /**
   * When true, also scan newline-delimited JSON objects (last match wins
   * among objects that yield text). Default: false.
   */
  ndjson?: boolean;
}

const DEFAULT_FLAT_KEYS = ["result", "text", "response", "output", "message"] as const;

/**
 * Extract assistant text from a CLI stdout blob. Returns `null` when
 * nothing usable is found (including invalid JSON).
 */
export function extractOneShotAssistantText(
  stdout: string,
  opts: ExtractOneShotAssistantTextOptions = {},
): string | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;

  const flatKeys = opts.flatKeys ?? DEFAULT_FLAT_KEYS;
  const prefer = opts.prefer ?? "flat-first";
  const ndjson = opts.ndjson ?? false;

  const candidates: string[] = [];
  if (trimmed.startsWith("{")) {
    candidates.push(trimmed);
  }
  if (ndjson || trimmed.includes("\n{")) {
    for (const line of trimmed.split("\n")) {
      const l = line.trim();
      if (l.startsWith("{") && !candidates.includes(l)) candidates.push(l);
    }
  }

  if (candidates.length === 0) return null;

  // NDJSON / stream: walk last → first so the final assistant chunk wins.
  for (let i = candidates.length - 1; i >= 0; i--) {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(candidates[i]!) as Record<string, unknown>;
    } catch {
      continue;
    }
    const text = extractFromObject(obj, flatKeys, prefer);
    if (text) return text;
  }
  return null;
}

function extractFromObject(
  obj: Record<string, unknown>,
  flatKeys: readonly string[],
  prefer: OneShotJsonPrefer,
): string | null {
  const tryFlat = (): string | null => {
    for (const k of flatKeys) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };
  const tryContent = (): string | null => extractContentBlocks(obj.content);
  const tryNestedMessage = (): string | null => {
    const nested = obj.message;
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
      return null;
    }
    const rec = nested as Record<string, unknown>;
    const fromBlocks = extractContentBlocks(rec.content);
    if (fromBlocks) return fromBlocks;
    for (const k of flatKeys) {
      if (k === "message") continue; // avoid recursing into the nested object itself
      const v = rec[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };

  if (prefer === "content-first") {
    return tryContent() ?? tryNestedMessage() ?? tryFlat();
  }
  return tryFlat() ?? tryContent() ?? tryNestedMessage();
}

/**
 * MiniMax / Anthropic Messages-style `content` field:
 * string | Array<string | { type?: string, text?: string, content?: string }>
 */
export function extractContentBlocks(content: unknown): string | null {
  if (typeof content === "string" && content.trim()) return content.trim();
  if (!Array.isArray(content) || content.length === 0) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === "string" && block.trim()) {
      parts.push(block.trim());
      continue;
    }
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    // Prefer explicit text blocks; skip tool_use / thinking without text.
    if (typeof b.text === "string" && b.text.trim()) {
      parts.push(b.text.trim());
      continue;
    }
    if (typeof b.content === "string" && b.content.trim()) {
      parts.push(b.content.trim());
    }
  }
  const joined = parts.join("\n").trim();
  return joined || null;
}
