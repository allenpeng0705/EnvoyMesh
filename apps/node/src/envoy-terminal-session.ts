/**
 * U4+ — the Envoy TUI terminal session.
 *
 * Spawns the standalone `envoy-harness-tui` (the Codex/Claude-style
 * screen TUI) inside a reserved TerminalManager session
 * (`role: "envoy-harness"`) pointed at a project folder — the same
 * pattern as Pi's interactive TUI (`pi-terminal-session.ts`).
 *
 * The TUI is spawned with `--spawn --provider <p> --model <m>`, so it
 * boots a live `envoy-harness --acp` harness with the node's model
 * config (provider API key passed through the environment).
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  EnsureEnvoyTerminalParams,
  EnsureEnvoyTerminalResult,
  ModelProviderConfig,
  PiSettings,
  TerminalSessionSummary,
} from "@envoymesh/api";

import type { TerminalManager } from "./terminal-manager.js";
import { resolvePiProjectDir } from "./pi-terminal-session.js";

/** Max concurrent Envoy TUI sessions (like Pi's cap). */
export const MAX_ENVOY_TERMINAL_SESSIONS = 5;

/** Deps supplied by NodeServiceImpl. */
export interface EnvoyTerminalSessionDeps {
  loadConfig: () => Promise<{
    piEnabled?: boolean;
    piSettings?: PiSettings;
    modelProviders?: ModelProviderConfig;
    envoyHarnessAutoRunPolicy?: string;
  } | null>;
  /** Persist the project folder into envoyHarnessCwd (MRU). */
  saveProjectPath: (absolutePath: string) => Promise<void>;
  /** Resolve the runtime's provider/model/apiKey (host config + env). */
  resolveRuntimeConfig: () => Promise<{
    provider: string;
    model: string;
    apiKey?: string;
    endpoint?: string;
  }>;
}

/** Sidebar / session title: `Envoy · <folder>`. */
export function envoySessionTitle(projectPath: string): string {
  const name = basename(projectPath.replace(/[/\\]+$/, "")) || "project";
  return `Envoy · ${name}`;
}

/** Resolve the standalone envoy-harness TUI binary (env → monorepo → PATH). */
export function resolveEnvoyHarnessTuiBin(): string | null {
  if (process.env.ENVOY_HARNESS_TUI_BIN?.trim()) {
    return process.env.ENVOY_HARNESS_TUI_BIN;
  }
  const here = dirname(fileURLToPath(import.meta.url)); // apps/node/src
  const sibling = resolve(
    here,
    "../../../../envoy-harness/packages/envoy-harness-tui/dist/bin.js",
  );
  return existsSync(sibling) ? sibling : null;
}

/** The provider's API key env var, e.g. DEEPSEEK_API_KEY. */
function apiKeyEnvForProvider(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
}

/**
 * Ensure an Envoy TUI is running for the given project folder.
 * Mirrors `ensurePiTerminalSession` (reuse by cwd, project required).
 */
export async function ensureEnvoyTerminalSession(
  manager: TerminalManager,
  deps: EnvoyTerminalSessionDeps,
  params: EnsureEnvoyTerminalParams = {},
): Promise<EnsureEnvoyTerminalResult> {
  const cfg = await deps.loadConfig();
  if (!cfg) {
    return { ok: false, code: "no_config", reason: "Node config is not available." };
  }
  if (cfg.piEnabled === false) {
    return {
      ok: false,
      code: "disabled",
      reason: "Coding agents are disabled in Settings → AI.",
    };
  }

  const projectDir = resolvePiProjectDir(params.projectPath);
  if (!params.projectPath?.trim()) {
    return {
      ok: false,
      code: "needs_project",
      reason: "Choose a project folder to open Envoy.",
    };
  }
  if (!projectDir) {
    return {
      ok: false,
      code: "invalid_project",
      reason: "Project path is missing or is not a directory.",
    };
  }

  if (!params.forceRestart) {
    const existing = manager.findSessionByCwd("envoy-harness", projectDir);
    if (existing) return { ok: true, session: existing };
  }

  const tuiBin = resolveEnvoyHarnessTuiBin();
  if (!tuiBin) {
    return {
      ok: false,
      code: "no_tui",
      reason: "envoy-harness-tui not found — build packages/envoy-harness-tui.",
    };
  }

  const runtime = await deps.resolveRuntimeConfig();
  if (!runtime.model) {
    return {
      ok: false,
      code: "no_model",
      reason: "Configure a model in Settings → AI before opening Envoy.",
    };
  }

  if (params.forceRestart) {
    const toClose = manager.findSessionByCwd("envoy-harness", projectDir);
    if (toClose) {
      await manager.closeTerminalSession({ sessionId: toClose.sessionId });
    }
  }

  const running = manager.listSessionsByRole("envoy-harness");
  if (
    !running.some((s) => resolve(s.cwd) === projectDir) &&
    running.length >= MAX_ENVOY_TERMINAL_SESSIONS
  ) {
    return {
      ok: false,
      code: "envoy_limit_reached",
      reason: `At most ${MAX_ENVOY_TERMINAL_SESSIONS} Envoy project sessions can run at once. Close one, then retry.`,
    };
  }

  // The runtime's `model` is "<provider>:<modelName>" — the harness's
  // `--model` expects the BARE model name (the provider is its own flag).
  const modelName = runtime.model.includes(":")
    ? runtime.model.slice(runtime.model.indexOf(":") + 1)
    : runtime.model;
  const args = [
    tuiBin,
    "--spawn",
    "--provider",
    runtime.provider,
    "--model",
    modelName,
  ];
  // Pass the node's permission policy so the spawned TUI starts with the
  // same mode as the Envoy chat (default = safe auto-run).
  const policy =
    cfg?.envoyHarnessAutoRunPolicy ??
    "safe-only";
  args.push(
    "--permissions",
    policy === "off" || policy === "never"
      ? "approve"
      : policy === "always-confirm"
        ? "ask"
        : "default",
  );
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  if (runtime.apiKey) {
    env[apiKeyEnvForProvider(runtime.provider)] = runtime.apiKey;
  }
  if (runtime.endpoint) {
    // OpenAI/Anthropic-compatible modes (MiniMax, LiteLLM, Envoy Local)
    // need the base URL so the spawned harness hits the right endpoint.
    const baseUrlEnv =
      runtime.provider === "openai"
        ? "OPENAI_BASE_URL"
        : runtime.provider === "anthropic" || runtime.provider === "claude"
          ? "ANTHROPIC_BASE_URL"
          : runtime.provider === "deepseek"
            ? "DEEPSEEK_BASE_URL"
            : undefined;
    if (baseUrlEnv) env[baseUrlEnv] = runtime.endpoint;
  }

  try {
    const session = await manager.createTerminalSession({
      title: envoySessionTitle(projectDir),
      cwd: projectDir,
      role: "envoy-harness",
      command: process.execPath,
      args,
      env,
    });
    try {
      await deps.saveProjectPath(projectDir);
    } catch {
      /* best-effort MRU */
    }
    return { ok: true, session };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: "spawn_failed",
      reason: `Failed to start Envoy TUI: ${msg}`,
    };
  }
}
