import { describe, expect, it } from "vitest";

import {
  decodeTerminalFrame,
  decodeTerminalExit,
  decodeTerminalResize,
  encodeTerminalExit,
  encodeTerminalFrame,
  encodeTerminalResize,
  TerminalWireType,
} from "@envoymesh/api";

describe("terminal-wire codec", () => {
  it("roundtrips stdin/stdout payloads", () => {
    const payload = new TextEncoder().encode("echo hello\n");
    const frame = encodeTerminalFrame(TerminalWireType.Stdin, payload);
    const decoded = decodeTerminalFrame(frame);
    expect(decoded?.type).toBe(TerminalWireType.Stdin);
    expect(new TextDecoder().decode(decoded?.payload)).toBe("echo hello\n");
  });

  it("encodes and decodes resize frames", () => {
    const frame = encodeTerminalResize(120, 40);
    const decoded = decodeTerminalFrame(frame);
    expect(decoded?.type).toBe(TerminalWireType.Resize);
    expect(decodeTerminalResize(decoded!.payload)).toEqual({ cols: 120, rows: 40 });
  });

  it("encodes and decodes exit frames", () => {
    const frame = encodeTerminalExit(130);
    const decoded = decodeTerminalFrame(frame);
    expect(decoded?.type).toBe(TerminalWireType.Exit);
    expect(decodeTerminalExit(decoded!.payload)).toBe(130);
  });

  it("rejects invalid version", () => {
    const bad = new Uint8Array([9, TerminalWireType.Stdin]);
    expect(decodeTerminalFrame(bad)).toBeNull();
  });
});
