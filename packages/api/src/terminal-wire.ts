/** Binary PTY wire protocol (version 1). See docs/terminals-wire-protocol.md */

export const TERMINAL_WIRE_VERSION = 1;

export const TerminalWireType = {
  Stdin: 0,
  Stdout: 1,
  Resize: 2,
  Exit: 3,
  Ping: 4,
  Pong: 5,
} as const;

export type TerminalWireType = (typeof TerminalWireType)[keyof typeof TerminalWireType];

const HEADER_BYTES = 2;

export function encodeTerminalFrame(type: TerminalWireType, payload: Uint8Array = new Uint8Array()): Uint8Array {
  const out = new Uint8Array(HEADER_BYTES + payload.length);
  out[0] = TERMINAL_WIRE_VERSION;
  out[1] = type;
  out.set(payload, HEADER_BYTES);
  return out;
}

export function encodeTerminalResize(cols: number, rows: number): Uint8Array {
  const payload = new Uint8Array(4);
  const view = new DataView(payload.buffer);
  view.setUint16(0, cols, false);
  view.setUint16(2, rows, false);
  return encodeTerminalFrame(TerminalWireType.Resize, payload);
}

export function encodeTerminalExit(exitCode: number): Uint8Array {
  const payload = new Uint8Array(4);
  new DataView(payload.buffer).setInt32(0, exitCode, false);
  return encodeTerminalFrame(TerminalWireType.Exit, payload);
}

export function decodeTerminalResize(payload: Uint8Array): { cols: number; rows: number } | null {
  if (payload.length < 4) return null;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return { cols: view.getUint16(0, false), rows: view.getUint16(2, false) };
}

export function decodeTerminalExit(payload: Uint8Array): number | null {
  if (payload.length < 4) return null;
  return new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getInt32(0, false);
}

export function decodeTerminalFrame(
  data: Uint8Array,
): { version: number; type: TerminalWireType; payload: Uint8Array } | null {
  if (data.length < HEADER_BYTES) return null;
  const version = data[0]!;
  if (version !== TERMINAL_WIRE_VERSION) return null;
  const type = data[1]! as TerminalWireType;
  if (type < TerminalWireType.Stdin || type > TerminalWireType.Pong) return null;
  return {
    version,
    type,
    payload: data.subarray(HEADER_BYTES),
  };
}
