/**
 * Minimal OpenClaw-compatible webhook (POST /webhook/envoymesh).
 * Used by smoke tests and the gateway child process — not a full OpenClaw Gateway.
 */
import { createServer, type Server } from "node:http";
import { getFreePort } from "./ports.js";

export type MockOpenClawInbound = {
  from: string;
  fromOwnerId: string;
  fromName: string;
  text: string;
};

export type MockOpenClawGateway = {
  port: number;
  url: string;
  secret: string;
  webhookPath: string;
  close: () => Promise<void>;
  getLastInbound: () => MockOpenClawInbound | null;
  getInboundCount: () => number;
};

export async function startMockOpenClawGateway(params: {
  port?: number;
  bridgeSendUrl: string;
  bridgeSecret?: string;
  webhookPath?: string;
  replyText?: string;
}): Promise<MockOpenClawGateway> {
  const secret = params.bridgeSecret ?? "";
  const webhookPath = params.webhookPath ?? "/webhook/envoymesh";
  const replyText = params.replyText ?? "smoke reply from mock gateway";
  let lastInbound: MockOpenClawInbound | null = null;
  let inboundCount = 0;

  const server: Server = createServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    if (req.method !== "POST" || path !== webhookPath) {
      res.writeHead(404).end();
      return;
    }
    if (secret) {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${secret}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    if (body.type === "mesh.async_reply") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    const msg: MockOpenClawInbound = {
      from: String(body.from ?? "").trim(),
      fromOwnerId: String(body.fromOwnerId ?? "").trim(),
      fromName: String(body.fromName ?? body.fromOwnerId ?? "").trim(),
      text: String(body.text ?? "").trim(),
    };
    if (!msg.fromOwnerId || !msg.text) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "fromOwnerId and text are required" }));
      return;
    }
    lastInbound = msg;
    inboundCount += 1;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) {
      headers.Authorization = `Bearer ${secret}`;
    }
    const bridgeRes = await fetch(params.bridgeSendUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ to: msg.from, text: replyText }),
    });
    if (!bridgeRes.ok) {
      const errText = await bridgeRes.text().catch(() => "");
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `bridge send failed: ${bridgeRes.status} ${errText}` }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  });

  const port = params.port ?? (await getFreePort());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    port,
    url: `http://127.0.0.1:${port}${webhookPath}`,
    secret,
    webhookPath,
    getLastInbound: () => lastInbound,
    getInboundCount: () => inboundCount,
    close: () =>
      new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
