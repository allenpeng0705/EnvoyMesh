import { describe, expect, it, vi } from "vitest";
import { encodeTerminalFrame, TerminalWireType } from "@envoymesh/api";

import { HomeRemoteTerminalClient } from "../../src/lib/terminal-ws-client.js";

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (const i of bytes) s += String.fromCharCode(i);
  return btoa(s);
}

describe("HomeRemoteTerminalClient", () => {
  it("demuxes rx events by sessionId and tags outbound sends", async () => {
    const sends: Array<{ sessionId: string; dataBase64: string }> = [];
    const onData = vi.fn();

    const stdout = encodeTerminalFrame(TerminalWireType.Stdout, new TextEncoder().encode("ok"));

    const client = new HomeRemoteTerminalClient({
      sessionId: "session-a",
      pathWithQuery: "/ws/terminal/session-a?token=tok",
      cols: 80,
      rows: 24,
      onData,
      homeTerminalWsOpen: vi.fn(async () => ({ ok: true })),
      homeTerminalWsSend: vi.fn(async (params) => {
        sends.push(params);
        return { ok: true };
      }),
      homeTerminalWsClose: vi.fn(async () => ({ ok: true })),
      subscribeRx: (handler) => {
        handler({ sessionId: "session-b", dataBase64: bytesToBase64(stdout) });
        handler({ sessionId: "session-a", dataBase64: bytesToBase64(stdout) });
        return () => {};
      },
      subscribeClosed: () => () => {},
    });

    await client.connect();
    client.sendInput("x");

    expect(onData).toHaveBeenCalledTimes(1);
    expect(sends.length).toBeGreaterThanOrEqual(1);
    expect(sends.every((s) => s.sessionId === "session-a")).toBe(true);
  });

  it("closes only its session tunnel", async () => {
    const close = vi.fn(async () => ({ ok: true }));
    const client = new HomeRemoteTerminalClient({
      sessionId: "session-z",
      pathWithQuery: "/ws/terminal/session-z?token=tok",
      cols: 80,
      rows: 24,
      onData: () => {},
      homeTerminalWsOpen: vi.fn(async () => ({ ok: true })),
      homeTerminalWsSend: vi.fn(async () => ({ ok: true })),
      homeTerminalWsClose: close,
      subscribeRx: () => () => {},
      subscribeClosed: () => () => {},
    });

    await client.connect();
    client.close();
    expect(close).toHaveBeenCalledWith({ sessionId: "session-z" });
  });
});
