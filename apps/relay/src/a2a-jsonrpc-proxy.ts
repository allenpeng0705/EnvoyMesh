/**
 * Phase 48D — A2A JSON-RPC Relay Proxy.
 *
 * Public-facing surface for external A2A clients. Validates bearer
 * tokens, then forwards the JSON-RPC body to the home node over the
 * existing home-tunnel WebSocket (`homeclawCoreProxy` machinery) or
 * libp2p stream. The home node executes the request via
 * `apps/node/src/a2a-task-bridge.ts` and the relay writes the
 * response back to the A2A client verbatim.
 *
 * The relay stays lean: it does NOT parse JSON-RPC, run LLMs, or
 * inspect payloads. It only:
 *   1. Reads the POST body (≤ 1 MiB cap)
 *   2. Validates `Authorization: Bearer <token>`
 *   3. Resolves the bearer token → ownerId → home node peerId
 *   4. Forwards the body over libp2p tunnel
 *   5. Writes the response (or a wrapped JSON-RPC error) back
 *
 * `forwardToHome` is dependency-injected so the proxy is unit-testable
 * without a real libp2p network.
 *
 * Design: docs/a2a-mcp-interop-design.md §6.4.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface A2ABearerTokenEntry {
  token: string;
  ownerId: string;
  label?: string;
}

export interface A2AProxyOptions {
  /** Bearer tokens → ownerId mappings. */
  bearerTokens: A2ABearerTokenEntry[];
  /**
   * Resolve the home node's libp2p peerId for a given ownerId.
   * Returns null when no home node is registered for that owner.
   */
  lookupHomePeerId: (ownerId: string) => string | null;
  /**
   * Forward a JSON-RPC body to the home node and return its raw
   * response body. Implementations handle the transport (libp2p
   * tunnel, libp2p dial, etc.). Returning `null` signals
   * upstream timeout; throwing signals transport failure.
   */
  forwardToHome: (homePeerId: string, body: string) => Promise<string | null>;
  /** Maximum POST body size in bytes (default 1 MiB). */
  maxBodyBytes?: number;
  /** Upstream timeout in ms (default 60_000). */
  timeoutMs?: number;
  /**
   * Optional callback invoked once per request — useful for audit
   * and metrics. Outcome is one of "ok", "auth-failed", "no-home",
   * "upstream-timeout", "upstream-error", "body-too-large",
   * "method-not-allowed".
   */
  observe?: (event: { outcome: ProxyOutcome; ownerId?: string; method?: string; durationMs?: number }) => void;
}

export type ProxyOutcome =
  | "ok"
  | "auth-failed"
  | "no-home"
  | "upstream-timeout"
  | "upstream-error"
  | "body-too-large"
  | "method-not-allowed";

// ---------------------------------------------------------------------------
// Proxy entry point
// ---------------------------------------------------------------------------

const DEFAULT_MAX_BODY = 1 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Dispatch one inbound HTTP request to the A2A bridge. Reads body,
 * validates bearer, looks up home, forwards, writes response.
 */
export async function handleA2AJsonRpcProxy(
  req: IncomingMessage,
  res: ServerResponse,
  options: A2AProxyOptions,
): Promise<void> {
  const start = Date.now();
  const maxBody = options.maxBodyBytes ?? DEFAULT_MAX_BODY;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (req.method !== "POST") {
    options.observe?.({ outcome: "method-not-allowed" });
    res.writeHead(405, { Allow: "POST", "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "method not allowed" }));
    return;
  }

  // ---- 1. Read body ----
  let body: string;
  try {
    body = await readBodyCapped(req, maxBody);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "body read failed";
    if (msg.includes("body too large")) {
      options.observe?.({ outcome: "body-too-large", durationMs: Date.now() - start });
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "payload too large" }));
      return;
    }
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: msg }));
    return;
  }

  // ---- 2. Bearer auth ----
  const authHeader = req.headers["authorization"];
  const authStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const tokenEntry = resolveBearer(authStr, options.bearerTokens);
  if (!tokenEntry) {
    options.observe?.({ outcome: "auth-failed", durationMs: Date.now() - start });
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: "auth-required: missing or invalid bearer token" },
    }));
    return;
  }

  // ---- 3. Look up home node ----
  const homePeerId = options.lookupHomePeerId(tokenEntry.ownerId);
  if (!homePeerId) {
    options.observe?.({ outcome: "no-home", ownerId: tokenEntry.ownerId, durationMs: Date.now() - start });
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32003, message: "no home node registered for ownerId" },
    }));
    return;
  }

  // ---- 4. Forward with timeout ----
  let responseBody: string | null;
  try {
    responseBody = await withTimeout(options.forwardToHome(homePeerId, body), timeoutMs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    options.observe?.({
      outcome: msg.includes("timed out") ? "upstream-timeout" : "upstream-error",
      ownerId: tokenEntry.ownerId,
      durationMs: Date.now() - start,
    });
    const status = msg.includes("timed out") ? 504 : 502;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: msg.includes("timed out") ? -32003 : -32603,
        message: msg,
      },
    }));
    return;
  }

  if (responseBody === null) {
    options.observe?.({ outcome: "upstream-timeout", ownerId: tokenEntry.ownerId, durationMs: Date.now() - start });
    res.writeHead(504, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32003, message: "upstream timeout" },
    }));
    return;
  }

  // ---- 5. Write response ----
  // Forward the response body verbatim — the home node already shaped
  // a valid JSON-RPC envelope (200, 4xx-aware via error.code). We add
  // CORS + no-store so A2A clients polling see fresh state.
  options.observe?.({ outcome: "ok", ownerId: tokenEntry.ownerId, durationMs: Date.now() - start });
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(responseBody);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveBearer(
  authHeader: string | undefined,
  tokens: A2ABearerTokenEntry[],
): A2ABearerTokenEntry | null {
  if (!authHeader) return null;
  const trimmed = authHeader.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice("bearer ".length).trim();
  if (!token) return null;
  return tokens.find((t) => t.token === token) ?? null;
}

async function readBodyCapped(req: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  return await new Promise<string>((resolve, reject) => {
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`body too large: ${total} > ${maxBytes}`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}