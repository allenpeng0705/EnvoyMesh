import { createServer } from "node:net";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  decodeTerminalFrame,
  encodeTerminalFrame,
  TerminalWireType,
} from "@envoymesh/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

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
import { enrichTerminalSessionSummaries } from "../src/terminal-activity.js";

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

describe("terminal integration (mock PTY ↔ wire codec ↔ WS attach)", () => {
  let profileDir: string;
  let manager: TerminalManager;
  let wsServer: TerminalWsServer | null = null;
  let sessionId: string;
  let attachUrl: string;
  let testPort: number;

  beforeEach(async () => {
    onDataHandlers.length = 0;
    mockPty.write.mockClear();
    mockPty.resize.mockClear();
    testPort = await pickFreePort();
    profileDir = await mkdtemp(join(tmpdir(), "envoy-term-ws-"));
    manager = new TerminalManager({ profileDir });
    await manager.waitUntilReady();
    manager.setTerminalWsListenAddress(testPort, "/ws/terminal");
    wsServer = new TerminalWsServer({ port: testPort, pathPrefix: "/ws/terminal", manager });
    wsServer.start();
    await new Promise((r) => setTimeout(r, 100));

    const created = await manager.createTerminalSession({ title: "Integration" });
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

  it("accepts loopback attach websocket with valid token", async () => {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(attachUrl);
      const timer = setTimeout(() => reject(new Error(`ws timeout: ${attachUrl}`)), 5000);
      ws.once("open", () => {
        clearTimeout(timer);
        ws.close();
        resolve();
      });
      ws.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  });

  it("desktop E2E: create session, type command, output lands in scrollback", async () => {
    manager.writeStdin(sessionId, Buffer.from("pwd\n", "utf8"));
    expect(mockPty.write).toHaveBeenCalledWith("pwd\n");
    emitPtyOutput("/Users/test\n");
    const scrollback = manager.getScrollback(sessionId).toString("utf8");
    expect(scrollback).toContain("/Users/test");
  });

  it("wire stdin frame decodes to PTY write (headless xterm transport)", () => {
    const frame = encodeTerminalFrame(TerminalWireType.Stdin, new TextEncoder().encode("echo hi\n"));
    const decoded = decodeTerminalFrame(frame);
    expect(decoded?.type).toBe(TerminalWireType.Stdin);
    manager.writeStdin(sessionId, Buffer.from(decoded!.payload));
    expect(mockPty.write).toHaveBeenCalledWith("echo hi\n");
  });

  it("PTY output encodes to stdout wire frames for clients", () => {
    const chunks: Buffer[] = [];
    const unsub = manager.subscribeOutput(sessionId, (data) => chunks.push(data));
    emitPtyOutput("hello from shell\n");
    unsub();
    expect(chunks.length).toBeGreaterThan(0);
    const wire = encodeTerminalFrame(TerminalWireType.Stdout, new Uint8Array(chunks[0]!));
    const decoded = decodeTerminalFrame(wire);
    expect(new TextDecoder().decode(decoded!.payload)).toContain("hello from shell");
  });

  it("E2E: PTY scrollback feeds activity badge enrichment", () => {
    emitPtyOutput("running openclaw gateway\n");
    const enriched = enrichTerminalSessionSummaries(
      manager.listTerminalSessions(),
      (id) => manager.getScrollbackTail(id),
      { pendingApprovalCount: 0, openClawTurnInProgress: false, nowMs: Date.now() },
    );
    const row = enriched.find((s) => s.sessionId === sessionId);
    expect(row?.activityBadge).toBe("working");
    expect(row?.foregroundHint).toBe("openclaw");
  });
});
