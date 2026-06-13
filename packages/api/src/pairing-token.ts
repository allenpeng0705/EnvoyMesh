/**
 * Compressed pairing token — V1 format.
 *
 * Instead of bloating the QR code with URL-encoded query params (PEM keys,
 * multiaddr lists), we serialize the essential pairing fields as
 * gzip-compressed JSON → base64url.  The resulting token is ~300 bytes vs
 * ~1500+ bytes for the equivalent URL-encoded string, making the QR code
 * dense but scannable.
 *
 * V1 layout (JSON, then gzip, then base64url):
 *   { v:1, ws:"...", rel:"...", lan:"...", tid:"...", oid:"...",
 *     apid:"...", aname:"...", bpn:[...], tok:"..." }
 *
 * Field abbreviations (keep JSON small):
 *   v    — version (1)
 *   ws   — wsUrl
 *   rel  — relayWsUrl
 *   lan  — lanWsUrl
 *   tid  — homeNodePeerId
 *   oid  — ownerId
 *   apid — agentPeerId
 *   aname— agentName
 *   bpn  — bootstrapPresetNames
 *   tok  — token
 */

import type { PairingPayload } from "./ws-protocol.js";

// ─── Encoding ────────────────────────────────────────────────────────────────

/** Fields of the pairing payload that travel inside the compressed token. */
interface PairingTokenV1Payload {
  v: 1;
  ws: string;        // wsUrl
  rel?: string;      // relayWsUrl
  lan?: string;      // lanWsUrl
  tid?: string;     // homeNodePeerId
  oid: string;       // ownerId
  apid?: string;    // agentPeerId
  aname?: string;    // agentName
  bpn?: string[];   // bootstrapPresetNames
  tok: string;       // token
}

/**
 * Encode a PairingPayload into a compact base64url string.
 * Uses the browser's native Compression Streams API (gzip) — no external deps.
 */
export async function encodePairingToken(payload: PairingPayload): Promise<string> {
  const obj: PairingTokenV1Payload = {
    v: 1,
    ws: payload.wsUrl,
    tok: payload.token ?? "",
    oid: payload.ownerId ?? "",
    rel: payload.relayWsUrl,
    lan: payload.lanWsUrl,
    tid: payload.homeNodePeerId,
    apid: payload.agentPeerId,
    aname: payload.agentName,
    bpn: payload.bootstrapPresetNames,
  };

  const json = new TextEncoder().encode(JSON.stringify(obj));

  // Use the browser's native CompressionStream('gzip') — available in all modern
  // browsers.  This avoids any CJS/ESM compatibility issues with npm packages.
  const compressed = await compressGzip(json);

  return base64urlEncode(compressed);
}

/** Compress a Uint8Array using gzip (Compression Streams API). */
async function compressGzip(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  // @ts-ignore: CompressionStream accepts Uint8Array; the ArrayBufferLike vs ArrayBuffer
  // mismatch is a TS lib edge case with SharedArrayBuffer.
  writer.write(data);
  writer.close();
  // Collect raw ArrayBuffers and concatenate at the end.
  const buffers: ArrayBuffer[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reader = cs.readable.getReader() as any;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    // value is Uint8Array backed by ArrayBuffer or SharedArrayBuffer.
    buffers.push(value.buffer as ArrayBuffer);
  }
  const totalLen = buffers.reduce((acc, b) => acc + b.byteLength, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const b of buffers) {
    result.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return result;
}

// ─── Decoding ────────────────────────────────────────────────────────────────

/** Decoded pairing token payload. Omitted fields are undefined. */
export interface DecodedPairingToken {
  wsUrl: string;
  relayWsUrl?: string;
  lanWsUrl?: string;
  homeNodePeerId?: string;
  ownerId: string;
  agentPeerId?: string;
  agentName?: string;
  bootstrapPresetNames?: string[];
  token: string;
}

/**
 * Decode a base64url-encoded pairing token back to a usable object.
 * Throws if the token is malformed or the gzip data is corrupt.
 *
 * Browser: uses native DecompressionStream (async).
 * Node.js: uses pako.ungzip (sync).
 */
export async function decodePairingTokenAsync(token: string): Promise<DecodedPairingToken> {
  if (!token || !token.trim()) {
    throw new Error("Pairing token is empty");
  }

  const compressed = base64urlDecode(token.trim());

  let json: string;
  try {
    const decompressed = await decompressGzip(compressed);
    json = new TextDecoder("utf-8").decode(decompressed);
  } catch {
    throw new Error("Pairing token is not valid gzip-compressed data");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Pairing token payload is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Pairing token payload must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.v !== 1) {
    throw new Error(`Unsupported pairing token version: ${String(obj.v)}`);
  }

  const ws = typeof obj.ws === "string" ? obj.ws.trim() : "";
  const tok = typeof obj.tok === "string" ? obj.tok.trim() : "";
  const oid = typeof obj.oid === "string" ? obj.oid.trim() : "";

  if (!ws) throw new Error("Pairing token is missing wsUrl");
  if (!tok) throw new Error("Pairing token is missing token");
  if (!oid) throw new Error("Pairing token is missing ownerId");

  return {
    wsUrl: ws,
    relayWsUrl: typeof obj.rel === "string" && obj.rel ? obj.rel.trim() : undefined,
    lanWsUrl: typeof obj.lan === "string" && obj.lan ? obj.lan.trim() : undefined,
    homeNodePeerId: typeof obj.tid === "string" && obj.tid ? obj.tid.trim() : undefined,
    ownerId: oid,
    agentPeerId: typeof obj.apid === "string" && obj.apid ? obj.apid.trim() : undefined,
    agentName: typeof obj.aname === "string" && obj.aname ? obj.aname.trim() : undefined,
    bootstrapPresetNames:
      Array.isArray(obj.bpn)
        ? obj.bpn.filter((s): s is string => typeof s === "string" && s.length > 0)
        : undefined,
    token: tok,
  };
}

/** Synchronous decode for Node.js (uses pako). */
export function decodePairingToken(token: string): DecodedPairingToken {
  if (!token || !token.trim()) {
    throw new Error("Pairing token is empty");
  }

  let json: string;
  try {
    const compressed = base64urlDecode(token.trim());
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pako = require("pako") as any;
    const decompressed = pako.ungzip(compressed);
    json = new TextDecoder("utf-8").decode(decompressed);
  } catch {
    throw new Error("Pairing token is not valid gzip-compressed data");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Pairing token payload is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Pairing token payload must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.v !== 1) {
    throw new Error(`Unsupported pairing token version: ${String(obj.v)}`);
  }

  const ws = typeof obj.ws === "string" ? obj.ws.trim() : "";
  const tok = typeof obj.tok === "string" ? obj.tok.trim() : "";
  const oid = typeof obj.oid === "string" ? obj.oid.trim() : "";

  if (!ws) throw new Error("Pairing token is missing wsUrl");
  if (!tok) throw new Error("Pairing token is missing token");
  if (!oid) throw new Error("Pairing token is missing ownerId");

  return {
    wsUrl: ws,
    relayWsUrl: typeof obj.rel === "string" && obj.rel ? obj.rel.trim() : undefined,
    lanWsUrl: typeof obj.lan === "string" && obj.lan ? obj.lan.trim() : undefined,
    homeNodePeerId: typeof obj.tid === "string" && obj.tid ? obj.tid.trim() : undefined,
    ownerId: oid,
    agentPeerId: typeof obj.apid === "string" && obj.apid ? obj.apid.trim() : undefined,
    agentName: typeof obj.aname === "string" && obj.aname ? obj.aname.trim() : undefined,
    bootstrapPresetNames:
      Array.isArray(obj.bpn)
        ? obj.bpn.filter((s): s is string => typeof s === "string" && s.length > 0)
        : undefined,
    token: tok,
  };
}

/** Decompress gzip using the browser's native DecompressionStream. */
async function decompressGzip(data: Uint8Array): Promise<Uint8Array> {
  const cs = new DecompressionStream("gzip");
  const writer = cs.writable.getWriter();
  // @ts-ignore: DecompressionStream accepts Uint8Array; the ArrayBufferLike vs ArrayBuffer
  // mismatch is a TS lib edge case with SharedArrayBuffer.
  writer.write(data);
  writer.close();
  // Collect raw ArrayBuffers and concatenate at the end.
  const buffers: ArrayBuffer[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reader = cs.readable.getReader() as any;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffers.push(value.buffer as ArrayBuffer);
  }
  const totalLen = buffers.reduce((acc, b) => acc + b.byteLength, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const b of buffers) {
    result.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return result;
}

// ─── Base64url utilities ────────────────────────────────────────────────────

function base64urlEncode(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64url");
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(str, "base64url"));
  }
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}
