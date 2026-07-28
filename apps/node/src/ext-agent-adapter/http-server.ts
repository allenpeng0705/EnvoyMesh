import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import type { ExtAgentBackend, ExtAgentInboundMessage, ExtAgentSidecarListenConfig } from "./types.js";

const DEDUP_TTL_MS = 30_000;
const DEDUP_MAX = 200;

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export interface ExtAgentHttpServerHandle {
  server: Server;
  port: number;
  kind: string;
  stop(): Promise<void>;
}

/**
 * Listen for EnvoyMesh bridge `POST /message` and reply via `POST bridgeSendUrl`.
 * Accepts immediately (async agent turn) so the bridge does not block 300s.
 */
export function startExtAgentHttpServer(
  backend: ExtAgentBackend,
  listen: ExtAgentSidecarListenConfig,
): Promise<ExtAgentHttpServerHandle> {
  const dedup = new Map<string, number>();
  const inflight = new Set<string>();

  const remember = (key: string): boolean => {
    const now = Date.now();
    for (const [k, at] of dedup) {
      if (now - at > DEDUP_TTL_MS) dedup.delete(k);
    }
    if (dedup.has(key)) {
      dedup.set(key, now);
      return true;
    }
    dedup.set(key, now);
    while (dedup.size > DEDUP_MAX) {
      const first = dedup.keys().next().value;
      if (first === undefined) break;
      dedup.delete(first);
    }
    return false;
  };

  const replyToBridge = async (to: string, text: string): Promise<void> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (listen.bridgeSecret) {
      headers.Authorization = `Bearer ${listen.bridgeSecret}`;
    }
    const res = await fetch(listen.bridgeSendUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ to, text }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`bridge send ${res.status}: ${body.slice(0, 200)}`);
    }
  };

  const handleMessage = async (raw: ExtAgentInboundMessage): Promise<void> => {
    const from = raw.from?.trim() ?? "";
    const text = raw.text?.trim() ?? "";
    const ownerId = raw.fromOwnerId?.trim() ?? "";
    if (!from || !text) {
      console.warn(`[ext-agent:${backend.kind}] skip: missing from/text`);
      return;
    }
    const dedupKey =
      raw.messageId?.trim() ||
      createHash("sha256").update(`${ownerId}:${text}`).digest("hex");
    if (remember(dedupKey)) {
      console.log(`[ext-agent:${backend.kind}] dedup skip ${dedupKey.slice(0, 12)}`);
      return;
    }
    if (inflight.has(dedupKey)) return;
    inflight.add(dedupKey);
    try {
      const reply = await backend.ask(text, ownerId || from);
      await replyToBridge(from, reply);
      console.log(
        `[ext-agent:${backend.kind}] reply sent to ${from.slice(0, 24)}… (${reply.length} chars)`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ext-agent:${backend.kind}] failed:`, msg);
      try {
        await replyToBridge(from, `⚠️ ${backend.kind} adapter error: ${msg}`);
      } catch (sendErr) {
        console.error(
          `[ext-agent:${backend.kind}] bridge unreachable:`,
          sendErr instanceof Error ? sendErr.message : sendErr,
        );
      }
    } finally {
      inflight.delete(dedupKey);
    }
  };

  const server = createServer((req, res) => {
    const url = req.url?.split("?")[0] ?? "/";
    if (req.method === "GET" && (url === "/status" || url === "/")) {
      void (async () => {
        const up = backend.probe ? await backend.probe() : true;
        sendJson(res, 200, {
          status: "OK",
          kind: backend.kind,
          backend: backend.label,
          bridge_url: listen.bridgeSendUrl,
          backend_reachable: up,
        });
      })();
      return;
    }
    if (req.method === "POST" && url === "/message") {
      void (async () => {
        try {
          const body = (await readJson(req)) as ExtAgentInboundMessage;
          const text = body?.text?.trim() ?? "";
          const ownerId = body?.fromOwnerId?.trim() ?? "";
          const from = body?.from?.trim() ?? "";
          if (!text || !ownerId) {
            sendJson(res, 400, { error: "fromOwnerId and text are required" });
            return;
          }
          if (!from) {
            sendJson(res, 400, {
              error: "from (sender peer id) is required for reply routing",
            });
            return;
          }
          void handleMessage(body);
          sendJson(res, 200, { status: "accepted", text: null });
        } catch (err) {
          sendJson(res, 400, {
            error: err instanceof Error ? err.message : "invalid json",
          });
        }
      })();
      return;
    }
    sendJson(res, 404, { error: "not found" });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listen.port, listen.host, () => {
      server.off("error", reject);
      console.log(
        `[ext-agent:${backend.kind}] listening http://${listen.host}:${listen.port}/message → ${listen.bridgeSendUrl} (${backend.label})`,
      );
      resolve({
        server,
        port: listen.port,
        kind: backend.kind,
        stop: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
