/**
 * Spawn a real `apps/relay` process (tsx entry) for Phase 46 process E2E.
 * Exercises CLI args, HTTP /info + /version, and on-disk control identity.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

export type SpawnedStandaloneRelay = {
  label: string;
  peerId: string;
  /** Prefer loopback TCP base with /p2p/ peer id. */
  addr: string;
  httpPort: number;
  listenPort: number;
  profileDir: string;
  child: ChildProcess;
  stop: () => Promise<void>;
};

async function tryBindPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

/** Prefer ports &lt; 32768 so dial-hint snapshot filters do not drop listen addrs. */
export async function allocatePort(): Promise<number> {
  for (let i = 0; i < 48; i++) {
    const port = 19_000 + Math.floor(Math.random() * 2_000);
    if (await tryBindPort(port)) return port;
  }
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        reject(new Error("failed to allocate port"));
        return;
      }
      const port = addr.port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

function relayAdminAuthHeader(): string {
  const user = process.env.ENVOYMESH_RELAY_ADMIN_USER?.trim() || "admin";
  const password = process.env.ENVOYMESH_RELAY_ADMIN_PASSWORD || "envoymesh123456";
  return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: relayAdminAuthHeader() },
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function waitForInfo(
  httpPort: number,
  timeoutMs: number,
): Promise<{ peerId: string; addrs: string[] }> {
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const body = (await fetchJson(`http://127.0.0.1:${httpPort}/info`)) as {
        peerId?: string;
        addrs?: string[];
      };
      if (body.peerId && Array.isArray(body.addrs) && body.addrs.length > 0) {
        return { peerId: body.peerId, addrs: body.addrs };
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `timeout waiting for relay /info on :${httpPort}: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

function pickLoopbackAddr(peerId: string, addrs: string[]): string {
  const withPeer = addrs.map((a) => (a.includes("/p2p/") ? a : `${a}/p2p/${peerId}`));
  const loop = withPeer.find(
    (a) => a.includes("/ip4/127.0.0.1/") && a.includes("/tcp/") && !a.includes("/p2p-circuit/"),
  );
  if (loop) return loop;
  const any = withPeer.find((a) => a.includes("/tcp/") && !a.includes("/p2p-circuit/"));
  if (!any) throw new Error(`no dialable relay addr for ${peerId}: ${addrs.join(", ")}`);
  return any;
}

export async function spawnStandaloneRelay(opts: {
  label: string;
  profileDir: string;
  bootstrapPeers?: string[];
  readyTimeoutMs?: number;
}): Promise<SpawnedStandaloneRelay> {
  const listenPort = await allocatePort();
  const httpPort = await allocatePort();
  const tsx = join(WORKSPACE_ROOT, "node_modules", ".bin", "tsx");
  const entry = join(WORKSPACE_ROOT, "apps", "relay", "src", "index.ts");
  const args = [
    entry,
    "--profile",
    opts.profileDir,
    "--listen",
    `/ip4/127.0.0.1/tcp/${listenPort}`,
    "--http-port",
    String(httpPort),
    "--no-dht",
    // Public-mode reservation limits (community presets). Private/libp2p
    // embedded defaults often leave local clients stuck in PENDING reserve.
    "--relay-public-mode",
  ];
  for (const peer of opts.bootstrapPeers ?? []) {
    args.push("--bootstrap", peer);
  }

  const child = spawn(tsx, args, {
    cwd: WORKSPACE_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  const logs: string[] = [];
  const onChunk = (buf: Buffer) => {
    const s = buf.toString("utf8");
    logs.push(s);
    if (logs.join("").length > 64_000) logs.splice(0, Math.floor(logs.length / 2));
  };
  child.stdout?.on("data", onChunk);
  child.stderr?.on("data", onChunk);

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
        resolve();
      }, 5_000);
      child.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  };

  child.once("exit", (code, signal) => {
    if (!stopped && code !== 0 && code !== null) {
      console.warn(
        `[spawn-relay:${opts.label}] exited early code=${code} signal=${signal}\n${logs.join("")}`,
      );
    }
  });

  try {
    const info = await waitForInfo(httpPort, opts.readyTimeoutMs ?? 45_000);
    const addr = pickLoopbackAddr(info.peerId, info.addrs);
    await access(join(opts.profileDir, "relay-control-ed25519.json"));
    // Smoke HTTP control surfaces used by operators.
    await fetchJson(`http://127.0.0.1:${httpPort}/version`);
    await fetchJson(`http://127.0.0.1:${httpPort}/health`);
    return {
      label: opts.label,
      peerId: info.peerId,
      addr,
      httpPort,
      listenPort,
      profileDir: opts.profileDir,
      child,
      stop,
    };
  } catch (err) {
    await stop();
    throw new Error(
      `spawnStandaloneRelay(${opts.label}) failed: ${
        err instanceof Error ? err.message : String(err)
      }\n--- relay log ---\n${logs.join("")}`,
    );
  }
}
