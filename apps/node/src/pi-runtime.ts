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
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
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
} from "@envoymesh/api"
import type { ModelProviderConfig } from "@envoymesh/api"

const require = createRequire(import.meta.url)

// ---------------------------------------------------------------------------
// Discovery: find the bundled Pi CLI
// ---------------------------------------------------------------------------

/**
 * Locate the Pi CLI entry point. Search order mirrors OpenClaw's
 * discoverOpenClaw():
 *   1. ENVOYMESH_PI_CLI env var (operator override / dev mode)
 *   2. Bundled sidecar: <repoRoot>/apps/tauri/src-tauri/resources/pi/...
 *   3. Globally-installed `pi` on PATH (dev convenience)
 *   4. Upstream package from node_modules (dev/test only)
 *
 * Returns null when not found (slim build with -SkipPi, or fetch failed).
 */
export function discoverPiCli(repoRoot?: string): { cliPath: string; version: string } | null {
  // 1. Explicit override.
  if (process.env.ENVOYMESH_PI_CLI && existsSync(process.env.ENVOYMESH_PI_CLI)) {
    return { cliPath: process.env.ENVOYMESH_PI_CLI, version: readPiVersion(process.env.ENVOYMESH_PI_CLI) }
  }

  // 2. Bundled sidecar. Two candidate layouts:
  //    a. Production: <root>/apps/tauri/src-tauri/resources/pi/node_modules/@earendil-works/pi-coding-agent/dist/cli.js
  //    b. Test/dev:   resolve from this module's location upward.
  const root = repoRoot ?? inferRepoRoot()
  const bundledCandidates = [
    join(root, "apps/tauri/src-tauri/resources/pi/node_modules/@earendil-works/pi-coding-agent/dist/cli.js"),
  ]
  for (const candidate of bundledCandidates) {
    if (existsSync(candidate)) {
      return { cliPath: candidate, version: readPiVersion(candidate) }
    }
  }

  // 3. Try resolving the upstream package from node_modules (dev/test).
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
  const here = resolve(__dirname)
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
function getNodeRuntime(): string {
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
 */
export function buildPiSpawnConfig(
  modelProviders: ModelProviderConfig,
  override?: PiModelOverride,
): PiSpawnConfig | null {
  // Per-session override wins.
  if (override) {
    return {
      modelSpec: `${override.provider}/${override.model}`,
      provider: override.provider,
      model: override.model,
      env: buildProviderEnv(override.provider, override.apiKey, override.endpoint),
      inherited: false,
    }
  }

  const mode = modelProviders.mode
  if (mode === "disabled" || mode === "mock") return null

  const apiKey = modelProviders.apiKey
  const endpoint = modelProviders.endpoint
  const modelName = modelProviders.modelName
  if (!modelName) return null

  // Map EnvoyMesh's mode → Pi provider name + env var layout.
  switch (mode) {
    case "anthropic-compatible":
      return {
        modelSpec: `anthropic/${modelName}`,
        provider: "anthropic",
        model: modelName,
        env: buildProviderEnv("anthropic", apiKey, endpoint),
        inherited: true,
      }
    case "openai-compatible":
      return {
        modelSpec: `openai/${modelName}`,
        provider: "openai",
        model: modelName,
        env: buildProviderEnv("openai", apiKey, endpoint),
        inherited: true,
      }
    case "ollama":
      return {
        modelSpec: `ollama/${modelName}`,
        provider: "ollama",
        model: modelName,
        env: buildProviderEnv("ollama", apiKey, endpoint ?? "http://localhost:11434"),
        inherited: true,
      }
    case "litellm":
      return {
        modelSpec: `litellm/${modelName}`,
        provider: "litellm",
        model: modelName,
        env: buildProviderEnv("litellm", apiKey, endpoint),
        inherited: true,
      }
    default:
      return null
  }
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
  switch (provider) {
    case "anthropic":
      if (apiKey) env.ANTHROPIC_API_KEY = apiKey
      break
    case "openai":
      if (apiKey) env.OPENAI_API_KEY = apiKey
      if (endpoint) env.OPENAI_BASE_URL = endpoint
      break
    case "ollama":
      if (endpoint) env.OLLAMA_BASE_URL = endpoint
      break
    case "litellm":
      if (apiKey) env.LITELLM_API_KEY = apiKey
      if (endpoint) env.LITELLM_BASE_URL = endpoint
      break
  }
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
  private ready = false
  private readonly opts: PiRuntimeOptions
  private readonly log: (level: "info" | "warn" | "error", msg: string) => void

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
    const nodeExe = getNodeRuntime()
    const args = ["--mode", "rpc", "--provider", spawnConfig.provider, "--model", spawnConfig.model]

    this.log("info", `spawning: ${nodeExe} ${cliPath} ${args.join(" ")}`)
    // IMPORTANT: spread spawnConfig.env INTO process.env, not replace it.
    // Pi needs PATH, HOME, etc. We only ADD the provider key + endpoint.
    const childEnv = { ...process.env, ...spawnConfig.env } as NodeJS.ProcessEnv

    this.child = spawn(nodeExe, [cliPath, ...args], {
      cwd: cwd ?? process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv,
    })

    this.stdin = this.child.stdin
    this.wireStreams()

    // Readiness probe — wait for the first stdout line or timeout.
    const readyTimeoutMs = this.opts.readyTimeoutMs ?? 15_000
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        if (!this.ready) {
          rejectPromise(new Error(`Pi readiness probe timed out after ${readyTimeoutMs}ms`))
        }
      }, readyTimeoutMs)
      const onReady = () => {
        clearTimeout(timer)
        resolvePromise()
      }
      this.once("__ready", onReady)
    }).catch((err) => {
      // Don't leave a half-spawned child around.
      void this.stop()
      throw err
    })
  }

  /** Wire stdout/stderr handlers + line-framing. */
  private wireStreams(): void {
    const child = this.child
    if (!child?.stdout || !child.stderr) return

    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      this.buf += chunk
      let nl: number
      while ((nl = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, nl).trim()
        this.buf = this.buf.slice(nl + 1)
        if (line) this.handleLine(line)
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

  /** Parse one JSONL line and dispatch to response/event handlers. */
  private handleLine(line: string): void {
    let msg: unknown
    try {
      msg = JSON.parse(line)
    } catch {
      this.log("warn", `unparseable stdout line: ${line.slice(0, 200)}`)
      return
    }

    // First line marks readiness regardless of content.
    if (!this.ready) {
      this.ready = true
      this.emit("__ready")
    }

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
    this.emit("event", event)
    // Typed convenience emitter for the UI-request sub-protocol.
    if (event.type === "extension_ui_request") {
      this.emit("ui_request", event as PiExtensionUiRequest)
    }
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
   */
  async prompt(text: string): Promise<PiPromptResult> {
    let collected = ""
    let toolCallCount = 0
    let model: string | undefined
    let cancelled = false

    const onEvent = (event: PiEvent) => {
      if (event.type === "message_update" && event.assistantMessageEvent) {
        const ame = event.assistantMessageEvent as PiAssistantMessageEvent
        if (ame.type === "text_delta") collected += ame.delta
        else if (ame.type === "tool_use_start") toolCallCount += 1
      } else if (event.type === "tool_execution_start") {
        // Count tool executions too (some tools don't emit tool_use messages).
      } else if (event.type === "agent_end") {
        // Agent metadata may carry the model used; capture if present.
        const raw = event as unknown as { model?: string }
        if (raw.model) model = raw.model
      }
    }
    const onCancel = () => {
      cancelled = true
    }
    this.on("event", onEvent)
    this.once("__cancelled", onCancel)

    try {
      const resp = await this.send({ type: "prompt", message: text })
      if (!resp.success) {
        throw new Error(resp.error ?? "Pi rejected the prompt")
      }
      // Wait for the agent_end / turn_end event that closes this turn.
      await new Promise<void>((resolveTurn) => {
        const done = () => resolveTurn()
        this.once("agent_end", done)
        this.once("turn_end", done)
      })
      return { text: collected, model, toolCallCount, cancelled }
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
    const resp = await this.send({ type: "cancel" })
    this.emit("__cancelled")
    if (!resp.success) throw new Error(resp.error ?? "Pi rejected cancel")
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
    if (!child) return
    this.ready = false
    if (this.stdin) {
      this.stdin.destroy()
      this.stdin = null
    }
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
    this.child = null
  }
}
