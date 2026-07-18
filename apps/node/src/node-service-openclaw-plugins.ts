/**
 * OpenClaw extension/plugin management.
 *
 * Prefers the `openclaw` CLI for list/inspect/enable/disable/install/
 * uninstall/update operations (handles config persistence and gateway
 * reload internally).  When the CLI is unavailable — e.g. in Tauri
 * bundles where `node` is not on the child-process PATH — falls back
 * to scanning the bundled plugin discovery directories on disk for
 * `openclaw.plugin.json` manifests.
 */
import { join, resolve, dirname } from "node:path"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

// ---------------------------------------------------------------------------
// Filesystem-based plugin discovery (fallback when CLI is unavailable)
// ---------------------------------------------------------------------------

interface PluginManifest {
  id: string;
  activation?: { onStartup?: boolean };
  channels?: string[];
  contracts?: { tools?: string[] };
  configSchema?: Record<string, unknown>;
}

/**
 * Read and parse an `openclaw.plugin.json` manifest from a directory.
 * Returns null if the file doesn't exist or is invalid JSON.
 */
function readPluginManifest(dir: string): PluginManifest | null {
  try {
    const raw = readFileSync(join(dir, "openclaw.plugin.json"), "utf-8")
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.id === "string" && parsed.id.length > 0) {
      return parsed as PluginManifest
    }
  } catch {
    // missing file, invalid JSON, etc.
  }
  return null
}

/**
 * Discover plugin manifests by scanning the OpenClaw bundled plugin
 * discovery directories (the same roots that the gateway uses):
 *
 *   1. dist-runtime/extensions/
 *   2. dist/extensions/
 *   3. extensions/
 *   4. workspace .openclaw/extensions/
 *   5. global ~/.openclaw/extensions/
 *
 * Returns deduplicated plugins keyed by id (later roots override earlier).
 */
function scanBundledPluginsFromDisk(ocDir: string, workspaceDir?: string): import("@envoymesh/api").OpenClawPluginInfo[] {
  const resourceDir = process.env.TAURI_RESOURCE_DIR?.trim() || process.env.TAURI_APP_RESOURCES_DIR?.trim()

  // Build candidate extension directories to scan (same priority order as
  // OpenClaw's resolveBundledDirFromPackageRoot).
  const scanRoots: string[] = []

  if (ocDir) {
    scanRoots.push(
      join(ocDir, "dist-runtime", "extensions"),
      join(ocDir, "dist", "extensions"),
      join(ocDir, "extensions"),
    )
  }
  if (resourceDir) {
    scanRoots.push(
      join(resourceDir, "resources", "openclaw", "dist-runtime", "extensions"),
      join(resourceDir, "resources", "openclaw", "dist", "extensions"),
      join(resourceDir, "resources", "openclaw", "extensions"),
    )
  }
  // Workspace-local extensions
  if (workspaceDir) {
    scanRoots.push(join(workspaceDir, ".openclaw", "extensions"))
  }
  // Global extensions
  const home = process.env.HOME || process.env.USERPROFILE || ""
  if (home) {
    scanRoots.push(join(home, ".openclaw", "extensions"))
  }

  const seen = new Map<string, import("@envoymesh/api").OpenClawPluginInfo>()

  for (const root of scanRoots) {
    if (!existsSync(root)) continue
    let entries: string[]
    try {
      entries = readdirSync(root)
    } catch {
      continue
    }
    for (const name of entries) {
      if (seen.has(name)) continue  // first-found wins
      const dir = join(root, name)
      const manifest = readPluginManifest(dir)
      if (!manifest) continue
      // Read optional version/description from package.json
      let version: string | undefined
      let description: string | undefined
      try {
        const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"))
        version = pkg.version
        description = pkg.description
      } catch {
        // no package.json
      }
      seen.set(name, {
        id: manifest.id,
        name: manifest.id,
        version,
        description,
        origin: "bundled",
        enabled: true,
        channels: manifest.channels ?? [],
        tools: manifest.contracts?.tools ?? [],
      })
    }
  }

  return Array.from(seen.values())
}

// ---------------------------------------------------------------------------
// Plugin context
// ---------------------------------------------------------------------------

export interface OpenClawPluginContext {
  resolveOpenClawWorkspaceDir(): string;
  resolveOpenClawDir(): string | null;
  stopOpenClaw(): Promise<void>;
  startOpenClaw(): Promise<boolean>;
}

export function buildOpenClawPluginContext(host: any): OpenClawPluginContext {
  return {
    resolveOpenClawWorkspaceDir: () => host._resolveOpenClawWorkspaceDir(),
    resolveOpenClawDir: () => host._resolveOpenClawDir?.() ?? null,
    stopOpenClaw: () => host.stopOpenClaw(),
    startOpenClaw: () => host.startOpenClaw(),
  }
}

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

/**
 * Return the directory of the bundled Node binary (from Tauri's
 * ENVOYMESH_NODE_EXE env var).  Used to prepend `node` to PATH for
 * child processes so that `#!/usr/bin/env node` shebangs work.
 */
function nodeExeDir(): string | undefined {
  const exe = process.env.ENVOYMESH_NODE_EXE?.trim()
  if (!exe) return undefined
  return dirname(exe)
}

/**
 * Run an `openclaw plugins` CLI command and return the JSON output.
 */
async function runOpenClawPluginsCommand(
  args: string[],
  timeoutMs = 30_000,
): Promise<string> {
  const openclawBin = await resolveOpenClawBin()
  if (!openclawBin) {
    throw new Error("openclaw CLI not found")
  }
  const { stdout } = await execFileAsync(openclawBin, args, {
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env },
  })
  return stdout
}

/**
 * Run an `openclaw plugins` CLI command with the workspace dir set.
 */
async function runOpenClawPluginsCommandInWorkspace(
  workspaceDir: string,
  args: string[],
  timeoutMs = 30_000,
): Promise<string> {
  const openclawBin = await resolveOpenClawBin()
  if (!openclawBin) {
    throw new Error("openclaw CLI not found")
  }
  const { stdout } = await execFileAsync(openclawBin, args, {
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
    cwd: workspaceDir,
    env: {
      ...process.env,
      OPENCLAW_DISABLE_BUNDLED_PLUGINS: "",
      // Ensure `node` is on PATH for child processes (#!/usr/bin/env node)
      PATH: nodeExeDir()
        ? `${nodeExeDir()}${process.env.PATH ? ":" + process.env.PATH : ""}`
        : process.env.PATH ?? "",
    },
  })
  return stdout
}

async function resolveOpenClawBin(): Promise<string | null> {
  const { existsSync } = await import("node:fs")
  const { join, resolve } = await import("node:path")
  const candidates = [
    resolve("node_modules", ".bin", "openclaw"),
    resolve("..", "node_modules", ".bin", "openclaw"),
  ]
  // Check Tauri resource dir (resources/openclaw/node_modules/.bin/openclaw)
  const resourceDir = process.env.TAURI_RESOURCE_DIR?.trim() || process.env.TAURI_APP_RESOURCES_DIR?.trim()
  if (resourceDir) {
    candidates.push(
      join(resourceDir, "openclaw", "node_modules", ".bin", "openclaw"),
      join(resourceDir, "resources", "openclaw", "node_modules", ".bin", "openclaw"),
    )
  }
  // Also check common global install locations
  const home = process.env.HOME || process.env.USERPROFILE || ""
  if (home) {
    candidates.push(
      join(home, ".npm-global", "bin", "openclaw"),
      join(home, ".local", "bin", "openclaw"),
    )
  }
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  // Try which
  try {
    const { execFileSync } = await import("node:child_process")
    const whichResult = execFileSync("which", ["openclaw"], { encoding: "utf-8" }).trim()
    if (whichResult) return whichResult
  } catch {
    // not found
  }
  return null
}

/**
 * List installed OpenClaw extensions/plugins.
 *
 * Tries the CLI first (`openclaw plugins list --json`).  When the CLI
 * is unavailable (e.g. Tauri bundles where `node` is not on the child-
 * process PATH), falls back to scanning the bundled plugin directories
 * on disk for `openclaw.plugin.json` manifests.
 */
export async function listOpenClawExtensionPluginsViaRuntime(
  ctx: OpenClawPluginContext,
): Promise<import("@envoymesh/api").OpenClawPluginInfo[]> {
  try {
    const workspaceDir = ctx.resolveOpenClawWorkspaceDir()
    const stdout = await runOpenClawPluginsCommandInWorkspace(
      workspaceDir,
      ["plugins", "list", "--json"],
    )
    const data = JSON.parse(stdout)
    // The CLI returns an array of plugin records
    const plugins: any[] = Array.isArray(data) ? data : data?.plugins ?? data?.items ?? []
    return plugins.map((p: any) => ({
      id: p.id ?? p.name ?? p.pluginId ?? "unknown",
      name: p.name ?? p.manifestName ?? p.id ?? "unknown",
      version: p.version ?? p.packageVersion,
      description: p.description ?? p.packageDescription,
      origin: p.origin ?? "bundled",
      enabled: p.enabled ?? true,
      channels: p.channels ?? [],
      tools: p.tools ?? [],
    }))
  } catch (err) {
    console.error("[openclaw-plugins] CLI list failed, falling back to filesystem scan:", err)
    const ocDir = ctx.resolveOpenClawDir()
    const workspaceDir = ctx.resolveOpenClawWorkspaceDir()
    return scanBundledPluginsFromDisk(ocDir ?? "", workspaceDir)
  }
}

/**
 * Inspect a single extension/plugin in detail.
 */
export async function inspectOpenClawExtensionPluginViaRuntime(
  ctx: OpenClawPluginContext,
  id: string,
): Promise<import("@envoymesh/api").OpenClawPluginDetail | null> {
  try {
    const workspaceDir = ctx.resolveOpenClawWorkspaceDir()
    const stdout = await runOpenClawPluginsCommandInWorkspace(
      workspaceDir,
      ["plugins", "inspect", id, "--json"],
    )
    const data = JSON.parse(stdout)
    return {
      id: data.id ?? data.name ?? id,
      name: data.name ?? data.manifestName ?? id,
      version: data.version ?? data.packageVersion,
      description: data.description ?? data.packageDescription,
      origin: data.origin ?? "bundled",
      enabled: data.enabled ?? true,
      channels: data.channels ?? [],
      tools: data.tools ?? [],
      configSchema: data.configSchema,
      contributions: data.contributions,
      installRecord: data.installRecord,
    }
  } catch (err) {
    console.error(`[openclaw-plugins] inspect ${id} failed:`, err)
    return null
  }
}

/**
 * Enable an extension/plugin.
 */
export async function enableOpenClawExtensionPluginViaRuntime(
  ctx: OpenClawPluginContext,
  id: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const workspaceDir = ctx.resolveOpenClawWorkspaceDir()
    await runOpenClawPluginsCommandInWorkspace(
      workspaceDir,
      ["plugins", "enable", id],
    )
    // Reload gateway to pick up the config change
    await reloadOpenClawViaRuntime(ctx)
    return { ok: true, message: `Enabled plugin "${id}"` }
  } catch (err: any) {
    return { ok: false, message: err?.message ?? `Failed to enable "${id}"` }
  }
}

/**
 * Disable an extension/plugin.
 */
export async function disableOpenClawExtensionPluginViaRuntime(
  ctx: OpenClawPluginContext,
  id: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const workspaceDir = ctx.resolveOpenClawWorkspaceDir()
    await runOpenClawPluginsCommandInWorkspace(
      workspaceDir,
      ["plugins", "disable", id],
    )
    await reloadOpenClawViaRuntime(ctx)
    return { ok: true, message: `Disabled plugin "${id}"` }
  } catch (err: any) {
    return { ok: false, message: err?.message ?? `Failed to disable "${id}"` }
  }
}

/**
 * Install an extension/plugin from an npm spec, git URL, or local path.
 */
export async function installOpenClawExtensionPluginViaRuntime(
  ctx: OpenClawPluginContext,
  spec: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const workspaceDir = ctx.resolveOpenClawWorkspaceDir()
    await runOpenClawPluginsCommandInWorkspace(
      workspaceDir,
      ["plugins", "install", spec],
      120_000,
    )
    await reloadOpenClawViaRuntime(ctx)
    return { ok: true, message: `Installed "${spec}"` }
  } catch (err: any) {
    return { ok: false, message: err?.message ?? `Failed to install "${spec}"` }
  }
}

/**
 * Uninstall an extension/plugin.
 */
export async function uninstallOpenClawExtensionPluginViaRuntime(
  ctx: OpenClawPluginContext,
  id: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const workspaceDir = ctx.resolveOpenClawWorkspaceDir()
    await runOpenClawPluginsCommandInWorkspace(
      workspaceDir,
      ["plugins", "uninstall", id],
      30_000,
    )
    await reloadOpenClawViaRuntime(ctx)
    return { ok: true, message: `Uninstalled plugin "${id}"` }
  } catch (err: any) {
    return { ok: false, message: err?.message ?? `Failed to uninstall "${id}"` }
  }
}

/**
 * Update an extension/plugin.
 */
export async function updateOpenClawExtensionPluginViaRuntime(
  ctx: OpenClawPluginContext,
  id: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const workspaceDir = ctx.resolveOpenClawWorkspaceDir()
    await runOpenClawPluginsCommandInWorkspace(
      workspaceDir,
      ["plugins", "update", id],
      120_000,
    )
    await reloadOpenClawViaRuntime(ctx)
    return { ok: true, message: `Updated plugin "${id}"` }
  } catch (err: any) {
    return { ok: false, message: err?.message ?? `Failed to update "${id}"` }
  }
}

/**
 * Restart the OpenClaw gateway to pick up config changes.
 */
async function reloadOpenClawViaRuntime(ctx: OpenClawPluginContext): Promise<void> {
  console.log("[openclaw-plugins] Reloading gateway...")
  await ctx.stopOpenClaw()
  await ctx.startOpenClaw()
}
