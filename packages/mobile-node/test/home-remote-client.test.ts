import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";

import { HomeRemoteClient, terminalPathFromAttachWsUrl } from "../src/home-remote-client.js";

describe("terminalPathFromAttachWsUrl", () => {
  it("extracts path and query from loopback attach URL", () => {
    expect(
      terminalPathFromAttachWsUrl(
        "ws://127.0.0.1:3031/ws/terminal/abc-123?token=secret",
      ),
    ).toBe("/ws/terminal/abc-123?token=secret");
  });
});

describe("HomeRemoteClient RPC", () => {
  it("calls JSON-RPC methods over a mock home WebSocket", async () => {
    const httpServer = createServer();
    const wss = new WebSocketServer({ noServer: true });
    httpServer.on("upgrade", (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.on("message", (raw) => {
          const msg = JSON.parse(String(raw)) as { id?: string; method?: string };
          if (msg.method === "listTerminalSessions") {
            ws.send(JSON.stringify({ id: msg.id, result: [] }));
          }
        });
      });
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    const port = (httpServer.address() as { port: number }).port;
    const wsUrl = `ws://127.0.0.1:${port}/ws?token=test-token`;

    const client = new HomeRemoteClient({
      resolveProxyWsUrl: async () => wsUrl,
    });

    const sessions = await client.call<unknown[]>("listTerminalSessions", {});
    expect(sessions).toEqual([]);

    client.dispose();
    wss.close();
    httpServer.close();
  });
});
