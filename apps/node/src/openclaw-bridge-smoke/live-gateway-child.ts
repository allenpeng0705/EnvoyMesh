/**
 * Process: real OpenClaw Gateway with envoymesh extension (smoke echo mode).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function requireArg(name: string): string {
  const idx = process.argv.indexOf(name);
  const value = idx >= 0 ? process.argv[idx + 1] : undefined;
  if (!value?.trim()) {
    console.error(`Missing ${name}`);
    process.exit(2);
  }
  return value.trim();
}

const openclawRoot = requireArg("--openclaw-root");
const gatewayPort = Number(requireArg("--gateway-port"));
const bridgePort = Number(requireArg("--bridge-port"));
const secret = process.env.ENVOYMESH_BRIDGE_SMOKE_SECRET ?? "envoymesh-smoke-secret";
const allowedOwnerId =
  process.env.ENVOYMESH_BRIDGE_SMOKE_OWNER_ID?.trim() ?? "envoy:owner:smoke";

async function resolveGatewayCommand(root: string): Promise<{ command: string; args: string[] }> {
  for (const entry of ["dist/index.js", "dist/index.mjs"]) {
    const path = join(root, entry);
    if (existsSync(path)) {
      return { command: "node", args: [path] };
    }
  }
  return { command: "node", args: [join(root, "scripts/run-node.mjs")] };
}

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
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw new Error(`gateway did not listen on port ${port} within ${timeoutMs}ms`);
}

const stateRoot = await mkdtemp(join(tmpdir(), "envoymesh-openclaw-smoke-"));
const stateDir = join(stateRoot, "state");
await mkdir(stateDir, { recursive: true });

const configPath = join(stateDir, "openclaw.json");
const bridgeUrl = `http://127.0.0.1:${bridgePort}/bridge/send`;
const config = {
  channels: {
    envoymesh: {
      enabled: true,
      bridgeUrl,
      bridgeSecret: secret,
      inboundSecret: secret,
      webhookPath: "/webhook/envoymesh",
      dmPolicy: "allowlist",
      allowedOwnerIds: [allowedOwnerId],
    },
  },
};
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

const gatewayEntry = await resolveGatewayCommand(openclawRoot);
const child: ChildProcess = spawn(
  gatewayEntry.command,
  [
    ...gatewayEntry.args,
    "gateway",
    "--port",
    String(gatewayPort),
    "--bind",
    "loopback",
    "--allow-unconfigured",
  ],
  {
    cwd: openclawRoot,
    env: {
      ...process.env,
      CI: process.env.CI ?? "true",
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
      ENVOYMESH_SMOKE_ECHO: "1",
      ENVOYMESH_SMOKE_REPLY:
        process.env.ENVOYMESH_BRIDGE_SMOKE_REPLY ?? "openclaw live smoke reply",
      ENVOYMESH_BRIDGE_SMOKE_SECRET: secret,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let stderrBuf = "";
child.stderr?.on("data", (chunk) => {
  const text = chunk.toString("utf8");
  stderrBuf += text;
  process.stderr.write(`[openclaw] ${text}`);
});

child.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    process.stderr.write(
      `[openclaw] gateway exited with code ${code}\n${stderrBuf.slice(-2000)}\n`,
    );
    process.exit(code ?? 1);
  }
});

const startupTimeoutMs = Number(process.env.ENVOYMESH_OPENCLAW_GATEWAY_START_MS ?? "120000");
try {
  await waitForPort(gatewayPort, startupTimeoutMs);
} catch (err) {
  child.kill("SIGTERM");
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Failed to start OpenClaw gateway: ${message}`);
  if (stderrBuf) {
    console.error(stderrBuf.slice(-3000));
  }
  process.exit(1);
}

const agentUrl = `http://127.0.0.1:${gatewayPort}/webhook/envoymesh`;
process.stdout.write(`ready gateway=${agentUrl} openclawRoot=${openclawRoot}\n`);

function shutdown() {
  child.kill("SIGTERM");
  setTimeout(() => child.kill("SIGKILL"), 3000).unref();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await new Promise<void>(() => {
  // Parent orchestrator sends SIGTERM when smoke completes.
});
