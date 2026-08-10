/**
 * ClawHub skill/plugin management and bridge-config persistence.
 *
 * Extracted from `node-service-impl.ts` (ClawHub section + bridge-config helpers).
 */
import { join, dirname } from "node:path";
import { ensureOpenClawWorkspace } from "./openclaw-workspace.js";
import { resolveBundledSkillsDir } from "./bundled-paths.js";

function bridgeConfigPath(cwd = process.cwd()): string {
  return join(cwd, "data", "default", "bridge-config.json");
}

export interface ClawHubContext {
  resolveOpenClawWorkspaceDir(): string;
  loadBridgeConfigClawhubToken(): Promise<string | undefined>;
  stopOpenClaw(): Promise<void>;
  startOpenClaw(): Promise<boolean>;
}

export function buildClawHubContext(host: any): ClawHubContext {
  return {
    resolveOpenClawWorkspaceDir: () => host._resolveOpenClawWorkspaceDir(),
    loadBridgeConfigClawhubToken: () => loadBridgeConfigClawhubToken(),
    stopOpenClaw: () => host.stopOpenClaw(),
    startOpenClaw: () => host.startOpenClaw(),
  };
}

export async function loadBridgeConfigWebSearchEnabled(
  cwd = process.cwd(),
): Promise<boolean | undefined> {
  try {
    const { readFile } = await import("node:fs/promises");
    const cfg = JSON.parse(await readFile(bridgeConfigPath(cwd), "utf-8"));
    return typeof cfg?.webSearchEnabled === "boolean" ? cfg.webSearchEnabled : undefined;
  } catch {
    return undefined;
  }
}

export async function loadBridgeConfigSkillApiKeys(
  cwd = process.cwd(),
): Promise<Record<string, string> | undefined> {
  try {
    const { readFile } = await import("node:fs/promises");
    const cfg = JSON.parse(await readFile(bridgeConfigPath(cwd), "utf-8"));
    return cfg?.skillApiKeys;
  } catch {
    return undefined;
  }
}

export async function loadBridgeConfigClawhubToken(cwd = process.cwd()): Promise<string | undefined> {
  try {
    const { readFile } = await import("node:fs/promises");
    const cfg = JSON.parse(await readFile(bridgeConfigPath(cwd), "utf-8"));
    const token = cfg?.clawhubToken;
    return typeof token === "string" && token.trim() ? token.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function resolveOpenClawWorkspaceDirFromProfile(
  profileDir: string,
  ownerId: string,
  cwd = process.cwd(),
): string {
  if (!profileDir || profileDir === "/tmp/unknown") {
    throw new Error("OpenClaw workspace unavailable — profile not loaded");
  }
  return ensureOpenClawWorkspace(profileDir, { ownerId }, {
    legacySkillsDir: resolveBundledSkillsDir(cwd),
  });
}

async function clawhubBin(): Promise<string> {
  const { existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { homedir } = await import("node:os");
  const candidates: string[] = [];
  // Tauri resource dir — clawhub installed into openclaw's node_modules
  const resourceDir = process.env.TAURI_RESOURCE_DIR?.trim() || process.env.TAURI_APP_RESOURCES_DIR?.trim();
  if (resourceDir) {
    candidates.push(
      join(resourceDir, "resources", "openclaw", "node_modules", ".bin", "clawhub"),
      join(resourceDir, "openclaw", "node_modules", ".bin", "clawhub"),
    );
  }
  // Global install locations
  if (homedir()) {
    candidates.push(
      join(homedir(), ".npm-global", "bin", "clawhub"),
      join(homedir(), ".local", "bin", "clawhub"),
    );
  }
  candidates.push("/usr/local/bin/clawhub");
  const found = candidates.find((c) => existsSync(c));
  if (found) return found;
  try {
    const { execSync } = await import("node:child_process");
    const which = execSync("which clawhub 2>/dev/null", { encoding: "utf-8", timeout: 2000 }).trim();
    if (which && existsSync(which)) return which;
  } catch {
    /* not found */
  }
  return "clawhub";
}

/**
 * Build an env object that ensures `node` is on PATH for child processes.
 * In Tauri bundles, `node` lives inside the app bundle and isn't on the
 * system PATH.  The Tauri launcher sets ENVOYMESH_NODE_EXE to the
 * bundled Node binary — we prepend its directory to PATH.
 */
function childEnv(extra?: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  const nodeExe = process.env.ENVOYMESH_NODE_EXE?.trim();
  if (nodeExe) {
    const nodeDir = dirname(nodeExe);
    const currentPath = env.PATH ?? "";
    // Prepend node dir to PATH so `#!/usr/bin/env node` shebangs work
    env.PATH = nodeDir + (currentPath ? ":" + currentPath : "");
  }
  return env;
}

async function execClawhub(
  ctx: ClawHubContext,
  args: string[],
  timeoutMs: number,
): Promise<string> {
  const { execFileSync } = await import("node:child_process");
  const bin = await clawhubBin();
  const workdir = ctx.resolveOpenClawWorkspaceDir();
  const token = await ctx.loadBridgeConfigClawhubToken();
  return execFileSync(bin, [...args, "--workdir", workdir], {
    encoding: "utf-8",
    timeout: timeoutMs,
    env: childEnv({
      CLAWHUB_WORKDIR: workdir,
      ...(token ? { CLAWHUB_TOKEN: token } : {}),
    }),
  }).trim();
}

export async function getOpenClawPluginsViaRuntime(ctx: ClawHubContext): Promise<string[]> {
  try {
    const out = await execClawhub(ctx, ["list"], 5000);
    const lines = out
      .split("\n")
      .map((l) => l.trim())
      .filter(
        (l) =>
          l &&
          !l.startsWith("Installed") &&
          !l.startsWith("Skills") &&
          !l.startsWith("Name") &&
          !l.startsWith("No "),
      );
    console.log("[clawhub] list raw:", JSON.stringify(out.slice(0, 200)), "lines:", lines.length);
    return lines.length ? lines : ["(no skills installed)"];
  } catch (err: unknown) {
    const e = err as { stderr?: { toString(): string }; message?: string };
    const msg = e.stderr?.toString() || e.message || "";
    console.warn("[clawhub] list failed:", msg);
    if (msg.includes("command not found") || msg.includes("not found")) {
      return ["__clawhub_missing__"];
    }
    return [msg.slice(0, 200)];
  }
}

export async function getTrendingOpenClawPluginsViaRuntime(_ctx: ClawHubContext): Promise<string[]> {
  try {
    const resp = await fetch("https://clawhub.ai/api/v1/skills?limit=20", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as Record<string, unknown>;
    const items = (data?.skills ?? data?.items ?? data ?? []) as unknown[];
    return (Array.isArray(items) ? items : []).slice(0, 20).map((raw) => {
      const s = raw as Record<string, unknown>;
      const slug = String(s.slug ?? "");
      const name = String(s.name ?? slug);
      const desc = s.description ? ` — ${String(s.description).slice(0, 80)}` : "";
      const ownerHandle =
        typeof s.owner === "string" ? s.owner : (s.owner as { handle?: string })?.handle ?? "";
      const url = ownerHandle && slug ? `https://clawhub.ai/${ownerHandle}/${slug}` : "";
      return JSON.stringify({ slug, name, desc: desc.trim(), url, owner: ownerHandle });
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return [`Error: ${msg.slice(0, 200)}`];
  }
}

export async function searchOpenClawPluginsViaRuntime(
  _ctx: ClawHubContext,
  query: string,
): Promise<string[]> {
  try {
    const resp = await fetch(`https://clawhub.ai/api/v1/search?q=${encodeURIComponent(query)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as Record<string, unknown>;
    console.log("[clawhub] search response keys:", Object.keys(data ?? {}).join(", "));
    const items = (data?.skills ?? data?.items ?? data?.results ?? data ?? []) as unknown[];
    if (!Array.isArray(items)) {
      console.warn("[clawhub] search: items is not array, type:", typeof items);
      return [];
    }
    console.log("[clawhub] search: found", items.length, "results");
    return items.slice(0, 20).map((raw) => {
      const s = raw as Record<string, unknown>;
      const slug = String(s.slug ?? "");
      const name = String(s.name ?? slug);
      const desc = s.description ? ` — ${String(s.description).slice(0, 80)}` : "";
      const ownerHandle =
        typeof s.owner === "string" ? s.owner : (s.owner as { handle?: string })?.handle ?? "";
      const url = ownerHandle && slug ? `https://clawhub.ai/${ownerHandle}/${slug}` : "";
      return JSON.stringify({ slug, name, desc: desc.trim(), url, owner: ownerHandle });
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[clawhub] search failed:", msg);
    return [`Error: ${msg.slice(0, 200)}`];
  }
}

export async function installOpenClawPluginViaRuntime(
  ctx: ClawHubContext,
  name: string,
): Promise<{ ok: boolean; message: string }> {
  const safe = /^[a-zA-Z0-9._-]+$/.test(name) ? name : null;
  if (!safe) return { ok: false, message: "Invalid plugin name" };
  try {
    const out = await execClawhub(ctx, ["install", safe], 60000);
    await reloadOpenClawConfigViaRuntime(ctx);
    return { ok: true, message: out || "Installed" };
  } catch (err: unknown) {
    const e = err as { stderr?: { toString(): string }; message?: string };
    const msg = e.stderr?.toString() || e.message || "Install failed";
    if (msg.includes("command not found") || msg.includes("not found")) {
      return {
        ok: false,
        message: "clawhub CLI not installed. Run: npm i -g clawhub && clawhub login",
      };
    }
    return { ok: false, message: msg.slice(0, 300) };
  }
}

export async function uninstallOpenClawPluginViaRuntime(
  ctx: ClawHubContext,
  name: string,
): Promise<{ ok: boolean; message: string }> {
  const safe = /^[a-zA-Z0-9._-]+$/.test(name) ? name : null;
  if (!safe) return { ok: false, message: "Invalid plugin name" };
  try {
    const out = await execClawhub(ctx, ["uninstall", safe], 30000);
    await reloadOpenClawConfigViaRuntime(ctx);
    return { ok: true, message: out || "Uninstalled" };
  } catch (err: unknown) {
    const e = err as { stderr?: { toString(): string }; message?: string };
    const msg = e.stderr?.toString() || e.message || "Uninstall failed";
    return { ok: false, message: msg.slice(0, 300) };
  }
}

export async function saveWebSearchEnabledViaRuntime(
  ctx: ClawHubContext,
  enabled: boolean,
  cwd = process.cwd(),
): Promise<{ ok: boolean }> {
  try {
    const { readFileSync, writeFileSync } = await import("node:fs");
    const cfgPath = bridgeConfigPath(cwd);
    const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
    cfg.webSearchEnabled = enabled;
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
    await ctx.stopOpenClaw();
    await ctx.startOpenClaw();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function saveSkillApiKeysViaRuntime(
  ctx: ClawHubContext,
  keys: Record<string, string>,
  cwd = process.cwd(),
): Promise<{ ok: boolean }> {
  try {
    const { readFileSync, writeFileSync } = await import("node:fs");
    const bridgeCfgPath = bridgeConfigPath(cwd);
    const bridgeCfg = JSON.parse(readFileSync(bridgeCfgPath, "utf-8"));
    bridgeCfg.skillApiKeys = Object.keys(keys).length > 0 ? keys : undefined;
    writeFileSync(bridgeCfgPath, JSON.stringify(bridgeCfg, null, 2) + "\n", "utf-8");
    await ctx.stopOpenClaw();
    await ctx.startOpenClaw();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function saveClawhubTokenViaRuntime(
  token: string,
  cwd = process.cwd(),
): Promise<{ ok: boolean }> {
  try {
    const { readFileSync, writeFileSync } = await import("node:fs");
    const cfgPath = bridgeConfigPath(cwd);
    const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
    cfg.clawhubToken = token || undefined;
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function reloadOpenClawConfigViaRuntime(ctx: ClawHubContext): Promise<void> {
  console.log("[openclaw] Reloading config — restarting gateway...");
  // Wait out any in-flight start before stop/start. Killing mid-probe races
  // the startup waiter and flashes "Gateway child is null" / SIGTERM errors
  // in Settings even though the follow-up start succeeds.
  await ctx.startOpenClaw().catch(() => undefined);
  await ctx.stopOpenClaw();
  await ctx.startOpenClaw();
}
