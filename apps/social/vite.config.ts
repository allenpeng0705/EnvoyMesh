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
      // Always register: Social splash can heal a stale localStorage wsUrl (4030 vs 3030).
      server.middlewares.use("/__envoymesh/discover-node", (req, res, next) => {
        if (req.method !== "GET") {
          next();
          return;
        }
        void (async () => {
          try {
            const url = new URL(req.url ?? "/", "http://127.0.0.1");
            const preferRaw = url.searchParams.get("prefer");
            const preferPort = preferRaw ? Number(preferRaw) : NaN;
            const candidates: number[] = [];
            const push = (p: number) => {
              if (Number.isFinite(p) && p > 0 && !candidates.includes(p)) candidates.push(p);
            };
            if (Number.isFinite(preferPort)) push(preferPort);
            push(3030);
            push(4030);

            const openPorts: number[] = [];
            for (const port of candidates) {
              if (await isLoopbackPortOpen(port)) openPorts.push(port);
            }
            const preferredOpen =
              Number.isFinite(preferPort) && openPorts.includes(preferPort);
            const port = preferredOpen ? preferPort : (openPorts[0] ?? null);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                ok: port != null,
                wsUrl: port != null ? `ws://127.0.0.1:${port}/ws` : null,
                port,
                preferredPort: Number.isFinite(preferPort) ? preferPort : null,
                preferredOpen,
                openPorts,
                candidates,
              }),
            );
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        })();
      });

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

/**
 * Keep `@capacitor/geolocation` external in BOTH dev and build.
 *
 * This package only resolves inside the Capacitor native shell (it's a
 * dependency of apps/mobile, not apps/social). The web/Tauri Social app
 * reaches it via a runtime-guarded dynamic `import("@capacitor/geolocation")`
 * in src/lib/geolocation-adapter.ts — guarded by
 * `window.Capacitor.isNativePlatform()` so it's never actually evaluated on
 * web/Tauri.
 *
 * Vite's production build respects `build.rollupOptions.external`, but the dev
 * server's `vite:import-analysis` plugin resolves the specifier eagerly and
 * throws "Failed to resolve import" — even with the vite-ignore pragma inside
 * the dynamic import. The reliable workaround (per vitejs/vite#6582, #22416)
 * is to mark the dep external in `resolveId` (so dev emits the bare specifier
 * as-is) AND add it to `optimizeDeps.exclude` (so esbuild's pre-bundler skips
 * it too).
 */
function externalizeCapacitorGeolocation(): Plugin {
  const EXTERNAL_ID = "@capacitor/geolocation";
  return {
    name: "envoymesh-externalize-capacitor-geolocation",
    enforce: "pre",
    resolveId(source) {
      if (source === EXTERNAL_ID) {
        return { id: EXTERNAL_ID, external: true };
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    nodeDevSidecarPlugin(),
    react(),
    wasm(),
    topLevelAwait(),
    externalizeCapacitorGeolocation(),
  ],
  root: "src",
  /** loro-crdt WASM bundler uses top-level-await (Phase 15E contact notes). */
  build: {
    target: "esnext",
    rollupOptions: {
      // Mirrors the dev-server externalization above for production parity.
      external: ["@capacitor/geolocation"],
    },
  },
  optimizeDeps: {
    // Prevent esbuild's pre-bundler from trying to process a package that
    // isn't installed in apps/social. Without this the resolveId override
    // gets bypassed.
    exclude: ["@capacitor/geolocation"],
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
      // Browser-safe crypto — `@envoymesh/identity` uses node:crypto and breaks Vite.
      // Same alias as apps/mobile (pure-JS Ed25519 via @noble/curves).
      "@envoymesh/identity": resolve(repoRoot, "packages/mobile-identity/src/index.ts"),
      // Browser-safe subpath — does NOT pull in node:crypto / node:fs.
      // The full `@envoymesh/rag` root depends on Node builtins and is
      // intentionally not aliased here; the Social UI must import this
      // resolver subpath instead.
      "@envoymesh/rag/embedding-resolver": resolve(repoRoot, "packages/rag/src/embedding-resolver.ts"),
      "@envoymesh/rag": resolve(repoRoot, "packages/rag/src/index.ts"),
    },
  },
});
