/**
 * Build a shared text context block for EnvoyAI / Ext Agent turns from
 * home-node absolute file paths (no per-agent adapters).
 *
 * Phase 57E: Office/PDF/etc. use `extractVaultDocumentText` (anydoc + legacy)
 * instead of a binary placeholder.
 */
import { existsSync, openSync, readSync, closeSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import {
  extractVaultDocumentText,
  isVaultExtractableExtension,
} from "@envoymesh/vault";

export interface AgentAttachmentRef {
  path: string;
  name?: string;
  mimeType?: string;
}

export interface BuildAgentAttachmentContextResult {
  ok: boolean;
  contextText?: string;
  error?: string;
}

const PER_FILE_PREVIEW_BYTES = 64 * 1024;
const TOTAL_PREVIEW_BUDGET = 200 * 1024;
/** Cap source bytes before calling anydoc/legacy extractors. */
const MAX_EXTRACT_SOURCE_BYTES = 5 * 1024 * 1024;

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (
    /\.(md|txt|ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|c|cc|cpp|h|hpp|css|scss|html|htm|yml|yaml|toml|json|xml|sh|bash|zsh|sql|graphql|swift|kt|dart|rb|php|cs|vue|svelte)$/i.test(
      lower,
    )
  ) {
    return "text/plain";
  }
  return "application/octet-stream";
}

function isLikelyTextMime(mime: string, name: string): boolean {
  const m = mime.toLowerCase();
  if (m.startsWith("text/")) return true;
  if (m === "application/json" || m === "application/xml" || m === "application/javascript") {
    return true;
  }
  if (m.endsWith("+json") || m.endsWith("+xml")) return true;
  const lower = name.toLowerCase();
  return /\.(md|txt|ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|c|cc|cpp|h|hpp|css|scss|html|htm|yml|yaml|toml|json|xml|sh|bash|zsh|sql|graphql|swift|kt|dart|rb|php|cs|vue|svelte)$/i.test(
    lower,
  );
}

function isBinaryMediaMime(mime: string): boolean {
  const m = mime.toLowerCase();
  return (
    m.startsWith("image/") ||
    m.startsWith("audio/") ||
    m.startsWith("video/") ||
    m === "application/octet-stream"
  );
}

function truncateUtf8(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  return `${buf.subarray(0, maxBytes).toString("utf8")}\n… [truncated extract]`;
}

/**
 * Read home-node files and format a prompt appendix for agent turns.
 */
export async function buildAgentAttachmentContext(
  attachments: AgentAttachmentRef[],
): Promise<BuildAgentAttachmentContextResult> {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { ok: false, error: "attachments required" };
  }

  const blocks: string[] = ["Attached files (on home node):"];
  let previewUsed = 0;

  for (const raw of attachments) {
    const pathStr = typeof raw.path === "string" ? raw.path.trim() : "";
    if (!pathStr) {
      return { ok: false, error: "each attachment needs a path" };
    }
    const abs = resolve(pathStr);
    if (!existsSync(abs)) {
      return { ok: false, error: `Path not found: ${abs}` };
    }
    let st;
    try {
      st = statSync(abs);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    if (!st.isFile()) {
      return { ok: false, error: `Not a file: ${abs}` };
    }

    const name =
      (typeof raw.name === "string" && raw.name.trim()) || basename(abs);
    const mime =
      (typeof raw.mimeType === "string" && raw.mimeType.trim()) ||
      guessMimeFromName(name);
    const ext = (extname(name) || extname(abs)).toLowerCase();

    blocks.push(`--- file: ${name} (${mime}) ---`);
    blocks.push(`path: ${abs}`);

    const remaining = TOTAL_PREVIEW_BUDGET - previewUsed;
    if (remaining <= 0) {
      blocks.push(`[skipped: preview budget exhausted]`);
      continue;
    }

    // Phase 57E — Office/PDF via anydoc (+ legacy fallback).
    if (isVaultExtractableExtension(ext)) {
      if (st.size > MAX_EXTRACT_SOURCE_BYTES) {
        blocks.push(`[too large to extract: ${mime}, ${st.size} bytes]`);
        continue;
      }
      try {
        const buf = await readFile(abs);
        const extracted = await extractVaultDocumentText(ext, buf);
        if (extracted?.trim()) {
          const text = truncateUtf8(extracted.trim(), Math.min(PER_FILE_PREVIEW_BYTES, remaining));
          previewUsed += Buffer.byteLength(text, "utf8");
          blocks.push(text);
          continue;
        }
        blocks.push(`[extract empty: ${mime}, ${st.size} bytes]`);
        continue;
      } catch (err) {
        blocks.push(
          `[extract failed: ${err instanceof Error ? err.message : String(err)}]`,
        );
        continue;
      }
    }

    if (isBinaryMediaMime(mime) || !isLikelyTextMime(mime, name)) {
      blocks.push(`[binary: ${mime}, ${st.size} bytes]`);
      continue;
    }

    try {
      const toRead = Math.min(PER_FILE_PREVIEW_BYTES, remaining, st.size);
      const slice = Buffer.alloc(toRead);
      const fd = openSync(abs, "r");
      let n = 0;
      try {
        n = readSync(fd, slice, 0, toRead, 0);
      } finally {
        closeSync(fd);
      }
      const preview = slice.subarray(0, n);
      // Reject if high ratio of NUL / control (likely binary mislabeled).
      let weird = 0;
      for (let i = 0; i < preview.length; i++) {
        const c = preview[i]!;
        if (c === 0 || (c < 32 && c !== 9 && c !== 10 && c !== 13)) weird++;
      }
      if (preview.length > 0 && weird / preview.length > 0.05) {
        blocks.push(`[binary: ${mime}, ${st.size} bytes]`);
        continue;
      }
      let text = preview.toString("utf8");
      previewUsed += Buffer.byteLength(text, "utf8");
      if (st.size > toRead) {
        text += `\n… [truncated, ${st.size - toRead} more bytes]`;
      }
      blocks.push(text);
    } catch (err) {
      blocks.push(
        `[unreadable: ${err instanceof Error ? err.message : String(err)}]`,
      );
    }
  }

  return { ok: true, contextText: blocks.join("\n") };
}

/** Merge user text with attachment context for outbound agent prompts. */
export function mergeAgentPromptWithAttachments(
  text: string,
  contextText: string | undefined,
): string {
  const body = text.trim();
  const ctx = contextText?.trim() ?? "";
  if (!ctx) return body;
  if (!body) return ctx;
  return `${body}\n\n${ctx}`;
}
