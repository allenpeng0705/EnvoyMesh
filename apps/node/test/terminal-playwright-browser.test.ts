/**
 * Playwright browser E2E: real Chromium WebSocket client ↔ TerminalWsServer ↔ mock PTY.
 *
 * Requires: npx playwright install chromium
 * Skips gracefully when the browser binary is not installed.
 */
import { createServer } from "node:net";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const onDataHandlers: Array<(data: string) => void> = [];

const mockPty = {
  cols: 80,
  rows: 24,
  onData: vi.fn((cb: (data: string) => void) => {
    onDataHandlers.push(cb);
    return { dispose: vi.fn() };
  }),
  onExit: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
};

vi.mock("node-pty", () => ({
  spawn: vi.fn(() => mockPty),
}));

import { TerminalManager } from "../src/terminal-manager.js";
import { TerminalWsServer } from "../src/terminal-ws-server.js";

async function pickFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

function emitPtyOutput(text: string): void {
  for (const handler of onDataHandlers) {
    handler(text);
  }
}

describe("Playwright browser terminal WebSocket E2E", () => {
  let profileDir: string;
  let manager: TerminalManager;
  let wsServer: TerminalWsServer | null = null;
  let attachUrl = "";
  let sessionId = "";

  beforeEach(async () => {
    onDataHandlers.length = 0;
    mockPty.write.mockClear();
    profileDir = await mkdtemp(join(tmpdir(), "envoy-term-pw-"));
    const port = await pickFreePort();
    manager = new TerminalManager({ profileDir });
    await manager.waitUntilReady();
    manager.setTerminalWsListenAddress(port, "/ws/terminal");
    wsServer = new TerminalWsServer({ port, pathPrefix: "/ws/terminal", manager });
    wsServer.start();
    await new Promise((r) => setTimeout(r, 100));

    const created = await manager.createTerminalSession({ title: "Playwright" });
    sessionId = created.sessionId;
    const attach = manager.terminalAttach({ sessionId, cols: 80, rows: 24 });
    attachUrl = attach.wsUrl;
  });

  afterEach(async () => {
    wsServer?.stop();
    wsServer = null;
    if (sessionId) {
      await manager.closeTerminalSession({ sessionId });
    }
  });

  it("Chromium receives PTY stdout after sending stdin wire frame", async (ctx) => {
    let chromium: typeof import("playwright").chromium;
    try {
      chromium = (await import("playwright")).chromium;
    } catch {
      ctx.skip(true, "playwright package not installed");
      return;
    }

    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      ctx.skip(true, "Chromium not installed — run: npx playwright install chromium");
      return;
    }

    try {
      const page = await browser.newPage();
      await page.goto("about:blank");

      await page.evaluate((url) => {
        (window as unknown as { __termOut: string[] }).__termOut = [];
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        ws.onopen = () => {
          const payload = new TextEncoder().encode("echo browser-e2e\n");
          const frame = new Uint8Array(2 + payload.length);
          frame[0] = 1;
          frame[1] = 0;
          frame.set(payload, 2);
          ws.send(frame);
        };
        ws.onmessage = (event) => {
          const buf = new Uint8Array(event.data as ArrayBuffer);
          if (buf[1] === 1) {
            (window as unknown as { __termOut: string[] }).__termOut.push(
              new TextDecoder().decode(buf.slice(2)),
            );
          }
        };
        (window as unknown as { __termWs: WebSocket }).__termWs = ws;
      }, attachUrl);

      await page.waitForFunction(() => (window as unknown as { __termWs?: WebSocket }).__termWs?.readyState === 1, {
        timeout: 5000,
      });

      expect(mockPty.write).toHaveBeenCalledWith("echo browser-e2e\n");
      emitPtyOutput("browser-e2e ok\n");

      await page.waitForFunction(
        () =>
          (window as unknown as { __termOut?: string[] }).__termOut?.some((line) =>
            line.includes("browser-e2e ok"),
          ) === true,
        { timeout: 5000 },
      );

      const lines = await page.evaluate(
        () => (window as unknown as { __termOut: string[] }).__termOut.join(""),
      );
      expect(lines).toContain("browser-e2e ok");
    } finally {
      await browser.close();
    }
  });
});
