/**
 * Two-process OpenClaw bridge smoke:
 *   Mock: mock OpenClaw webhook + EnvoyMesh bridge
 *   Live: real OpenClaw Gateway (ENVOYMESH_SMOKE_ECHO) + EnvoyMesh bridge
 *
 * Live requires OPENCLAW_ROOT (or ../openclaw sibling) with a built OpenClaw checkout.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertOpenClawBuildReady,
  resolveOpenClawRoot,
  syncOpenClawExtension,
} from "./live-probe.js";
import { getFreePort } from "./ports.js";

const here = dirname(fileURLToPath(import.meta.url));
const nodePkgRoot = join(here, "..", "..");
const workspaceRoot = join(nodePkgRoot, "..", "..");
const secret = process.env.ENVOYMESH_BRIDGE_SMOKE_SECRET ?? "envoymesh-smoke-secret";
const smokeTimeoutMs = Number(process.env.ENVOYMESH_BRIDGE_SMOKE_TIMEOUT_MS ?? "45000");
const smokeOwnerId = process.env.ENVOYMESH_BRIDGE_SMOKE_OWNER_ID?.trim() ?? "envoy:owner:smoke";
const isLive = process.env.OPENCLAW_BRIDGE_SMOKE_LIVE === "1";

function log(message: string): void {
  console.log(`[smoke:openclaw-bridge] ${message}`);
}

function resolveTsxCommand(): { command: string; prefixArgs: string[] } {
  const candidates = [
    join(nodePkgRoot, "node_modules", ".bin", "tsx"),
    join(workspaceRoot, "node_modules", ".bin", "tsx"),
  ];
  for (const bin of candidates) {
    if (existsSync(bin)) {
      return { command: bin, prefixArgs: [] };
    }
  }
  return { command: "npx", prefixArgs: ["tsx"] };
}

const tsxCommand = resolveTsxCommand();

function spawnChild(
  script: string,
  args: string[],
  env: Record<string, string>,
): ChildProcess {
  return spawn(tsxCommand.command, [...tsxCommand.prefixArgs, script, ...args], {
    cwd: workspaceRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function waitForReadyLine(
  child: ChildProcess,
  label: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let stderrBuf = "";
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${label} timed out waiting for ready${stderrBuf ? `; stderr: ${stderrBuf.slice(0, 500)}` : ""}`,
        ),
      );
    }, timeoutMs);
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const line = buffer.split("\n").find((l) => l.startsWith("ready "));
      if (line) {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onStderr);
        child.off("exit", onExit);
        resolve(line);
      }
    };
    const onStderr = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderrBuf += text;
      process.stderr.write(`[${label}] ${text}`);
    };
    const onExit = (code: number | null) => {
      clearTimeout(timer);
      reject(
        new Error(
          `${label} exited early with code ${code}${stderrBuf ? `; stderr: ${stderrBuf.slice(0, 500)}` : ""}`,
        ),
      );
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onStderr);
    child.on("exit", onExit);
  });
}

function waitForStdoutLine(
  child: ChildProcess,
  prefix: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for ${prefix}`)),
      timeoutMs,
    );
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const line = buffer.split("\n").find((l) => l.startsWith(prefix));
      if (line) {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        resolve(line);
      }
    };
    child.stdout?.on("data", onData);
  });
}

async function killChild(child: ChildProcess | null): Promise<void> {
  if (!child || child.killed) {
    return;
  }
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.on("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function injectChat(controlPort: number, text: string): Promise<void> {
  const injectRes = await fetch(`http://127.0.0.1:${controlPort}/smoke/inject-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      senderPeerId: "envoy_peer_smoke_e2e",
      senderOwnerId: smokeOwnerId,
      text,
    }),
  });
  if (!injectRes.ok) {
    throw new Error(`inject-chat failed: ${injectRes.status} ${await injectRes.text()}`);
  }
}

async function assertReplySent(controlPort: number): Promise<void> {
  const health = await fetch(`http://127.0.0.1:${controlPort}/smoke/health`);
  const healthJson = (await health.json()) as { replySent?: boolean };
  if (!healthJson.replySent) {
    throw new Error("bridge health check: replySent=false");
  }
}

async function runMockSmoke(): Promise<void> {
  const gatewayPort = await getFreePort();
  const bridgePort = await getFreePort();
  const controlPort = await getFreePort();
  const agentUrl = `http://127.0.0.1:${gatewayPort}/webhook/envoymesh`;

  const gatewayScript = join(here, "gateway-child.ts");
  const bridgeScript = join(here, "bridge-child.ts");

  log(`mode=mock gatewayPort=${gatewayPort} bridgePort=${bridgePort} controlPort=${controlPort}`);

  let gatewayChild: ChildProcess | null = null;
  let bridgeChild: ChildProcess | null = null;

  try {
    gatewayChild = spawnChild(
      gatewayScript,
      ["--gateway-port", String(gatewayPort), "--bridge-port", String(bridgePort)],
      { ENVOYMESH_BRIDGE_SMOKE_SECRET: secret },
    );

    const gatewayReady = await waitForReadyLine(gatewayChild, "gateway", smokeTimeoutMs);
    log(gatewayReady);

    bridgeChild = spawnChild(
      bridgeScript,
      [
        "--bridge-port",
        String(bridgePort),
        "--control-port",
        String(controlPort),
        "--agent-url",
        agentUrl,
      ],
      { ENVOYMESH_BRIDGE_SMOKE_SECRET: secret },
    );

    const bridgeReady = await waitForReadyLine(bridgeChild, "bridge", smokeTimeoutMs);
    log(bridgeReady);

    await injectChat(controlPort, "two-process smoke ping");
    log("injected chat.message into bridge");

    const replyLine = await waitForStdoutLine(bridgeChild, "reply-sent", smokeTimeoutMs);
    log(replyLine);
    if (!replyLine.includes("openclaw smoke reply") && !replyLine.includes("smoke reply")) {
      log("warning: unexpected reply text (AI prefix may apply)");
    }

    await assertReplySent(controlPort);
    log("PASS — mock two-process round-trip complete");
    process.exitCode = 0;
  } finally {
    await killChild(bridgeChild);
    await killChild(gatewayChild);
  }
}

async function runLiveSmoke(): Promise<void> {
  const openclawRoot = resolveOpenClawRoot(workspaceRoot);
  if (!openclawRoot) {
    throw new Error(
      "OPENCLAW_BRIDGE_SMOKE_LIVE=1 requires OPENCLAW_ROOT or a sibling ../openclaw checkout",
    );
  }

  log(`mode=live openclawRoot=${openclawRoot}`);
  await syncOpenClawExtension(workspaceRoot, openclawRoot);
  log("synced OpenClawExtension → openclaw/extensions/envoymesh");
  assertOpenClawBuildReady(openclawRoot);

  const gatewayPort = await getFreePort();
  const bridgePort = await getFreePort();
  const controlPort = await getFreePort();
  const agentUrl = `http://127.0.0.1:${gatewayPort}/webhook/envoymesh`;
  const liveGatewayTimeoutMs = Number(
    process.env.ENVOYMESH_OPENCLAW_GATEWAY_START_MS ?? "120000",
  );

  const bridgeScript = join(here, "bridge-child.ts");
  const liveGatewayScript = join(here, "live-gateway-child.ts");

  log(`gatewayPort=${gatewayPort} bridgePort=${bridgePort} controlPort=${controlPort}`);

  let gatewayChild: ChildProcess | null = null;
  let bridgeChild: ChildProcess | null = null;

  try {
    bridgeChild = spawnChild(
      bridgeScript,
      [
        "--bridge-port",
        String(bridgePort),
        "--control-port",
        String(controlPort),
        "--agent-url",
        agentUrl,
      ],
      {
        ENVOYMESH_BRIDGE_SMOKE_SECRET: secret,
        ENVOYMESH_BRIDGE_SMOKE_REPLY: "openclaw live smoke reply",
      },
    );

    const bridgeReady = await waitForReadyLine(bridgeChild, "bridge", smokeTimeoutMs);
    log(bridgeReady);

    gatewayChild = spawnChild(
      liveGatewayScript,
      [
        "--openclaw-root",
        openclawRoot,
        "--gateway-port",
        String(gatewayPort),
        "--bridge-port",
        String(bridgePort),
      ],
      {
        ENVOYMESH_BRIDGE_SMOKE_SECRET: secret,
        ENVOYMESH_BRIDGE_SMOKE_OWNER_ID: smokeOwnerId,
        ENVOYMESH_BRIDGE_SMOKE_REPLY: "openclaw live smoke reply",
        ENVOYMESH_OPENCLAW_GATEWAY_START_MS: String(liveGatewayTimeoutMs),
      },
    );

    const gatewayReady = await waitForReadyLine(gatewayChild, "openclaw", liveGatewayTimeoutMs);
    log(gatewayReady);

    await injectChat(controlPort, "live gateway smoke ping");
    log("injected chat.message into bridge (live OpenClaw gateway)");

    const replyLine = await waitForStdoutLine(bridgeChild, "reply-sent", smokeTimeoutMs);
    log(replyLine);
    if (!replyLine.includes("openclaw live smoke reply")) {
      throw new Error(`unexpected live reply line: ${replyLine}`);
    }

    await assertReplySent(controlPort);
    log("PASS — live OpenClaw gateway round-trip complete");
    process.exitCode = 0;
  } finally {
    await killChild(bridgeChild);
    await killChild(gatewayChild);
  }
}

async function main(): Promise<void> {
  try {
    if (isLive) {
      await runLiveSmoke();
    } else {
      await runMockSmoke();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`FAIL — ${message}`);
    process.exitCode = 1;
  }
}

void main();
