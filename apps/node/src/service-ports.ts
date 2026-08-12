/** Social UI JSON-RPC + events (Phase 19). */
export const SOCIAL_WS_PORT_BASE = 3030;
/** Bind all IPv4 interfaces so 127.0.0.1 and LAN clients can connect (see terminal-ws-server). */
export const SOCIAL_WS_BIND_HOST = "0.0.0.0";

/** External agent HTTP bridge (`POST /bridge/send`). Phase 9K — established before terminals. */
export const BRIDGE_HTTP_PORT_BASE = 3031;

/** Terminal PTY attach WebSocket (Phase 30). Must not share BRIDGE_HTTP_PORT. */
export const TERMINAL_WS_PORT_BASE = 3032;

/** Built-in OpenClaw gateway webhook port. */
export const OPENCLAW_GATEWAY_PORT_BASE = 18789;

/**
 * Envoy Local (llama-server) OpenAI-compatible HTTP port (Phase 54).
 * Distinct from Ollama's conventional 11434 so BYO Ollama and Envoy Local can coexist.
 */
export const ENVOY_LOCAL_PORT_BASE = 18790;

function parseNonNegativeInt(raw: string | undefined): number {
  if (!raw?.trim()) return 0;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n >= 1024 && n <= 65535 ? n : fallback;
}

/** Shift all default ports together (e.g. 100 → ws 3130, bridge 3131, …). */
function portOffset(): number {
  return parseNonNegativeInt(process.env.ENVOYMESH_PORT_OFFSET);
}

const offset = portOffset();

/** Effective Social WebSocket port for this process. Env: `ENVOYMESH_SOCIAL_WS_PORT`, or base + `ENVOYMESH_PORT_OFFSET`. */
export const SOCIAL_WS_PORT = parsePort(
  process.env.ENVOYMESH_SOCIAL_WS_PORT,
  SOCIAL_WS_PORT_BASE + offset,
);

/** Effective bridge HTTP port. Env: `ENVOYMESH_BRIDGE_PORT`, or base + offset. */
export const BRIDGE_HTTP_PORT = parsePort(
  process.env.ENVOYMESH_BRIDGE_PORT,
  BRIDGE_HTTP_PORT_BASE + offset,
);

/** Effective terminal WebSocket port. Env: `ENVOYMESH_TERMINAL_WS_PORT`, or base + offset. */
export const TERMINAL_WS_PORT = parsePort(
  process.env.ENVOYMESH_TERMINAL_WS_PORT,
  TERMINAL_WS_PORT_BASE + offset,
);

/** Effective OpenClaw gateway port. Env: `ENVOYMESH_GATEWAY_PORT` or `OPENCLAW_PORT`, or base + offset. */
export const OPENCLAW_GATEWAY_PORT = parsePort(
  process.env.ENVOYMESH_GATEWAY_PORT ?? process.env.OPENCLAW_PORT,
  OPENCLAW_GATEWAY_PORT_BASE + offset,
);

/** Effective Envoy Local llama-server port. Env: `ENVOYMESH_ENVOY_LOCAL_PORT`, or base + offset. */
export const ENVOY_LOCAL_PORT = parsePort(
  process.env.ENVOYMESH_ENVOY_LOCAL_PORT,
  ENVOY_LOCAL_PORT_BASE + offset,
);

export function openClawGatewayWebhookUrl(port: number = OPENCLAW_GATEWAY_PORT): string {
  return `http://127.0.0.1:${port}/webhook/envoymesh`;
}

export function envoyLocalOpenAiBaseUrl(port: number = ENVOY_LOCAL_PORT): string {
  return `http://127.0.0.1:${port}/v1`;
}

export function socialWsLoopbackUrl(port: number = SOCIAL_WS_PORT): string {
  return `ws://127.0.0.1:${port}/ws`;
}

/** True when any dev port env override is active (offset or explicit port). */
export function devServicePortsConfigured(): boolean {
  return (
    offset > 0 ||
    Boolean(process.env.ENVOYMESH_SOCIAL_WS_PORT?.trim()) ||
    Boolean(process.env.ENVOYMESH_BRIDGE_PORT?.trim()) ||
    Boolean(process.env.ENVOYMESH_TERMINAL_WS_PORT?.trim()) ||
    Boolean(process.env.ENVOYMESH_GATEWAY_PORT?.trim()) ||
    Boolean(process.env.OPENCLAW_PORT?.trim())
  );
}

/**
 * Port the bridge HTTP server actually listens on for this process.
 *
 * When `ENVOYMESH_BRIDGE_PORT` / `ENVOYMESH_PORT_OFFSET` is set (e.g.
 * `npm run node:dev:4030` → bridge :4031), that wins over a stale
 * `listenPort: 3031` in `bridge-config.json`. Ext Agent sidecars must
 * POST replies here — otherwise Codex finishes the turn but the reply
 * is sent to a dead :3031 and the chat stays silent.
 */
export function effectiveBridgeListenPort(configured?: number): number {
  const envRaw = process.env.ENVOYMESH_BRIDGE_PORT?.trim();
  if (envRaw) {
    const n = Number.parseInt(envRaw, 10);
    if (Number.isFinite(n) && n >= 1024 && n <= 65535) return n;
  }
  if (process.env.ENVOYMESH_PORT_OFFSET?.trim()) {
    return BRIDGE_HTTP_PORT;
  }
  if (
    typeof configured === "number" &&
    Number.isFinite(configured) &&
    configured >= 1024 &&
    configured <= 65535
  ) {
    return configured;
  }
  return BRIDGE_HTTP_PORT;
}
