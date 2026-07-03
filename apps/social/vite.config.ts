import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";

import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

/** Monorepo packages ship `exports` → `dist/`, which does not exist until `tsc -b`. Dev resolves source like Vitest. */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function isLoopbackPortOpen(port: number): Promise<boolean> {
  return new Promise((resolvePort) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolvePort(true);
    });
    socket.once("error", () => resolvePort(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolvePort(false);
    });
  });
}

async function waitForLoopbackPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isLoopbackPortOpen(port)) {
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for 127.0.0.1:${port}`);
}

/** Kill a spawned dev sidecar and any child processes (npm → tsc/tsx). */
function killProcessTree(proc: ChildProcess | undefined): void {
  if (!proc || proc.killed) {
    return;
  }
  const pid = proc.pid;
  if (!pid) {
    return;
  }
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        proc.kill("SIGTERM");
      } catch {
        /* already dead */
      }
    }
  }
}

/** Optionally spawn the home node with Social dev (off by default — run `npm run node:dev` separately when debugging). */
function nodeDevSidecarPlugin(): Plugin {
  let proc: ChildProcess | undefined;
  let stopHooksInstalled = false;

  function stopSidecar(reason: string): void {
    if (!proc) {
      return;
    }
    console.log(`[vite] Stopping home node sidecar (${reason})…`);
    killProcessTree(proc);
    proc = undefined;
  }

  function installStopHooks(): void {
    if (stopHooksInstalled) {
      return;
    }
    stopHooksInstalled = true;
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
      process.on(signal, () => stopSidecar(signal));
    }
  }

  return {
    name: "envoymesh-node-dev-sidecar",
    apply: "serve",
    configureServer(server) {
      if (process.env.ENVOYMESH_AUTO_NODE !== "1") {
        return;
      }

      server.httpServer?.once("close", () => stopSidecar("httpServer close"));
      installStopHooks();

      return async () => {
        if (await isLoopbackPortOpen(3030)) {
          console.log("[vite] Home node already listening on ws://127.0.0.1:3030/ws — skipping sidecar spawn");
          return;
        }
        console.log("[vite] Starting home node (WebSocket :3030)…");
        proc = spawn("npm", ["run", "node:dev"], {
          cwd: repoRoot,
          stdio: "inherit",
          detached: process.platform !== "win32",
          env: {
            ...process.env,
            ENVOYMESH_PROFILE: process.env.ENVOYMESH_PROFILE ?? resolve(repoRoot, "data/default"),
          },
        });
        proc.on("error", (err) => {
          console.error("[vite] Home node sidecar failed to start:", err);
        });
        proc.on("exit", (code, signal) => {
          if (proc?.pid === undefined) {
            return;
          }
          if (code !== 0 && code !== null) {
            console.warn(`[vite] Home node sidecar exited (code=${code}, signal=${signal ?? "none"})`);
          }
          proc = undefined;
        });
        try {
          await waitForLoopbackPort(3030, 120_000);
          console.log("[vite] Home node ready on ws://127.0.0.1:3030/ws");
        } catch (err) {
          console.error("[vite] Home node did not become ready:", err);
        }
      };
    },
  };
}

export default defineConfig({
  plugins: [nodeDevSidecarPlugin(), react(), wasm(), topLevelAwait()],
  root: "src",
  /** loro-crdt WASM bundler uses top-level-await (Phase 15E contact notes). */
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      "@envoymesh/api/did-import": resolve(repoRoot, "packages/api/src/did-import.ts"),
      "@envoymesh/api/discovery-privacy": resolve(repoRoot, "packages/api/src/discovery-privacy.ts"),
      "@envoymesh/api/discovery-referral-attestation": resolve(
        repoRoot,
        "packages/api/src/discovery-referral-attestation.ts",
      ),
      "@envoymesh/api/chat-delivered": resolve(repoRoot, "packages/api/src/chat-delivered.ts"),
      "@envoymesh/api/group-chat-delivery": resolve(repoRoot, "packages/api/src/group-chat-delivery.ts"),
      "@envoymesh/api/chat-room-thread": resolve(repoRoot, "packages/api/src/chat-room-thread.ts"),
      "@envoymesh/api/chat-room-service": resolve(repoRoot, "packages/api/src/chat-room-service.ts"),
      "@envoymesh/api": resolve(repoRoot, "packages/api/src/index.ts"),
      "@envoymesh/protocol": resolve(repoRoot, "packages/protocol/src/index.ts"),
    },
  },
});
