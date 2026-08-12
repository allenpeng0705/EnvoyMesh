import { effectiveBridgeListenPort } from "../service-ports.js";
import { createBackend } from "./backends.js";
import { startExtAgentHttpServer, type ExtAgentHttpServerHandle } from "./http-server.js";
import {
  isExtAgentSidecarKind,
  type ExtAgentSidecarKind,
} from "./types.js";

export interface SyncExtAgentSidecarParams {
  /** Bridge HTTP enabled (node-config bridgeEnabled). */
  bridgeEnabled: boolean;
  activeExtAgentId?: string;
  /** Optional override; defaults to env / BRIDGE_HTTP_PORT. */
  bridgeListenPort?: number;
  bridgeSecret?: string;
  /**
   * Restart even when the same kind+port is already running (e.g. projectPath
   * change for Codex / one-shot CLI agents that bake cwd at spawn).
   */
  forceRestart?: boolean;
}

const DEFAULT_PORTS: Record<ExtAgentSidecarKind, number> = {
  // Pi runs an in-process HTTP adapter (createPiBackend) that the bridge
  // forwards to. It binds a real localhost port like the other sidecars.
  pi: 8022,
  hermes: 8020,
  openhuman: 8021,
  // Phase 55D — codex / claudecode. Codex uses the OpenAI Codex CLI's
  // `app-server` JSON-RPC over stdio (55B); claudecode uses the
  // @anthropic-ai/claude-agent-sdk in-process (55C). Both bridge through
  // the same `/message` shape via this sidecar.
  codex: 8023,
  claudecode: 8024,
  // Phase 56A — Cursor CLI (Anysphere) one-shot subprocess per ask via
  // the shared `OneShotCliBackend` base. Phase 56B — Aider. Phase 56C
  // — MiniMax MMX-CLI. All three use the same one-shot pattern.
  // Additive to the 55 ports (no port below 1024).
  cursor: 8025,
  aider: 8026,
  mmx: 8027,
};

/**
 * Per-kind `ENVOYMESH_*_PORT` env-var names. Each entry maps a sidecar
 * kind to the env var that overrides its default listen port (used in
 * tests + multi-instance deployments). Invalid values (non-integer,
 * out-of-range) silently fall back to the default — the same shape
 * `manager.ts` has shipped since the 55 ports landed.
 */
const PORT_ENV_FOR: Record<ExtAgentSidecarKind, string> = {
  hermes: "ENVOYMESH_HERMES_PORT",
  openhuman: "ENVOYMESH_OPENHUMAN_PORT",
  pi: "ENVOYMESH_PI_EXT_PORT",
  codex: "ENVOYMESH_CODEX_PORT",
  claudecode: "ENVOYMESH_CLAUDECODE_PORT",
  cursor: "ENVOYMESH_CURSOR_PORT",
  aider: "ENVOYMESH_AIDER_PORT",
  mmx: "ENVOYMESH_MMX_PORT",
};

let running: ExtAgentHttpServerHandle | null = null;
let syncChain: Promise<void> = Promise.resolve();

function listenPortFor(kind: ExtAgentSidecarKind): number {
  const env = process.env[PORT_ENV_FOR[kind]]?.trim();
  if (env) {
    const n = Number.parseInt(env, 10);
    if (Number.isFinite(n) && n >= 1024 && n <= 65535) return n;
  }
  return DEFAULT_PORTS[kind];
}

function bridgeSendUrl(port: number): string {
  return `http://127.0.0.1:${port}/bridge/send`;
}

async function stopRunning(): Promise<void> {
  if (!running) return;
  const prev = running;
  running = null;
  try {
    await prev.stop();
    console.log(`[ext-agent] stopped ${prev.kind} sidecar`);
  } catch (err) {
    console.warn(
      `[ext-agent] stop ${prev.kind} failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Start or stop the local Hermes/OpenHuman `/message` sidecar to match
 * the selected Ext Agent. HomeClaw needs no sidecar (channel lives in HomeClaw).
 */
export async function syncExtAgentSidecar(params: SyncExtAgentSidecarParams): Promise<void> {
  const run = async (): Promise<void> => {
    const want =
      params.bridgeEnabled && isExtAgentSidecarKind(params.activeExtAgentId)
        ? params.activeExtAgentId
        : null;

    if (!want) {
      await stopRunning();
      return;
    }

    const port = listenPortFor(want);
    if (
      !params.forceRestart &&
      running?.kind === want &&
      running.port === port
    ) {
      return;
    }

    await stopRunning();
    const bridgePort = effectiveBridgeListenPort(params.bridgeListenPort);
    try {
      running = await startExtAgentHttpServer(createBackend(want), {
        host: "127.0.0.1",
        port,
        bridgeSendUrl: bridgeSendUrl(bridgePort),
        bridgeSecret: params.bridgeSecret,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ext-agent] failed to start ${want} on :${port}:`, msg);
      if (msg.includes("EADDRINUSE")) {
        console.error(
          `[ext-agent] port ${port} is held by another process (often a previous EnvoyMesh node). ` +
            `Quit all EnvoyMesh windows, then: lsof -nP -iTCP:${port} -sTCP:LISTEN`,
        );
      }
      running = null;
    }
  };

  syncChain = syncChain.then(run, run);
  await syncChain;
}

export async function stopExtAgentSidecar(): Promise<void> {
  await syncExtAgentSidecar({ bridgeEnabled: false });
}

export function getRunningExtAgentSidecar(): { kind: string; port: number } | null {
  return running ? { kind: running.kind, port: running.port } : null;
}

/** @internal tests */
export function _resetExtAgentSidecarForTests(): void {
  running = null;
  syncChain = Promise.resolve();
}
