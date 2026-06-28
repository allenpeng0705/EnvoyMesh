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

import { TerminalManager } from "../src/terminal-manager.js";
import { TerminalWsServer } from "../src/terminal-ws-server.js";
import {
  closeHomeTerminalWsForCompanion,
  rpcHomeTerminalWsClose,
  rpcHomeTerminalWsOpen,
  rpcHomeTerminalWsSend,
} from "../src/home-terminal-ws.js";

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

describe("home-terminal-ws companion tunnel", () => {
  let profileDir: string;
  let manager: TerminalManager;
  let wsServer: TerminalWsServer | null = null;
  let testPort: number;
  const companion = { id: "companion-a" };

  beforeEach(async () => {
    onDataHandlers.length = 0;
    mockPty.write.mockClear();
    testPort = await pickFreePort();
    profileDir = await mkdtemp(join(tmpdir(), "envoy-home-term-ws-"));
    manager = new TerminalManager({ profileDir });
    await manager.waitUntilReady();
    manager.setTerminalWsListenAddress(testPort, "/ws/terminal");
    wsServer = new TerminalWsServer({ port: testPort, pathPrefix: "/ws/terminal", manager });
    wsServer.start();
    await new Promise((r) => setTimeout(r, 100));
  });

  afterEach(async () => {
    closeHomeTerminalWsForCompanion(companion);
    wsServer?.stop();
    wsServer = null;
  });

  it("forwards PTY output to companion with sessionId", async () => {
    const created = await manager.createTerminalSession({ title: "A" });
    const attach = manager.terminalAttach({ sessionId: created.sessionId });
    const rx: Array<{ sessionId?: string; dataBase64?: string }> = [];

    const err = await rpcHomeTerminalWsOpen(
      companion,
      { pathWithQuery: attach.wsUrl.replace(/^ws:\/\/127\.0\.0\.1:\d+/, "") },
      testPort,
      (_event, data) => {
        rx.push(data as { sessionId?: string; dataBase64?: string });
      },
    );
    expect(err).toBeNull();

    for (const handler of onDataHandlers) {
      handler("hello");
    }
    await new Promise((r) => setTimeout(r, 20));

    expect(rx.length).toBeGreaterThan(0);
    expect(rx[0]?.sessionId).toBe(created.sessionId);
    const raw = Buffer.from(rx[0]!.dataBase64!, "base64");
    const decoded = decodeTerminalFrame(new Uint8Array(raw));
    expect(decoded?.type).toBe(TerminalWireType.Stdout);
    expect(new TextDecoder().decode(decoded!.payload)).toBe("hello");
  });

  it("routes stdin frames through companion tunnel to PTY", async () => {
    const created = await manager.createTerminalSession({ title: "A" });
    const attach = manager.terminalAttach({ sessionId: created.sessionId });
    mockPty.write.mockClear();

    const err = await rpcHomeTerminalWsOpen(
      companion,
      { pathWithQuery: attach.wsUrl.replace(/^ws:\/\/127\.0\.0\.1:\d+/, "") },
      testPort,
      () => {},
    );
    expect(err).toBeNull();
    await new Promise((r) => setTimeout(r, 100));

    const frame = encodeTerminalFrame(
      TerminalWireType.Stdin,
      new TextEncoder().encode("ls\n"),
    );
    const sendErr = rpcHomeTerminalWsSend(companion, {
      dataBase64: Buffer.from(frame).toString("base64"),
      sessionId: created.sessionId,
    });
    expect(sendErr).toBeNull();
    await new Promise((r) => setTimeout(r, 100));

    expect(mockPty.write).toHaveBeenCalledWith("ls\n");
  });

  it("closes only the requested sessionId", async () => {
    const a = await manager.createTerminalSession({ title: "A" });
    const b = await manager.createTerminalSession({ title: "B" });
    const attachA = manager.terminalAttach({ sessionId: a.sessionId });
    const attachB = manager.terminalAttach({ sessionId: b.sessionId });

    await rpcHomeTerminalWsOpen(
      companion,
      { pathWithQuery: attachA.wsUrl.replace(/^ws:\/\/127\.0\.0\.1:\d+/, "") },
      testPort,
      () => {},
    );
    await rpcHomeTerminalWsOpen(
      companion,
      { pathWithQuery: attachB.wsUrl.replace(/^ws:\/\/127\.0\.0\.1:\d+/, "") },
      testPort,
      () => {},
    );

    rpcHomeTerminalWsClose(companion, { sessionId: a.sessionId });

    const frame = encodeTerminalFrame(TerminalWireType.stdin, Buffer.from("x"));
    expect(rpcHomeTerminalWsSend(companion, { dataBase64: frame.toString("base64"), sessionId: a.sessionId }))
      .toMatch(/not connected/i);
    expect(
      rpcHomeTerminalWsSend(companion, { dataBase64: frame.toString("base64"), sessionId: b.sessionId }),
    ).toBeNull();
  });
});
