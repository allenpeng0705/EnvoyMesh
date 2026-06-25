/**
 * Auto-start bundled Ext Agent sidecars (Hermes, OpenHuman) as child processes.
 *
 * HomeClaw is excluded — production HomeClaw exposes its own HTTP channel on :8010.
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtAgentEntry, ResolvedBridgeConfig } from "./config.js";
import { probeExtAgentHealth } from "./config.js";
import {
  isBundledSidecarAgent,
  parseSidecarPort,
  sidecarScriptRelPath,
  type BundledSidecarAgentId,
} from "./bundled-ext-agents.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");

interface SidecarChild {
  agentId: BundledSidecarAgentId;
  port: number;
  process: ChildProcess;
}

export interface SidecarSpawnContext {
  nodeCwd: string;
  listenPort: number;
  secret?: string;
}

function resolveSidecarScript(nodeCwd: string, agentId: BundledSidecarAgentId): string | null {
  const rel = sidecarScriptRelPath(agentId);
  const fromCwd = resolve(nodeCwd, rel);
  if (existsSync(fromCwd)) return fromCwd;
  const fromRepo = join(REPO_ROOT, rel);
  if (existsSync(fromRepo)) return fromRepo;
  const resourceDir =
    process.env.TAURI_RESOURCE_DIR?.trim() || process.env.TAURI_APP_RESOURCES_DIR?.trim();
  if (resourceDir) {
    const bundled = join(resourceDir, rel);
    if (existsSync(bundled)) return bundled;
  }
  return null;
}

function commandOnPath(name: string): boolean {
  try {
    if (process.platform === "win32") {
      execSync(`where ${name}`, { stdio: "ignore", timeout: 3000 });
    } else {
      execSync(`command -v ${name}`, { stdio: "ignore", timeout: 3000 });
    }
    return true;
  } catch {
    return false;
  }
}

function sidecarEnvForAgent(
  agentId: BundledSidecarAgentId,
  ctx: SidecarSpawnContext,
  port: number,
): Record<string, string> {
  const bridgeUrl = `http://127.0.0.1:${ctx.listenPort}/bridge/send`;
  const env: Record<string, string> = {
    PORT: String(port),
    BRIDGE_URL: bridgeUrl,
  };
  const secret = ctx.secret?.trim();
  if (secret) env.BRIDGE_SECRET = secret;

  if (agentId === "hermes" && commandOnPath("hermes")) {
    env.HERMES_CMD = 'hermes chat --message "{text}"';
  }
  return env;
}

async function waitForSidecarHealth(agentUrl: string, attempts = 60): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await probeExtAgentHealth(agentUrl, "envoymesh-message")) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

export class ExtAgentSidecarManager {
  private readonly _children = new Map<BundledSidecarAgentId, SidecarChild>();

  /** Start or restart enabled bundled sidecars; stop sidecars no longer needed. */
  async sync(
    resolved: ResolvedBridgeConfig,
    ctx: SidecarSpawnContext,
  ): Promise<void> {
    if (!resolved.enabled) {
      await this.stopAll();
      return;
    }

    const wanted = new Set<BundledSidecarAgentId>();
    for (const entry of resolved.extAgents ?? []) {
      if (!entry.enabled) continue;
      if (!isBundledSidecarAgent(entry.id)) continue;
      wanted.add(entry.id);
      await this._ensureRunning(entry, ctx);
    }

    for (const id of [...this._children.keys()]) {
      if (!wanted.has(id)) {
        await this._stop(id);
      }
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this._children.keys()].map((id) => this._stop(id)));
  }

  private async _ensureRunning(entry: ExtAgentEntry, ctx: SidecarSpawnContext): Promise<void> {
    if (!isBundledSidecarAgent(entry.id)) return;
    const agentId = entry.id;

    const port = parseSidecarPort(agentId, entry.url);
    const existing = this._children.get(agentId);
    if (existing && existing.port === port && existing.process.exitCode == null) {
      const healthy = await probeExtAgentHealth(entry.url, entry.adapter);
      if (healthy) return;
      await this._stop(agentId);
    } else if (existing) {
      await this._stop(agentId);
    }

    const externalHealthy = await probeExtAgentHealth(entry.url, entry.adapter);
    if (externalHealthy) {
      console.log(`[ext-sidecar] ${entry.id} already reachable at ${entry.url} — not spawning`);
      return;
    }

    const script = resolveSidecarScript(ctx.nodeCwd, agentId);
    if (!script) {
      console.warn(`[ext-sidecar] script not found for ${agentId}`);
      return;
    }

    const env = {
      ...process.env,
      ...sidecarEnvForAgent(agentId, ctx, port),
    };

    const proc = spawn(process.execPath, [script], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    proc.stdout?.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) console.log(`[ext-sidecar:${entry.id}] ${line}`);
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) console.warn(`[ext-sidecar:${entry.id}] ${line}`);
    });
    proc.on("exit", (code, signal) => {
      if (this._children.get(agentId)?.process === proc) {
        this._children.delete(agentId);
      }
      console.log(`[ext-sidecar] ${agentId} exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    });

    this._children.set(agentId, { agentId, port, process: proc });

    const ready = await waitForSidecarHealth(entry.url);
    if (ready) {
      console.log(`[ext-sidecar] ${entry.id} ready on port ${port}`);
    } else {
      console.warn(`[ext-sidecar] ${entry.id} started but health probe failed (${entry.url})`);
    }
  }

  private async _stop(agentId: BundledSidecarAgentId): Promise<void> {
    const child = this._children.get(agentId);
    if (!child) return;
    this._children.delete(agentId);
    const { process: proc } = child;
    if (proc.exitCode != null) return;

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          /* ignore */
        }
        resolve();
      }, 3000);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        proc.kill("SIGTERM");
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }
}
