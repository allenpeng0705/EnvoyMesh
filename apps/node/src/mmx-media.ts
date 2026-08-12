/**
 * MiniMax MMX-CLI media generation for Envoy slash commands.
 * Runs on the home node; outputs land under `{profileDir}/mmx-output/`.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  augmentPathForExtAgentBins,
  isExtAgentBinaryAvailable,
  resolveExtAgentBinary,
} from "./ext-agent-adapter/resolve-ext-agent-binary.js";
import { HOME_FS_PREVIEW_MAX_BYTES } from "./home-fs.js";

export const MMX_INSTALL_HINT =
  "Install MMX-CLI: `npm install -g mmx-cli` (or `npx skills add MiniMax-AI/cli -y -g`). Then run `mmx auth login --api-key sk-xxxx`.";

export type MmxMediaKind =
  | "image"
  | "video"
  | "speech"
  | "music"
  | "vision"
  | "search"
  | "quota"
  | "auth";

export interface RunMmxMediaCommandParams {
  kind: MmxMediaKind;
  /** Prompt / text / query depending on kind. */
  prompt?: string;
  /** For vision: local path or URL. */
  target?: string;
}

export interface RunMmxMediaCommandResult {
  ok: boolean;
  kind: MmxMediaKind;
  /** Absolute path when a file was written. */
  path?: string;
  /** Text result (vision / search / quota / auth / errors). */
  text?: string;
  mimeType?: string;
  contentBase64?: string;
  error?: string;
}

const IMAGE_TIMEOUT_MS = 180_000;
const SPEECH_MUSIC_TIMEOUT_MS = 180_000;
const VIDEO_TIMEOUT_MS = 900_000;
const TEXT_TIMEOUT_MS = 120_000;

export function mmxOutputDir(profileDir: string): string {
  return join(profileDir, "mmx-output");
}

export function ensureMmxOutputDir(profileDir: string): string {
  const dir = mmxOutputDir(profileDir);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function buildMmxMediaArgs(
  params: RunMmxMediaCommandParams,
  outPath: string | undefined,
): { args: string[]; timeoutMs: number; expectsFile: boolean } {
  const kind = params.kind;
  const prompt = params.prompt?.trim() ?? "";
  const target = params.target?.trim() ?? "";

  switch (kind) {
    case "image":
      if (!prompt) throw new Error("/image requires a prompt");
      if (!outPath) throw new Error("output path required");
      return {
        args: ["image", "generate", "--prompt", prompt, "--out", outPath],
        timeoutMs: IMAGE_TIMEOUT_MS,
        expectsFile: true,
      };
    case "video":
      if (!prompt) throw new Error("/video requires a prompt");
      if (!outPath) throw new Error("output path required");
      return {
        args: ["video", "generate", "--prompt", prompt, "--download", outPath],
        timeoutMs: VIDEO_TIMEOUT_MS,
        expectsFile: true,
      };
    case "speech":
      if (!prompt) throw new Error("/speech requires text");
      if (!outPath) throw new Error("output path required");
      return {
        args: ["speech", "synthesize", "--text", prompt, "--out", outPath],
        timeoutMs: SPEECH_MUSIC_TIMEOUT_MS,
        expectsFile: true,
      };
    case "music":
      if (!prompt) throw new Error("/music requires a prompt");
      if (!outPath) throw new Error("output path required");
      return {
        args: ["music", "generate", "--prompt", prompt, "--out", outPath],
        timeoutMs: SPEECH_MUSIC_TIMEOUT_MS,
        expectsFile: true,
      };
    case "vision":
      if (!target) throw new Error("/vision requires an image path or URL");
      return {
        args: prompt
          ? ["vision", "describe", "--image", target, "--prompt", prompt]
          : ["vision", "describe", "--image", target],
        timeoutMs: TEXT_TIMEOUT_MS,
        expectsFile: false,
      };
    case "search":
      if (!prompt) throw new Error("/search requires a query");
      return {
        args: ["search", "query", "--q", prompt],
        timeoutMs: TEXT_TIMEOUT_MS,
        expectsFile: false,
      };
    case "quota":
      return { args: ["quota"], timeoutMs: TEXT_TIMEOUT_MS, expectsFile: false };
    case "auth":
      return {
        args: ["auth", "status"],
        timeoutMs: TEXT_TIMEOUT_MS,
        expectsFile: false,
      };
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown mmx media kind: ${_exhaustive}`);
    }
  }
}

export function plannedOutputPath(
  profileDir: string,
  kind: MmxMediaKind,
): string | undefined {
  const dir = ensureMmxOutputDir(profileDir);
  const base = `${stamp()}-${kind}`;
  switch (kind) {
    case "image":
      return join(dir, `${base}.png`);
    case "video":
      return join(dir, `${base}.mp4`);
    case "speech":
    case "music":
      return join(dir, `${base}.mp3`);
    default:
      return undefined;
  }
}

function mimeForPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  return "application/octet-stream";
}

function previewPayload(
  filePath: string,
): { mimeType: string; contentBase64: string } | undefined {
  try {
    const st = statSync(filePath);
    if (!st.isFile() || st.size <= 0 || st.size > HOME_FS_PREVIEW_MAX_BYTES) {
      return undefined;
    }
    const mimeType = mimeForPath(filePath);
    if (
      !mimeType.startsWith("image/") &&
      !mimeType.startsWith("audio/")
    ) {
      // Skip large video previews in chat; path is enough.
      return undefined;
    }
    const buf = readFileSync(filePath);
    return { mimeType, contentBase64: buf.toString("base64") };
  } catch {
    return undefined;
  }
}

function spawnMmx(
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    if (!isExtAgentBinaryAvailable("mmx")) {
      reject(new Error(`mmx CLI not found. ${MMX_INSTALL_HINT}`));
      return;
    }
    const cmd = resolveExtAgentBinary("mmx") ?? "mmx";
    const env = augmentPathForExtAgentBins({ ...process.env });
    const proc = spawn(cmd, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      reject(new Error(`mmx timed out after ${timeoutMs}ms (${args.join(" ")})`));
    }, timeoutMs);
    timer.unref?.();
    proc.stdout?.setEncoding("utf8");
    proc.stdout?.on("data", (c: string) => {
      stdout += c;
    });
    proc.stderr?.setEncoding("utf8");
    proc.stderr?.on("data", (c: string) => {
      stderr += c;
    });
    proc.on("error", (err) => {
      if (killed) return;
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      if (killed) return;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

/**
 * Run an MMX media / status command on the home node.
 */
export async function runMmxMediaCommand(
  profileDir: string,
  params: RunMmxMediaCommandParams,
): Promise<RunMmxMediaCommandResult> {
  const kind = params.kind;
  try {
    const outPath = plannedOutputPath(profileDir, kind);
    const { args, timeoutMs, expectsFile } = buildMmxMediaArgs(params, outPath);
    const { stdout, stderr, exitCode } = await spawnMmx(args, timeoutMs);
    const combined = `${stdout}\n${stderr}`.trim();

    if (exitCode !== 0) {
      return {
        ok: false,
        kind,
        error: combined || `mmx exited with code ${exitCode}`,
        ...(outPath ? { path: outPath } : {}),
        ...(combined ? { text: combined } : {}),
      };
    }

    if (expectsFile && outPath) {
      if (!existsSync(outPath) || !statSync(outPath).isFile()) {
        return {
          ok: false,
          kind,
          path: outPath,
          error: `mmx finished but output file missing: ${outPath}`,
          ...(combined ? { text: combined } : {}),
        };
      }
      const preview = previewPayload(outPath);
      return {
        ok: true,
        kind,
        path: outPath,
        text: `Saved to ${outPath}`,
        ...(preview
          ? { mimeType: preview.mimeType, contentBase64: preview.contentBase64 }
          : { mimeType: mimeForPath(outPath) }),
      };
    }

    return {
      ok: true,
      kind,
      text: stdout.trim() || combined || "(empty)",
    };
  } catch (e) {
    return {
      ok: false,
      kind,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
