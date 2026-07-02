import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ws", () => {
  class MockWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = MockWebSocket.OPEN;
    on(event: string, cb: (...args: unknown[]) => void) {
      if (event === "open") queueMicrotask(() => cb());
      return this;
    }
    once(event: string, cb: (...args: unknown[]) => void) {
      if (event === "open") queueMicrotask(() => cb());
      return this;
    }
    send = vi.fn();
    close = vi.fn();
  }
  return { default: MockWebSocket };
});

import {
  closeHomeTerminalWsForCompanion,
  rpcHomeTerminalWsClose,
  rpcHomeTerminalWsOpen,
  rpcHomeTerminalWsSend,
} from "../src/home-terminal-ws.js";

describe("home-terminal-ws multi-session routing", () => {
  const companion = {};

  beforeEach(() => {
    closeHomeTerminalWsForCompanion(companion);
  });

  it("requires sessionId when multiple tunnels are open", async () => {
    const emit = vi.fn();
    await rpcHomeTerminalWsOpen(
      companion,
      { pathWithQuery: "/ws/terminal/session-a?token=tok-a" },
      3032,
      emit,
    );
    await rpcHomeTerminalWsOpen(
      companion,
      { pathWithQuery: "/ws/terminal/session-b?token=tok-b" },
      3032,
      emit,
    );

    const err = rpcHomeTerminalWsSend(companion, {
      dataBase64: Buffer.from("hello").toString("base64"),
    });
    expect(err).toContain("sessionId required");

    const routed = rpcHomeTerminalWsSend(companion, {
      dataBase64: Buffer.from("hello").toString("base64"),
      sessionId: "session-a",
    });
    expect(routed).toBeNull();

    rpcHomeTerminalWsClose(companion, { sessionId: "session-a" });
    const singleLeft = rpcHomeTerminalWsSend(companion, {
      dataBase64: Buffer.from("hello").toString("base64"),
    });
    expect(singleLeft).toBeNull();

    rpcHomeTerminalWsClose(companion, { sessionId: "session-b" });
  });
});
