/**
 * Phase 49 — Pi runtime: spawn the Pi CLI child process and speak its
 * JSONL-over-stdio RPC protocol.
 *
 * This module is the protocol layer. It:
 *   1. Discovers the bundled Pi CLI (apps/tauri/src-tauri/resources/pi/).
 *   2. Maps EnvoyMesh's ModelProviderConfig → Pi CLI args + scoped env vars.
 *   3. Spawns `pi --mode rpc --provider <p> --model <m>` with a Node runtime.
 *   4. Frames stdin/stdout as JSON Lines, correlating commands by id.
 *   5. Surfaces Pi events to subscribers (text deltas, tool calls, UI requests).
 *
 * Higher-level lifecycle (start/stop/restart/status, gated on piEnabled)
 * lives in node-service-pi.ts, mirroring the OpenClaw pattern.
 *
 * Security: the API key is placed ONLY in the child process's env — never
 * in CLI args (visible via `ps`) and never in the parent node's env. This
 * matches OpenClaw's "key in config file, not args" property. See
 * docs/pi-integration-design.md §5.
 */

import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { Readable, Writable } from "node:stream"
import type {
  PiAssistantMessageEvent,
  PiCommand,
  PiEvent,
  PiExtensionUiRequest,
  PiExtensionUiResponse,
  PiModelOverride,
  PiPromptResult,
  PiResponse,
  PiToolTraceCall,
} from "@envoymesh/api"
import type { ModelProviderConfig } from "@envoymesh/api"

const require = createRequire(import.meta.url)

// ---------------------------------------------------------------------------
// Discovery: find the bundled Pi CLI
// ---------------------------------------------------------------------------

/**
 * Locate the Pi CLI entry point. Search order:
 *   1. ENVOYMESH_PI_CLI env var (operator override / dev mode)
 *   2. Tauri / desktop bundle resources (TAURI_RESOURCE_DIR)
 *   3. Monorepo staging path under each candidate root
 *   4. Upstream package from node_modules (dev/test)
 *
 * Returns null when not found (slim build with -SkipPi, or fetch failed).
 */
export function discoverPiCli(repoRoot?: string): { cliPath: string; version: string } | null {
  // 1. Explicit override.
  if (process.env.ENVOYMESH_PI_CLI && existsSync(process.env.ENVOYMESH_PI_CLI)) {
    return { cliPath: process.env.ENVOYMESH_PI_CLI, version: readPiVersion(process.env.ENVOYMESH_PI_CLI) }
  }

  const cliSuffix = join(
    "pi",
    "node_modules",
    "@earendil-works",
    "pi-coding-agent",
    "dist",
    "cli.js",
  )
  const candidates: string[] = []

  // 1b. ENVOYMESH_PI_DIR → <dir>/node_modules/.../cli.js or <dir>/dist/cli.js
  const piDir = process.env.ENVOYMESH_PI_DIR?.trim()
  if (piDir) {
    candidates.push(join(piDir, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js"))
    candidates.push(join(piDir, "dist", "cli.js"))
    candidates.push(join(piDir, cliSuffix))
  }

  // 2. Tauri / desktop bundle resources.
  const resourceDir =
    process.env.TAURI_RESOURCE_DIR?.trim() || process.env.TAURI_APP_RESOURCES_DIR?.trim()
  if (resourceDir) {
    candidates.push(join(resourceDir, cliSuffix))
    candidates.push(join(resourceDir, "resources", cliSuffix))
    candidates.push(join(resourceDir, "apps", "tauri", "src-tauri", "resources", cliSuffix))
  }

  // 3. Monorepo staging — try every plausible root. Callers sometimes pass a
  // profile-derived path that is NOT the repo root; never let that be the
  // only candidate (that caused "sidecar not found" with Pi already staged).
  const roots = new Set<string>()
  if (repoRoot?.trim()) roots.add(resolve(repoRoot.trim()))
  roots.add(inferRepoRoot())
  roots.add(resolve(process.cwd()))
  // Walk up from cwd a few levels in case node is started from apps/node.
  let walk = resolve(process.cwd())
  for (let i = 0; i < 5; i++) {
    roots.add(walk)
    const parent = resolve(walk, "..")
    if (parent === walk) break
    walk = parent
  }

  for (const root of roots) {
    candidates.push(join(root, "apps", "tauri", "src-tauri", "resources", cliSuffix))
    candidates.push(join(root, "src-tauri", "resources", cliSuffix))
    candidates.push(join(root, "resources", cliSuffix))
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return { cliPath: candidate, version: readPiVersion(candidate) }
    }
  }

  // 4. Upstream package from node_modules (dev/test).
  try {
    const resolved = require.resolve("@earendil-works/pi-coding-agent/dist/cli.js")
    return { cliPath: resolved, version: readPiVersion(resolved) }
  } catch {
    // Not installed in this tree — fall through.
  }

  return null
}

function inferRepoRoot(): string {
  // apps/node/src/pi-runtime.ts → apps/node/src → apps/node → apps → <root>
  // (or apps/node/dist/... when compiled)
  const here = dirname(fileURLToPath(import.meta.url))
  const segments = here.split(/[/\\]/)
  const appsIdx = segments.lastIndexOf("apps")
  if (appsIdx > 0) return segments.slice(0, appsIdx).join("/") || "/"
  return process.cwd()
}

function readPiVersion(cliPath: string): string {
  try {
    // package.json lives at <cli>/../../package.json (dist/cli.js → package root).
    const pkgPath = resolve(cliPath, "..", "..", "package.json")
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
      return pkg.version ?? "unknown"
    }
  } catch {
    // Non-fatal — version is informational only.
  }
  return "unknown"
}

// ---------------------------------------------------------------------------
// Model config handoff: ModelProviderConfig → Pi CLI args + scoped env vars
// ---------------------------------------------------------------------------

/**
 * The Node runtime binary used to spawn Pi. Pi is a Node.js package; it
 * must run under the same Node runtime the rest of the bundle uses. In the
 * bundled Tauri app this is the resources/node-runtime/node sidecar; in
 * dev it's the ambient `node` on PATH. Override via ENVOYMESH_NODE_EXE.
 */
export function resolvePiNodeRuntime(): string {
  return process.env.ENVOYMESH_NODE_EXE ?? process.execPath
}

/** Resolved provider+model spec + the scoped env vars to pass to the child. */
export interface PiSpawnConfig {
  /** Provider/model arg for `--provider`/`--model`, e.g. "anthropic/claude-...". */
  modelSpec: string
  /** Provider name only, e.g. "anthropic" (for --provider flag). */
  provider: string
  /** Model name only, e.g. "claude-sonnet-4-...". */
  model: string
  /** Scoped env vars for the child. Contains the API key — DO NOT log. */
  env: Record<string, string>
  /** Whether the model came from EnvoyMesh's config vs a per-session override. */
  inherited: boolean
  /**
   * Custom OpenAI-compatible base URL that must be applied via Pi's models.json.
   * Pi's built-in `openai` provider ignores `OPENAI_BASE_URL` and dials
   * `model.baseUrl` (default `api.openai.com`) — unreachable in many regions.
   */
  openaiBaseUrlOverride?: string
}

/**
 * Hostname → Pi's native MiniMax provider.
 * Pi ships `minimax` (api.minimax.io/anthropic) and `minimax-cn`
 * (api.minimaxi.com/anthropic). Mapping openai-compatible MiniMax endpoints
 * onto these avoids the openai provider's default api.openai.com base URL.
 */
export function resolveMiniMaxPiProvider(
  endpoint: string | undefined,
): { provider: "minimax-cn" | "minimax"; apiKeyEnv: "MINIMAX_CN_API_KEY" | "MINIMAX_API_KEY" } | null {
  const native = resolveNativePiProviderFromEndpoint(endpoint)
  if (native?.provider === "minimax-cn" || native?.provider === "minimax") {
    return {
      provider: native.provider,
      apiKeyEnv: native.provider === "minimax-cn" ? "MINIMAX_CN_API_KEY" : "MINIMAX_API_KEY",
    }
  }
  return null
}

/**
 * Map a known OpenAI-compatible endpoint host → Pi's built-in `--provider`.
 * Unknown hosts return null so callers use openai + openaiBaseUrlOverride.
 */
export function resolveNativePiProviderFromEndpoint(
  endpoint: string | undefined,
): { provider: string } | null {
  const raw = endpoint?.trim()
  if (!raw) return null
  let host: string
  try {
    host = new URL(raw).hostname.toLowerCase()
  } catch {
    return null
  }
  if (host === "api.minimaxi.com" || host === "www.minimaxi.com" || host.endsWith(".minimaxi.com")) {
    return { provider: "minimax-cn" }
  }
  if (host === "api.minimax.io" || host.endsWith(".minimax.io")) {
    return { provider: "minimax" }
  }
  if (host.includes("deepseek.com")) return { provider: "deepseek" }
  if (host.includes("moonshot.cn")) return { provider: "moonshotai-cn" }
  if (host.includes("moonshot.ai")) return { provider: "moonshotai" }
  if (host === "api.x.ai" || host.endsWith(".x.ai")) return { provider: "xai" }
  if (host.includes("bigmodel.cn") || host === "api.z.ai" || host.endsWith(".z.ai")) {
    return { provider: "zai-coding-cn" }
  }
  if (host.includes("openrouter.ai")) return { provider: "openrouter" }
  return null
}

function isOpenAiOfficialEndpoint(endpoint: string | undefined): boolean {
  const raw = endpoint?.trim()
  if (!raw) return true
  try {
    const host = new URL(raw).hostname.toLowerCase()
    return host === "api.openai.com" || host.endsWith(".openai.com")
  } catch {
    return false
  }
}

/**
 * Materialize spawn env for the Pi child (writes a private agent dir when
 * {@link PiSpawnConfig.openaiBaseUrlOverride} is set).
 * Caller must eventually {@link cleanupPiSpawnEnv} the returned env (or the
 * `PI_CODING_AGENT_DIR` it may contain) to avoid leaking temp dirs — unless
 * `opts.agentDir` is a stable reusable path (Pi TUI per-project).
 */
export function materializePiSpawnEnv(
  spawnConfig: PiSpawnConfig,
  opts?: { agentDir?: string },
): Record<string, string> {
  const env = { ...spawnConfig.env }
  const baseUrl = spawnConfig.openaiBaseUrlOverride?.trim()
  if (!baseUrl) return env
  const dir = opts?.agentDir?.trim()
    ? opts.agentDir.trim()
    : mkdtempSync(join(tmpdir(), "envoymesh-pi-"))
  if (opts?.agentDir?.trim()) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(
    join(dir, "models.json"),
    `${JSON.stringify(
      {
        providers: {
          openai: { baseUrl },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  )
  env.PI_CODING_AGENT_DIR = dir
  return env
}

/** Best-effort remove of a temp agent dir created by {@link materializePiSpawnEnv}. */
export function cleanupPiSpawnEnv(env: Record<string, string> | undefined): void {
  const dir = env?.PI_CODING_AGENT_DIR?.trim()
  if (!dir || !dir.includes("envoymesh-pi-")) return
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore — temp dir may already be gone */
  }
}

/**
 * Normalize a persisted Pi model override. Returns undefined when incomplete
 * so callers fall back to EnvoyMesh Settings → AI.
 */
export function normalizePiModelOverride(raw: unknown): PiModelOverride | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const o = raw as Partial<PiModelOverride>
  const model = typeof o.model === "string" ? o.model.trim() : ""
  if (!model) return undefined
  const mode = o.mode
  const provider = typeof o.provider === "string" ? o.provider.trim() : ""
  const validMode =
    mode === "openai-compatible" ||
    mode === "anthropic-compatible" ||
    mode === "ollama" ||
    mode === "litellm"
  // Prefer Pi-native provider; keep legacy mode-only overrides.
  if (!provider && !validMode) return undefined
  return {
    ...(provider ? { provider } : {}),
    ...(validMode ? { mode } : {}),
    model,
    ...(typeof o.endpoint === "string" && o.endpoint.trim()
      ? { endpoint: o.endpoint.trim() }
      : {}),
    ...(typeof o.apiKey === "string" && o.apiKey.trim() ? { apiKey: o.apiKey.trim() } : {}),
  }
}

/**
 * Map EnvoyMesh's ModelProviderConfig → Pi's expected env vars + CLI args.
 *
 * Pi uses standard provider env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY, …)
 * which its pi-ai package reads at startup. The key lives ONLY in the
 * returned env object — never in CLI args. Mirrors how OpenClaw's gateway
 * receives the key via openclaw.json (file) rather than --api-key (arg).
 *
 * Returns null when the model is not configured (mode "disabled" or "mock"
 * without a real provider). The caller surfaces this as PiStatus.state =
 * "error" with a "configure a model first" hint.
 *
 * When `override` is set (from piSettings.modelOverride), it wins and
 * `inherited` is false — OpenClaw/Hermes/OpenHuman are unaffected.
 */
export function buildPiSpawnConfig(
  modelProviders: ModelProviderConfig,
  override?: PiModelOverride,
): PiSpawnConfig | null {
  const normalized = normalizePiModelOverride(override)
  if (normalized) {
    // Prefer Pi-native provider when both are present.
    // Empty override.apiKey → reuse Settings → AI key (provider/model still override).
    const apiKey = normalized.apiKey?.trim() || modelProviders.apiKey
    if (normalized.provider?.trim()) {
      return resolvePiSpawnFromDirectProvider({ ...normalized, apiKey })
    }
    if (normalized.mode) {
      const resolved = resolvePiSpawnFromEnvoyMode({
        mode: normalized.mode,
        modelName: normalized.model,
        endpoint: normalized.endpoint,
        apiKey,
      })
      if (!resolved) return null
      return { ...resolved, inherited: false }
    }
    return null
  }

  const mode = modelProviders.mode
  if (mode === "disabled" || mode === "mock") return null
  if (!modelProviders.modelName) return null

  const resolved = resolvePiSpawnFromEnvoyMode({
    mode,
    modelName: modelProviders.modelName,
    endpoint: modelProviders.endpoint,
    apiKey: modelProviders.apiKey,
  })
  if (!resolved) return null
  return { ...resolved, inherited: true }
}

function resolvePiSpawnFromEnvoyMode(input: {
  mode: string
  modelName: string
  endpoint?: string
  apiKey?: string
}): Omit<PiSpawnConfig, "inherited"> | null {
  const { mode, modelName, endpoint, apiKey } = input
  switch (mode) {
    case "anthropic-compatible":
      return {
        modelSpec: `anthropic/${modelName}`,
        provider: "anthropic",
        model: modelName,
        env: withPiToolPath(buildProviderEnv("anthropic", apiKey, endpoint)),
      }
    case "openai-compatible": {
      // Prefer Pi-native providers when the endpoint host is unambiguous.
      // Falls back to openai + models.json baseUrl override (Pi ignores OPENAI_BASE_URL).
      const native = resolveNativePiProviderFromEndpoint(endpoint)
      if (native) {
        return {
          modelSpec: `${native.provider}/${modelName}`,
          provider: native.provider,
          model: modelName,
          env: withPiToolPath(buildProviderEnv(native.provider, apiKey, endpoint)),
        }
      }
      const cfg: Omit<PiSpawnConfig, "inherited"> = {
        modelSpec: `openai/${modelName}`,
        provider: "openai",
        model: modelName,
        env: withPiToolPath(buildProviderEnv("openai", apiKey, endpoint)),
      }
      if (endpoint?.trim() && !isOpenAiOfficialEndpoint(endpoint)) {
        cfg.openaiBaseUrlOverride = endpoint.trim()
      }
      return cfg
    }
    case "ollama":
      return {
        modelSpec: `ollama/${modelName}`,
        provider: "ollama",
        model: modelName,
        env: withPiToolPath(buildProviderEnv("ollama", apiKey, endpoint ?? "http://localhost:11434")),
      }
    case "litellm":
      return {
        modelSpec: `litellm/${modelName}`,
        provider: "litellm",
        model: modelName,
        env: withPiToolPath(buildProviderEnv("litellm", apiKey, endpoint)),
      }
    default:
      return null
  }
}

function resolvePiSpawnFromDirectProvider(
  override: PiModelOverride,
): PiSpawnConfig | null {
  const model = override.model.trim()
  let provider = (override.provider ?? "").trim()
  if (!model || !provider) return null

  // openai + known native endpoint → remaps like the inherit path.
  if (provider === "openai") {
    const native = resolveNativePiProviderFromEndpoint(override.endpoint)
    if (native) provider = native.provider
  }

  const cfg: PiSpawnConfig = {
    modelSpec: `${provider}/${model}`,
    provider,
    model,
    env: withPiToolPath(buildProviderEnv(provider, override.apiKey, override.endpoint)),
    inherited: false,
  }
  if (
    provider === "openai" &&
    override.endpoint?.trim() &&
    !isOpenAiOfficialEndpoint(override.endpoint)
  ) {
    cfg.openaiBaseUrlOverride = override.endpoint.trim()
  }
  return cfg
}

/**
 * Resolve the directory that should contain bundled `fd` / `rg` for Pi.
 * Returns null when none of the known locations exist.
 */
export function resolvePiToolsDir(): string | null {
  const toolsDir = process.env.ENVOYMESH_PI_TOOLS_DIR?.trim()
  if (toolsDir && existsSync(toolsDir)) return toolsDir

  const resourceDir =
    process.env.TAURI_RESOURCE_DIR?.trim() || process.env.TAURI_APP_RESOURCES_DIR?.trim()
  if (resourceDir) {
    // Prefer direct layout (after normalize_bundle_content_dir) then the
    // nested macOS Resources/resources/ layout for older builds.
    for (const bundled of [
      join(resourceDir, "pi", "bin"),
      join(resourceDir, "resources", "pi", "bin"),
    ]) {
      if (existsSync(bundled)) return bundled
    }
  }

  const cli = process.env.ENVOYMESH_PI_CLI?.trim()
  if (cli && existsSync(cli)) {
    // dist/cli.js → …/pi/node_modules/@earendil-works/pi-coding-agent/dist
    // five parents up lands on resources/pi/
    const piRoot = resolve(cli, "..", "..", "..", "..", "..")
    const bundled = join(piRoot, "bin")
    if (existsSync(bundled)) return bundled
  }
  return null
}

/** True when bundled (or resolved) fd + rg binaries are present. */
export function hasPiTools(toolsDir?: string | null): boolean {
  const dir = toolsDir ?? resolvePiToolsDir()
  if (!dir) return false
  const fd = process.platform === "win32" ? "fd.exe" : "fd"
  const rg = process.platform === "win32" ? "rg.exe" : "rg"
  return existsSync(join(dir, fd)) && existsSync(join(dir, rg))
}

/**
 * When running under a Tauri/desktop bundle, Pi must have fd/rg staged —
 * otherwise it hangs on GitHub auto-download with a stripped GUI PATH.
 * Dev/terminal installs may rely on Homebrew / ~/.pi instead.
 */
export function requirePiToolsForGui(): string | null {
  const underTauri = Boolean(
    process.env.TAURI_RESOURCE_DIR?.trim() ||
      process.env.TAURI_APP_RESOURCES_DIR?.trim() ||
      process.env.ENVOYMESH_PI_CLI?.trim(),
  )
  if (!underTauri) return null
  if (hasPiTools()) return null
  return (
    "Pi tools (fd/rg) missing from this install. Rebuild the desktop app with " +
    "fetch-pi-tools (full build, not slim / -SkipPi)."
  )
}

/**
 * Ensure Pi can find `fd` / `rg` without GitHub auto-download.
 *
 * GUI/Tauri launches often have a stripped PATH (no Homebrew). Pi then prints
 * "fd not found. Downloading..." and can hang on a truncated archive. Prepend
 * common tool dirs so a system install is visible to the child.
 */
export function withPiToolPath(env: Record<string, string>): Record<string, string> {
  const extras: string[] = []

  // Bundled fd/rg next to the Pi sidecar (resources/pi/bin) — required for
  // Tauri GUI launches where PATH is stripped and Pi's GitHub auto-download
  // hangs or 404s. Prefer this over Homebrew / ~/.pi.
  const toolsDir = resolvePiToolsDir()
  if (toolsDir) extras.push(toolsDir)

  for (const dir of ["/opt/homebrew/bin", "/usr/local/bin"]) {
    if (existsSync(dir)) extras.push(dir)
  }
  const piAgentBin = join(homedir(), ".pi", "agent", "bin")
  if (existsSync(piAgentBin)) extras.push(piAgentBin)
  const nodeExe = process.env.ENVOYMESH_NODE_EXE?.trim()
  if (nodeExe) extras.push(dirname(nodeExe))

  // Windows env blocks are case-insensitive but node-pty may keep both
  // `Path` and `PATH`. Prefer the platform's native key.
  const pathKey =
    process.platform === "win32"
      ? Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "Path"
      : "PATH"
  const current = process.env[pathKey] ?? process.env.PATH ?? ""
  const currentParts = new Set(current.split(delimiter).filter(Boolean))
  // De-dupe while preserving order (bundled tools first).
  const prefixParts: string[] = []
  for (const d of extras) {
    if (!currentParts.has(d) && !prefixParts.includes(d)) prefixParts.push(d)
  }
  const prefix = prefixParts.join(delimiter)
  if (!prefix) return env
  const nextPath = prefix + (current ? delimiter + current : "")
  const out = { ...env }
  // Drop the opposite-case key so the child sees a single PATH entry.
  if (pathKey !== "PATH") delete out.PATH
  if (pathKey !== "Path") delete out.Path
  out[pathKey] = nextPath
  return out
}

/**
 * Pull assistant plain text from a Pi AgentMessage (string or content parts).
 * Used when providers skip text_delta streaming but still attach a final message.
 */
export function extractAssistantTextFromPiMessage(message: unknown): string {
  if (!message || typeof message !== "object") return ""
  const msg = message as {
    role?: string
    content?: unknown
    errorMessage?: string
    stopReason?: string
  }
  if (msg.role && msg.role !== "assistant") return ""
  const content = msg.content
  let out = ""
  if (typeof content === "string") {
    out = content
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== "object") continue
      const p = part as { type?: string; text?: string }
      // Pi text parts are `type: "text"`. Accept bare `{ text }` defensively.
      if (typeof p.text === "string" && (p.type === "text" || p.type === undefined)) {
        out += p.text
      }
    }
  }
  if (out.trim()) return out
  // Surface model/provider failures instead of pretending silence.
  if (typeof msg.errorMessage === "string" && msg.errorMessage.trim()) {
    return `⚠️ ${msg.errorMessage.trim()}`
  }
  return ""
}

/**
 * Extract text from a Pi message_update's assistantMessageEvent.
 * Official event shapes include text_delta, text_end, done, error (+ partial snapshots).
 */
export function extractTextFromAssistantMessageEvent(ame: unknown): string {
  if (!ame || typeof ame !== "object") return ""
  const ev = ame as {
    type?: string
    delta?: string
    content?: string
    partial?: unknown
    message?: unknown
    error?: unknown
  }
  if (ev.type === "done") return extractAssistantTextFromPiMessage(ev.message)
  if (ev.type === "error") return extractAssistantTextFromPiMessage(ev.error)
  // Prefer cumulative partial snapshot when present (avoids double-counting deltas).
  if (ev.partial) {
    const fromPartial = extractAssistantTextFromPiMessage(ev.partial)
    if (fromPartial) return fromPartial
  }
  if (ev.type === "text_end" && typeof ev.content === "string") return ev.content
  if (ev.type === "text_delta" && typeof ev.delta === "string") return ev.delta
  return ""
}

/**
 * Build the provider-specific env-var map. The key is intentionally NOT
 * placed in a generic API_KEY env var — each provider gets its conventional
 * name so Pi's pi-ai package recognizes it without extra wiring.
 */
function buildProviderEnv(
  provider: string,
  apiKey: string | undefined,
  endpoint: string | undefined,
): Record<string, string> {
  const env: Record<string, string> = {}
  // Map Pi-native provider → env var(s) Pi's pi-ai package reads.
  const keyEnvByProvider: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    "minimax-cn": "MINIMAX_CN_API_KEY",
    minimax: "MINIMAX_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    google: "GEMINI_API_KEY",
    groq: "GROQ_API_KEY",
    mistral: "MISTRAL_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    moonshotai: "MOONSHOT_API_KEY",
    "moonshotai-cn": "MOONSHOT_API_KEY",
    xai: "XAI_API_KEY",
    zai: "ZAI_API_KEY",
    "zai-coding-cn": "ZAI_API_KEY",
    litellm: "LITELLM_API_KEY",
  }
  const keyEnv = keyEnvByProvider[provider]
  if (apiKey && keyEnv) env[keyEnv] = apiKey
  // MiniMax CN also accepts the international env name in some Pi builds.
  if (apiKey && provider === "minimax-cn") env.MINIMAX_API_KEY = apiKey

  if (provider === "openai" && endpoint) env.OPENAI_BASE_URL = endpoint
  if (provider === "ollama" && endpoint) env.OLLAMA_BASE_URL = endpoint
  if (provider === "litellm" && endpoint) env.LITELLM_BASE_URL = endpoint
  if (provider === "openrouter" && endpoint) env.OPENAI_BASE_URL = endpoint
  return env
}

// ---------------------------------------------------------------------------
// PiRuntime: the child process + JSONL protocol
// ---------------------------------------------------------------------------

export interface PiRuntimeOptions {
  /** Absolute path to the Pi CLI entry (dist/cli.js). */
  cliPath: string
  /** Pi version (informational). */
  version: string
  /** Spawn config (model spec + scoped env vars). */
  spawnConfig: PiSpawnConfig
  /** Working directory for the child — typically the user's repo. Defaults to cwd. */
  cwd?: string
  /** Readiness probe timeout in ms. Default 15_000. */
  readyTimeoutMs?: number
  /** Optional logger (defaults to console). */
  log?: (level: "info" | "warn" | "error", msg: string) => void
}

/**
 * Manages the Pi child process and JSONL RPC protocol.
 *
 * Lifecycle:
 *   const rt = new PiRuntime(opts)
 *   await rt.start()          // spawn + readiness probe
 *   rt.subscribe(event => …)  // streaming events
 *   const result = await rt.prompt("hello")  // one-shot
 *   await rt.stop()
 *
 * Tool-call approvals arrive as PiExtensionUiRequest events; the host
 * responds with respondToUiRequest(id, confirmed). Slice 49D wires this
 * to the TerminalCommandProposal UI.
 */
export class PiRuntime extends EventEmitter {
  private child: ChildProcess | null = null
  private stdin: Writable | null = null
  private readonly pendingCommands = new Map<string, { resolve: (r: PiResponse) => void; reject: (e: Error) => void }>()
  private readonly lineBuffer: string[] = []
  private buf = ""
  /** Cap the line buffer at 1 MB to defend against a runaway child OOMing the host. */
  private static readonly MAX_LINE_BYTES = 1024 * 1024
  private ready = false
  /** True between agent_start and agent_settled — Pi rejects overlapping prompts. */
  private agentBusy = false
  /** Serialize prompts — Pi rejects overlapping prompts without streamingBehavior. */
  private promptChain: Promise<unknown> = Promise.resolve()
  private readonly opts: PiRuntimeOptions
  private readonly log: (level: "info" | "warn" | "error", msg: string) => void
  /** Temp env from materializePiSpawnEnv — cleaned in stop(). */
  private materializedEnv: Record<string, string> | null = null

  constructor(opts: PiRuntimeOptions) {
    super()
    this.opts = opts
    this.log = opts.log ?? ((level, msg) => console[level](`[pi] ${msg}`))
  }

  get isReady(): boolean {
    return this.ready && this.child !== null && !this.child.killed
  }

  get pid(): number | undefined {
    return this.child?.pid
  }

  /** Snapshot of the resolved spawn config (provider/model/env). For status. */
  get spawnConfigSnapshot(): PiSpawnConfig {
    return this.opts.spawnConfig
  }

  /**
   * Spawn Pi in RPC mode and probe for readiness.
   *
   * Readiness = the child has emitted at least one parseable JSON line on
   * stdout (Pi prints a "ready" event on startup). We time out after
   * readyTimeoutMs to avoid hanging the boot if the binary is broken.
   */
  async start(): Promise<void> {
    if (this.child) throw new Error("PiRuntime already started")

    const { cliPath, spawnConfig, cwd } = this.opts
    const nodeExe = resolvePiNodeRuntime()
    const args = ["--mode", "rpc", "--provider", spawnConfig.provider, "--model", spawnConfig.model]

    this.log("info", `spawning: ${nodeExe} ${cliPath} ${args.join(" ")}`)
    // IMPORTANT: spread spawnConfig.env INTO process.env, not replace it.
    // Pi needs PATH, HOME, etc. We only ADD the provider key + endpoint.
    const spawnEnv = materializePiSpawnEnv(spawnConfig)
    this.materializedEnv = spawnEnv
    const childEnv = { ...process.env, ...spawnEnv } as NodeJS.ProcessEnv

    this.child = spawn(nodeExe, [cliPath, ...args], {
      cwd: cwd ?? process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv,
    })

    this.stdin = this.child.stdin
    this.wireStreams()

    // Readiness probe — two-track:
    //   1. Ideal: Pi emits a JSON line on stdout → ready immediately.
    //   2. Fallback: Pi emits non-JSON preamble (e.g. "Warning: Model ...
    //      not found") and then blocks waiting for input. We treat the
    //      child being alive + quiet for GRACE_MS as ready, since the RPC
    //      loop is primed regardless of whether the first line was JSON.
    // The readiness deadline (readyTimeoutMs) still applies: if neither
    // track fires, the child is broken and we abort.
    const readyTimeoutMs = this.opts.readyTimeoutMs ?? 15_000
    const GRACE_MS = 1_000
    await new Promise<void>((resolvePromise, rejectPromise) => {
      let settled = false
      const deadline = setTimeout(() => {
        if (settled) return
        settled = true
        // Deadline hit. If the child is still alive, treat it as ready
        // (fallback track 2 — the child is primed but quiet). If it died,
        // surface the failure.
        if (this.child && !this.child.killed) {
          this.markReady()
          resolvePromise()
        } else {
          rejectPromise(new Error(`Pi readiness probe timed out after ${readyTimeoutMs}ms`))
        }
      }, readyTimeoutMs)
      const grace = setTimeout(() => {
        if (settled) return
        // Grace period elapsed with the child alive but no JSON yet —
        // accept as ready (Pi emitted a non-JSON warning then went quiet).
        if (this.child && !this.child.killed) {
          settled = true
          clearTimeout(deadline)
          this.markReady()
          resolvePromise()
        }
      }, GRACE_MS)
      const onJsonReady = () => {
        if (settled) return
        settled = true
        clearTimeout(deadline)
        clearTimeout(grace)
        resolvePromise()
      }
      this.once("__ready", onJsonReady)
    }).catch((err) => {
      // Don't leave a half-spawned child around.
      void this.stop()
      throw err
    })
  }

  /** Mark the runtime ready (idempotent). */
  private markReady(): void {
    if (this.ready) return
    this.ready = true
    this.emit("__ready")
  }

  /** Wire stdout/stderr handlers + line-framing. */
  private wireStreams(): void {
    const child = this.child
    if (!child?.stdout || !child.stderr) return

    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      this.buf += chunk
      // Bounded buffer: if a single line exceeds MAX_LINE_BYTES, the child
      // is misbehaving (or emitting binary). Drop the buffer and warn,
      // rather than OOM the host.
      if (Buffer.byteLength(this.buf, "utf8") > PiRuntime.MAX_LINE_BYTES * 2) {
        this.log("error", `stdout line exceeded ${PiRuntime.MAX_LINE_BYTES * 2} bytes — dropping buffer (child misbehaving?)`)
        this.buf = ""
      }
      let nl: number
      while ((nl = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, nl).replace(/\r$/, "")
        this.buf = this.buf.slice(nl + 1)
        if (line.trim()) this.handleLine(line)
      }
    })

    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => {
      // Pi's stderr carries diagnostic logs. Buffer the last few lines for
      // error reporting (mirrors OpenClaw's lastGatewayStderr ring buffer).
      for (const l of chunk.split("\n")) {
        const trimmed = l.trim()
        if (trimmed) {
          this.lineBuffer.push(trimmed)
          if (this.lineBuffer.length > 50) this.lineBuffer.shift()
          this.log("warn", `stderr: ${trimmed}`)
        }
      }
    })

    child.on("exit", (code, signal) => {
      const wasReady = this.ready
      this.ready = false
      this.agentBusy = false
      this.log(code === 0 ? "info" : "warn", `child exited (code=${code} signal=${signal})`)
      // Reject any in-flight commands.
      for (const { reject } of this.pendingCommands.values()) {
        reject(new Error(`Pi child exited before responding (code=${code})`))
      }
      this.pendingCommands.clear()
      this.emit("__exit", { code, signal, wasReady })
    })

    child.on("error", (err) => {
      this.log("error", `spawn error: ${err.message}`)
      this.ready = false
      this.emit("__error", err)
    })
  }

  /** Parse one stdout line; tolerate non-JSON preamble (e.g. Pi warnings). */
  private handleLine(line: string): void {
    let msg: unknown
    try {
      msg = JSON.parse(line)
    } catch {
      // Pi sometimes emits non-JSON preamble on stdout (e.g. the
      // "Warning: Model ... not found for provider ... Using custom model
      // id." line). Don't fail readiness on these — log and continue.
      // Strip control chars for log safety.
      const safe = line.replace(/[\x00-\x1F\x7F]/g, "?").slice(0, 200)
      this.log("info", `stdout (non-JSON): ${safe}`)
      return
    }

    // First successful JSON line marks readiness (the common case).
    this.markReady()

    const obj = msg as { type?: string; id?: string }
    if (!obj || typeof obj !== "object" || !obj.type) return

    // Response to a command we sent → resolve its promise.
    if (obj.type === "response" && obj.id) {
      const pending = this.pendingCommands.get(obj.id)
      if (pending) {
        this.pendingCommands.delete(obj.id)
        pending.resolve(obj as PiResponse)
      }
      return
    }

    // Event → forward to subscribers as a typed PiEvent.
    const event = msg as PiEvent
    if (event.type === "agent_start") this.agentBusy = true
    if (event.type === "agent_settled") this.agentBusy = false
    this.emit("event", event)
    // Also emit by `type` so `prompt()` can `once("agent_end"|"agent_settled")`.
    // Without this, ask hangs forever after the model finishes (Ext Agent never replies).
    this.emit(event.type, event)
    // Typed convenience emitter for the UI-request sub-protocol.
    if (event.type === "extension_ui_request") {
      this.emit("ui_request", event as PiExtensionUiRequest)
    }
  }

  /** Wait until Pi is idle (`agent_settled`), or resolve immediately if already idle. */
  private waitUntilIdle(timeoutMs: number): Promise<void> {
    if (!this.agentBusy) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off("agent_settled", onSettled)
        reject(new Error(`Pi still busy after ${timeoutMs}ms`))
      }, timeoutMs)
      const onSettled = () => {
        clearTimeout(timer)
        resolve()
      }
      this.once("agent_settled", onSettled)
    })
  }

  /**
   * Send a command to Pi and await its acceptance response.
   * Streaming events from the turn arrive via subscribe().
   */
  async send(cmd: Omit<PiCommand, "id"> & { id?: string }): Promise<PiResponse> {
    if (!this.stdin || !this.child) throw new Error("PiRuntime not started")
    const id = cmd.id ?? randomUUID()
    const fullCmd: PiCommand = { id, ...cmd } as PiCommand
    const line = JSON.stringify(fullCmd) + "\n"
    return new Promise<PiResponse>((resolve, reject) => {
      this.pendingCommands.set(id, { resolve, reject })
      this.stdin!.write(line, (err) => {
        if (err) {
          this.pendingCommands.delete(id)
          reject(new Error(`failed to write to Pi stdin: ${err.message}`))
        }
      })
    })
  }

  /**
   * Convenience: send a prompt, collect the streamed text into a single result.
   * Subscribers still see every event (text deltas, tool calls) in real time.
   *
   * Prompts are serialized — Pi rejects overlapping prompts without
   * streamingBehavior; Ext Agent must not race asks on one runtime.
   */
  async prompt(text: string): Promise<PiPromptResult> {
    const resultPromise = this.promptChain.then(
      () => this.promptUnlocked(text),
      () => this.promptUnlocked(text),
    )
    this.promptChain = resultPromise.then(
      () => undefined,
      () => undefined,
    )
    return resultPromise
  }

  private async promptUnlocked(text: string): Promise<PiPromptResult> {
    let collected = ""
    let toolCallCount = 0
    const toolTrace: PiToolTraceCall[] = []
    let model: string | undefined
    let cancelled = false

    const absorbAssistantText = (message: unknown) => {
      const full = extractAssistantTextFromPiMessage(message)
      if (full && full.length >= collected.length) collected = full
    }

    const onEvent = (event: PiEvent) => {
      if (event.type === "message_update" && event.assistantMessageEvent) {
        const ame = event.assistantMessageEvent as PiAssistantMessageEvent
        if (ame.type === "text_delta" && typeof ame.delta === "string") {
          if (ame.partial) absorbAssistantText(ame.partial)
          else collected += ame.delta
        } else if (ame.type === "text_end") {
          if (ame.partial) absorbAssistantText(ame.partial)
        } else if (ame.type === "done") {
          absorbAssistantText(ame.message)
        } else if (ame.type === "error") {
          absorbAssistantText(ame.error)
          if (!collected.trim() && typeof ame.message === "string" && ame.message.trim()) {
            collected = `⚠️ ${ame.message.trim()}`
          }
        } else if (ame.type === "tool_use_start") {
          toolCallCount += 1
          const args = ame.input
          toolTrace.push({
            tool: ame.toolName,
            ...(args && typeof args === "object" ? { args: args as Record<string, unknown> } : {}),
          })
        } else if (ame.type === "toolcall_start") {
          toolCallCount += 1
        }
      } else if (event.type === "message_end") {
        absorbAssistantText((event as { message?: unknown }).message)
      } else if (event.type === "turn_end") {
        absorbAssistantText((event as { message?: unknown }).message)
      } else if (event.type === "agent_end") {
        const raw = event as unknown as { model?: string; messages?: unknown[] }
        if (raw.model) model = raw.model
        if (Array.isArray(raw.messages)) {
          for (let i = raw.messages.length - 1; i >= 0; i--) {
            const full = extractAssistantTextFromPiMessage(raw.messages[i])
            if (full) {
              if (full.length >= collected.length) collected = full
              break
            }
          }
        }
      }
    }
    const onCancel = () => {
      cancelled = true
    }
    this.on("event", onEvent)
    this.once("__cancelled", onCancel)

    const promptTimeoutMs = 180_000

    const waitSettled = (): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.off("agent_settled", onSettled)
          reject(new Error(`Pi prompt timed out after ${promptTimeoutMs}ms`))
        }, promptTimeoutMs)
        const onSettled = () => {
          clearTimeout(timer)
          resolve()
        }
        this.once("agent_settled", onSettled)
      })

    try {
      // Ensure previous turn is fully idle before prompting.
      try {
        await this.waitUntilIdle(promptTimeoutMs)
      } catch (err) {
        this.log(
          "warn",
          `waitUntilIdle before prompt: ${err instanceof Error ? err.message : String(err)}`,
        )
        // Last resort: abort the stuck turn so we can proceed.
        try {
          await this.send({ type: "abort" })
        } catch {
          /* ignore */
        }
        this.agentBusy = false
      }

      let resp = await this.send({ type: "prompt", message: text })
      if (!resp.success && /already processing/i.test(resp.error ?? "")) {
        this.log("warn", "prompt rejected (busy) — waiting for idle then retrying")
        this.agentBusy = true
        try {
          await this.waitUntilIdle(promptTimeoutMs)
        } catch {
          try {
            await this.send({ type: "abort" })
          } catch {
            /* ignore */
          }
          this.agentBusy = false
        }
        resp = await this.send({ type: "prompt", message: text })
      }
      if (!resp.success && /already processing/i.test(resp.error ?? "")) {
        // Queue behind the in-flight turn rather than failing the Ext Agent ask.
        this.log("warn", "prompt still busy — sending with streamingBehavior=followUp")
        this.agentBusy = true
        resp = await this.send({
          type: "prompt",
          message: text,
          streamingBehavior: "followUp",
        })
      }
      if (!resp.success) {
        throw new Error(resp.error ?? "Pi rejected the prompt")
      }

      // Register settle waiter only AFTER prompt was accepted (avoids resolving
      // on a stale agent_settled from the previous turn).
      await waitSettled()

      if (!collected.trim()) {
        this.log(
          "warn",
          "prompt finished with empty assistant text (check model output / stopReason)",
        )
      }
      return { text: collected, model, toolCallCount, toolTrace, cancelled }
    } catch (err) {
      try {
        await this.send({ type: "abort" })
      } catch {
        /* ignore */
      }
      this.agentBusy = false
      throw err
    } finally {
      this.off("event", onEvent)
      this.off("__cancelled", onCancel)
    }
  }

  /** Switch model mid-session (clears per-session override back to inherited if undefined). */
  async setModel(modelSpec: string): Promise<void> {
    const resp = await this.send({ type: "set_model", model: modelSpec })
    if (!resp.success) throw new Error(resp.error ?? `Pi rejected set_model(${modelSpec})`)
  }

  /** Cancel the current turn (interrupt the agent). */
  async cancel(): Promise<void> {
    // Pi RPC uses "abort"; keep "cancel" as a soft alias for older callers.
    const resp = await this.send({ type: "abort" })
    this.emit("__cancelled")
    this.agentBusy = false
    if (!resp.success) throw new Error(resp.error ?? "Pi rejected abort")
  }

  /**
   * Respond to a tool-approval UI request from Pi (extension_ui_request).
   * `confirmed=true` lets the tool proceed; `false` makes Pi skip it.
   */
  async respondToUiRequest(id: string, confirmed: boolean): Promise<void> {
    if (!this.stdin) throw new Error("PiRuntime not started")
    const resp: PiExtensionUiResponse = { type: "extension_ui_response", id, confirmed }
    this.stdin.write(JSON.stringify(resp) + "\n")
  }

  /** Last N stderr lines — for error diagnostics. */
  getRecentStderr(): string[] {
    return [...this.lineBuffer]
  }

  /** Stop the child process gracefully (SIGTERM, then SIGKILL after 5s). */
  async stop(): Promise<void> {
    const child = this.child
    this.ready = false
    if (this.stdin) {
      this.stdin.destroy()
      this.stdin = null
    }
    if (child) {
      await new Promise<void>((resolveStop) => {
        const killTimer = setTimeout(() => {
          try {
            child.kill("SIGKILL")
          } catch {
            /* already dead */
          }
        }, 5_000)
        child.once("exit", () => {
          clearTimeout(killTimer)
          resolveStop()
        })
        try {
          child.kill("SIGTERM")
        } catch {
          clearTimeout(killTimer)
          resolveStop()
        }
      })
    }
    this.child = null
    cleanupPiSpawnEnv(this.materializedEnv ?? undefined)
    this.materializedEnv = null
  }
}
