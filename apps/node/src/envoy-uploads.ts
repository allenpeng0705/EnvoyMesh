/**
 * Client → home-node file uploads for EnvoyAI / Ext Agent attachments.
 * Files land under `{profileDir}/envoy-uploads/`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { MAX_CHAT_ATTACHMENT_BYTES } from "@envoymesh/api";

export interface SaveEnvoyUploadParams {
  filename: string;
  mimeType?: string;
  contentBase64: string;
}

export interface SaveEnvoyUploadResult {
  ok: boolean;
  path?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  error?: string;
}

export function envoyUploadsDir(profileDir: string): string {
  return join(profileDir, "envoy-uploads");
}

export function ensureEnvoyUploadsDir(profileDir: string): string {
  const dir = envoyUploadsDir(profileDir);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Strip path separators and control chars from an upload filename. */
export function sanitizeUploadFilename(raw: string): string {
  const base = basename(raw.trim().replace(/\\/g, "/"));
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned || "upload.bin";
}

function guessMime(filename: string, explicit?: string): string {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".md") || lower.endsWith(".txt") || lower.endsWith(".ts") || lower.endsWith(".tsx") || lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".py") || lower.endsWith(".rs") || lower.endsWith(".go") || lower.endsWith(".java") || lower.endsWith(".c") || lower.endsWith(".cpp") || lower.endsWith(".h") || lower.endsWith(".css") || lower.endsWith(".html") || lower.endsWith(".yml") || lower.endsWith(".yaml") || lower.endsWith(".toml") || lower.endsWith(".sh")) {
    return "text/plain";
  }
  return "application/octet-stream";
}

/**
 * Decode base64 and write under `{profileDir}/envoy-uploads/`.
 */
export function saveEnvoyUpload(
  profileDir: string,
  params: SaveEnvoyUploadParams,
): SaveEnvoyUploadResult {
  const rawName = typeof params.filename === "string" ? params.filename : "";
  const name = sanitizeUploadFilename(rawName);
  const b64 = typeof params.contentBase64 === "string" ? params.contentBase64.trim() : "";
  if (!b64) {
    return { ok: false, error: "contentBase64 required" };
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return { ok: false, error: "invalid base64" };
  }
  if (buf.byteLength <= 0) {
    return { ok: false, error: "empty file" };
  }
  if (buf.byteLength > MAX_CHAT_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: `File too large (max ${MAX_CHAT_ATTACHMENT_BYTES} bytes)`,
    };
  }
  const dir = ensureEnvoyUploadsDir(profileDir);
  const outName = `${stamp()}-${name}`;
  const outPath = join(dir, outName);
  try {
    writeFileSync(outPath, buf, { mode: 0o600 });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const mimeType = guessMime(name, params.mimeType);
  return {
    ok: true,
    path: outPath,
    name: outName,
    mimeType,
    sizeBytes: buf.byteLength,
  };
}
