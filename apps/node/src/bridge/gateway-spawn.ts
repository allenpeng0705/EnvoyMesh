/**
 * Gateway Spawner — discover and auto-start OpenClaw Gateway as a child process.
 *
 * Used when bridge config has `autoStartGateway: true`. Finds the OpenClaw binary,
 * ensures the envoymesh channel extension is available, writes a minimal config,
 * spawns the gateway process, and waits for it to listen.
 */

import { spawn, type ChildProcess, execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---- Types ----

export interface GatewaySpawnParams {
  /** Port the gateway should listen on. */
  gatewayPort: number;
  /** URL the gateway should POST replies to (the bridge's /bridge/send endpoint). */
  bridgeUrl: string;
  /** Shared secret for bridge-gateway auth (optional, matches bridge config secret). */
  secret?: string;
  /** Allowed owner IDs for the envoymesh channel DM policy. */
  allowedOwnerIds: string[];
  /** Explicit path to the OpenClaw binary. Auto-discovered if not set. */
  openclawPath?: string;
  /** Directory for gateway state (config, extensions, logs). Defaults to a temp dir. */
  stateDir?: string;
  /** Timeout for waiting on the gateway port (ms). */
  startupTimeoutMs?: number;
}

export interface GatewayHandle {
  /** The child process. */
  process: ChildProcess;
  /** The URL the bridge can POST to (webhook endpoint). */
  agentUrl: string;
  /** Graceful stop: SIGTERM → wait → SIGKILL. */
  stop: () => Promise<void>;
}

// ---- Binary Discovery ----

const WORKSPACE_ROOT = join(__dirname, "..", "..", "..", "..");
const SOURCE_DIR = join(WORKSPACE_ROOT, "packages", "openclaw");
const SOURCE_EXT_DIR = join(SOURCE_DIR, "extensions", "envoymesh");
const EXTENSION_SRC = join(WORKSPACE_ROOT, "OpenClawExtension");
const BUNDLED_BIN = join(WORKSPACE_ROOT, "packages", "openclaw-runtime", "bin", "openclaw");

type GatewayMode = { mode: "source"; cwd: string } | { mode: "binary"; path: string; cwd: string };

/**
 * Discover the best way to run the OpenClaw Gateway.
 * Prefers source checkout (packages/openclaw/) because the envoymesh
 * extension is TypeScript and needs tsx for on-the-fly compilation.
 * Falls back to a global/bundled binary — but the envoymesh channel
 * may not work without a pre-compiled extension.
 */
function discoverGateway(explicitPath?: string): GatewayMode | null {
  if (explicitPath && existsSync(explicitPath)) {
    // Explicit path — treat as binary
    return { mode: "binary", path: explicitPath, cwd: WORKSPACE_ROOT };
  }

  // 1. Source checkout (preferred — supports TS extensions via tsx)
  if (existsSync(join(SOURCE_DIR, "openclaw.mjs"))) {
    return { mode: "source", cwd: SOURCE_DIR };
  }

  // 2. Global binary on PATH
  try {
    const result = execSync("which openclaw 2>/dev/null || where openclaw 2>/dev/null", {
      timeout: 2000,
      encoding: "utf-8",
    }).trim();
    if (result && existsSync(result)) {
      return { mode: "binary", path: result, cwd: WORKSPACE_ROOT };
    }
  } catch { /* not on PATH */ }

  // 3. Bundled binary (shell wrapper that delegates to source)
  if (existsSync(BUNDLED_BIN)) {
    return { mode: "binary", path: BUNDLED_BIN, cwd: WORKSPACE_ROOT };
  }

  return null;
}

function resolveGatewayCommand(gw: GatewayMode): { command: string; args: string[]; cwd: string } {
  if (gw.mode === "source") {
    // Try pnpm exec tsx first (uses workspace-installed tsx), fall back
    // to npx tsx (downloads on demand). Both resolve TS source imports.
    // cwd must be packages/openclaw/ for module resolution.
    // Check which tsx is available:
    try {
      execSync("pnpm exec tsx --version", { cwd: gw.cwd, stdio: "ignore", timeout: 5000 });
      return { command: "pnpm", args: ["exec", "tsx", "openclaw.mjs"], cwd: gw.cwd };
    } catch {
      return { command: "npx", args: ["tsx", "openclaw.mjs"], cwd: gw.cwd };
    }
  }
  return { command: gw.path, args: [], cwd: gw.cwd };
}

// ---- Extension Sync ----

/**
 * Sync the envoymesh extension into the source checkout's extensions dir.
 * The OpenClaw gateway loads plugins from `{cwd}/extensions/` when running
 * from source via tsx. This is the only path that works for the TS extension.
 */
async function ensureEnvoymeshExtension(gw: GatewayMode): Promise<void> {
  if (!existsSync(join(EXTENSION_SRC, "index.ts"))) {
    console.log("[gateway-spawn] EnvoyMesh extension source not found — gateway may lack envoymesh channel support");
    return;
  }

  // For source mode: ensure the bootstrap dist/entry.js exists and the
  // extension is reachable.  setup.sh may wipe dist/, so we recreate here.
  if (gw.mode === "source") {
    const entryPath = join(SOURCE_DIR, "dist", "entry.js");
    const needsEntry = !existsSync(entryPath);
    const needsExt = !existsSync(join(SOURCE_EXT_DIR, "index.ts"));

    if (!needsEntry && !needsExt) return;

    try {
      const { mkdirSync: mkdir, writeFileSync: writeFs } = await import("node:fs");
      if (needsEntry) {
        mkdir(join(SOURCE_DIR, "dist"), { recursive: true });
        writeFs(entryPath, [
          `// EnvoyMesh bootstrap — re-exports the gateway from TS source.`,
          `// openclaw.mjs loads this file; tsx (via pnpm exec) handles .ts resolution.`,
          `export * from "../src/cli/run-main.ts";`,
          ``,
        ].join("\n"), "utf-8");
        console.log("[gateway-spawn] created dist/entry.js bootstrap");
      }
      if (needsExt) {
        if (!existsSync(join(EXTENSION_SRC, "index.ts"))) {
          console.log("[gateway-spawn] EnvoyMesh extension source not found");
        } else {
          const installScript = join(WORKSPACE_ROOT, "scripts", "install-openclaw-extension.sh");
          if (existsSync(installScript)) {
            const { execSync: exec } = await import("node:child_process");
            exec(`bash "${installScript}" "${SOURCE_DIR}"`, {
              cwd: WORKSPACE_ROOT, encoding: "utf-8", timeout: 30_000,
            });
            console.log("[gateway-spawn] envoymesh extension installed");
          }
        }
      }
    } catch (err) {
      console.warn("[gateway-spawn] bootstrap creation failed:", err instanceof Error ? err.message : err);
    }
    return;
  }

  // For binary mode: the extension needs to be compiled JS.
  // Try the stateDir approach as a best-effort fallback.
  console.log("[gateway-spawn] binary mode — envoymesh channel may not be available (extension is TypeScript)");
}

// ---- Port Wait ----

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect({ host: "127.0.0.1", port });
        socket.once("connect", () => {
          socket.destroy();
          resolve();
        });
        socket.once("error", reject);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`Gateway did not listen on port ${port} within ${timeoutMs}ms`);
}

/**
 * Poll the webhook endpoint until it responds (non-404).
 * Returns true if the route is responding, false on timeout.
 */
async function waitForWebhookRoute(agentUrl: string, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const resp = await fetch(agentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromOwnerId: "envoymesh-startup-probe", text: "ping" }),
        signal: AbortSignal.timeout(2000),
      });
      // Any non-404 response means the route is registered
      if (resp.status !== 404) {
        console.log(`[gateway-spawn] Webhook route responded: ${resp.status}`);
        return true;
      }
    } catch {
      // Fetch failed — gateway may not be fully ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ---- Spawn ----

export async function spawnOpenClawGateway(params: GatewaySpawnParams): Promise<GatewayHandle> {
  const gatewayPort = params.gatewayPort;
  const bridgeUrl = params.bridgeUrl;
  const secret = params.secret ?? "";
  const allowedOwnerIds = params.allowedOwnerIds;
  const startupTimeoutMs = params.startupTimeoutMs ?? 120_000;

  const stateDir = params.stateDir ?? join(tmpdir(), `envoymesh-gateway-${process.pid}`);
  mkdirSync(stateDir, { recursive: true });

  // Discover how to run the gateway
  const gw = params.openclawPath
    ? discoverGateway(params.openclawPath)
    : discoverGateway();
  if (!gw) {
    throw new Error("OpenClaw not found — checked PATH, bundled binary, and source checkout");
  }

  // Ensure the envoymesh extension is available
  await ensureEnvoymeshExtension(gw);

  // Write an OpenClaw config with the envoymesh channel enabled.
  // onStartup: true in the plugin manifest registers the channel ID
  // before config validation, so "envoymesh" is recognized.
  // The channel needs to be in the config for startAccount to fire.
  const config = {
    channels: {
      envoymesh: {
        enabled: true,
        bridgeUrl,
        bridgeSecret: secret || undefined,
        inboundSecret: secret || undefined,
        webhookPath: "/webhook/envoymesh",
        dmPolicy: allowedOwnerIds.length > 0 ? "allowlist" : "open",
        allowedOwnerIds: allowedOwnerIds.length > 0 ? allowedOwnerIds : ["*"],
      },
    },
  };
  const configPath = join(stateDir, "openclaw.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  console.log("[gateway-spawn] wrote config to", configPath);

  const { command, args, cwd } = resolveGatewayCommand(gw);

  console.log(`[gateway-spawn] Starting OpenClaw Gateway: ${command} ${args.join(" ")} gateway --port ${gatewayPort}`);

  const child = spawn(
    command,
    [
      ...args,
      "gateway",
      "--port",
      String(gatewayPort),
      "--bind",
      "loopback",
      "--allow-unconfigured",
    ],
    {
      cwd,
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: stateDir,
        OPENCLAW_CONFIG_PATH: configPath,
        // Point at source extensions/ so the gateway finds envoymesh
        // (symlinked there by setup.sh).  The gateway prefers dist/extensions/
        // for source checkouts but envoymesh only lives in extensions/.
        OPENCLAW_BUNDLED_PLUGINS_DIR: join(SOURCE_DIR, "extensions"),
        // Channel env vars for envoymesh (from openclaw.plugin.json)
        ENVOYMESH_BRIDGE_URL: bridgeUrl,
        ...(secret ? { ENVOYMESH_BRIDGE_SECRET: secret } : {}),
        ...(secret ? { ENVOYMESH_INBOUND_SECRET: secret } : {}),
        ENVOYMESH_ALLOWED_OWNER_IDS: allowedOwnerIds.join(","),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  // Collect stderr for diagnostics and log key lines
  let stderrBuf = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf-8");
    stderrBuf += text;
    // Log lines that indicate channel / gateway events
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.includes("envoymesh") || trimmed.includes("EnvoyMesh") ||
          trimmed.includes("gateway") || trimmed.includes("Gateway") ||
          trimmed.includes("error") || trimmed.includes("Error") ||
          trimmed.includes("fail") || trimmed.includes("Fail")) {
        console.log(`[gateway] ${trimmed.slice(0, 400)}`);
      }
    }
  });

  child.on("exit", (code) => {
    if (code !== 0 && code !== null && child.exitCode === null) {
      console.warn(`[gateway-spawn] Gateway exited with code ${code}`);
      if (stderrBuf) {
        console.warn(stderrBuf.slice(-2000));
      }
    }
  });

  const startedAt = Date.now();

  // Wait for the gateway port
  try {
    await waitForPort(gatewayPort, startupTimeoutMs);
  } catch (err) {
    child.kill("SIGTERM");
    const message = err instanceof Error ? err.message : String(err);
    if (stderrBuf) {
      console.error("[gateway-spawn] Gateway stderr:", stderrBuf.slice(-3000));
    }
    throw new Error(`Failed to start OpenClaw Gateway: ${message}`);
  }

  const agentUrl = `http://127.0.0.1:${gatewayPort}/webhook/envoymesh`;

  // The HTTP server is listening, but channel routes may take another
  // moment to register. Poll the webhook endpoint until it responds
  // (non-404), indicating the envoymesh channel is active.
  const routeTimeoutMs = Math.min(startupTimeoutMs - (Date.now() - startedAt), 30_000);
  if (routeTimeoutMs > 0) {
    const routeReady = await waitForWebhookRoute(agentUrl, routeTimeoutMs);
    if (!routeReady) {
      console.warn("[gateway-spawn] Gateway HTTP ready but envoymesh webhook route not responding — continuing anyway");
    }
  }

  console.log(`[gateway-spawn] Gateway ready at ${agentUrl}`);

  const stop = async (): Promise<void> => {
    if (child.killed) return;
    child.kill("SIGTERM");
    // Wait up to 5s for graceful shutdown, then force
    await new Promise<void>((resolve) => {
      const force = setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 5000);
      child.once("exit", () => {
        clearTimeout(force);
        resolve();
      });
    });
  };

  return { process: child, agentUrl, stop };
}

/**
 * Quick check: can we find an OpenClaw binary or source checkout?
 */
export function canStartGateway(explicitPath?: string): boolean {
  return discoverGateway(explicitPath) !== null;
}
