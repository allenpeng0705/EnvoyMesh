/**
 * OpenClaw extension/plugin management.
 *
 * Uses the `openclaw` CLI to list, inspect, enable, disable, install,
 * uninstall, and update extensions. The CLI handles config persistence
 * and gateway reload internally.
 *
 * Extracted pattern from node-service-clawhub.ts (which uses `clawhub`
 * CLI for skill management).
 */
import { join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export interface OpenClawPluginContext {
  resolveOpenClawWorkspaceDir(): string;
  stopOpenClaw(): Promise<void>;
  startOpenClaw(): Promise<boolean>;
}

export function buildOpenClawPluginContext(host: any): OpenClawPluginContext {
  return {
    resolveOpenClawWorkspaceDir: () => host._resolveOpenClawWorkspaceDir(),
    stopOpenClaw: () => host.stopOpenClaw(),
    startOpenClaw: () => host.startOpenClaw(),
  }
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
    env: { ...process.env, OPENCLAW_DISABLE_BUNDLED_PLUGINS: "" },
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
    const which = execFileSync("which", ["openclaw"], { encoding: "utf-8" }).trim()
    if (which) return which
  } catch {
    // not found
  }
  return null
}

/**
 * List installed OpenClaw extensions/plugins.
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
    console.error("[openclaw-plugins] list failed:", err)
    return []
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
