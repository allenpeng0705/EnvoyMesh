/**
 * STUN client — RFC 5389 binding request/response.
 *
 * Uses the built-in Node.js `dgram` module (no external deps).
 * Sends a binding request to a STUN server and parses the XOR-MAPPED-ADDRESS
 * attribute from the binding response to discover the public IP:port.
 */

import dgram from "node:dgram";
import { Buffer } from "node:buffer";

// ─── Constants ────────────────────────────────────────────────────────────────

const STUN_BINDING_REQUEST = 0x0001;
const STUN_BINDING_SUCCESS_RESPONSE = 0x0101;
const STUN_MAGIC_COOKIE = 0x2112a442;

const ATTR_XOR_MAPPED_ADDRESS = 0x0020;
const ATTR_MAPPED_ADDRESS = 0x0001;

const IPV4_FAMILY = 0x01;
const IPV6_FAMILY = 0x02;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StunResult {
  ip: string;
  port: number;
}

export interface StunServer {
  host: string;
  port: number;
}

// ─── Default STUN servers ────────────────────────────────────────────────────

export const DEFAULT_STUN_SERVERS: StunServer[] = [
  { host: "stun.l.google.com", port: 19302 },
  { host: "stun1.l.google.com", port: 19302 },
  { host: "stun.cloudflare.com", port: 3478 },
];

// ─── STUN message building ───────────────────────────────────────────────────

/** Build a STUN binding request message. */
function buildBindingRequest(): Buffer {
  const transactionId = Buffer.alloc(12);
  require("node:crypto").randomFillSync(transactionId);

  const msg = Buffer.alloc(20);
  // Message type (big-endian)
  msg.writeUInt16BE(STUN_BINDING_REQUEST, 0);
  // Message length (no attributes in a binding request)
  msg.writeUInt16BE(0, 2);
  // Magic cookie
  msg.writeUInt32BE(STUN_MAGIC_COOKIE, 4);
  // Transaction ID (bytes 4-19 = 16 bytes: 4-byte magic + 12-byte transaction)
  transactionId.copy(msg, 4, 0, 12);
  return msg;
}

// ─── STUN response parsing ──────────────────────────────────────────────────

/**
 * Parse a STUN binding success response.
 * Returns { ip, port } from the XOR-MAPPED-ADDRESS attribute.
 * Throws if the response is invalid or not a success response.
 */
function parseBindingResponse(buf: Buffer): StunResult {
  if (buf.length < 20) {
    throw new Error("STUN response too short");
  }

  const msgType = buf.readUInt16BE(0);
  if (msgType !== STUN_BINDING_SUCCESS_RESPONSE) {
    throw new Error(`Not a STUN binding success response: 0x${msgType.toString(16)}`);
  }

  const transactionId = buf.slice(4, 20);

  // Skip the STUN header; walk attributes
  let offset = 20;
  while (offset + 4 <= buf.length) {
    const attrType = buf.readUInt16BE(offset);
    const attrLength = buf.readUInt16BE(offset + 2);
    const attrValue = buf.slice(offset + 4, offset + 4 + attrLength);

    if (attrType === ATTR_XOR_MAPPED_ADDRESS || attrType === ATTR_MAPPED_ADDRESS) {
      return parseMappedAddress(attrValue, attrType === ATTR_XOR_MAPPED_ADDRESS, transactionId);
    }

    // Attributes are 4-byte aligned
    offset += 4 + attrLength + (attrLength % 4 === 0 ? 0 : 4 - (attrLength % 4));
  }

  throw new Error("No XOR-MAPPED-ADDRESS or MAPPED-ADDRESS in STUN response");
}

/** Parse a MAPPED-ADDRESS or XOR-MAPPED-ADDRESS attribute value. */
function parseMappedAddress(value: Buffer, xor: boolean, transactionId: Buffer): StunResult {
  if (value.length < 4) {
    throw new Error("MappedAddress value too short");
  }

  const family = value.readUInt8(1);
  const port = value.readUInt16BE(2) ^ (xor ? STUN_MAGIC_COOKIE >>> 16 : 0);

  if (family === IPV4_FAMILY) {
    if (value.length < 8) throw new Error("IPv4 MAPPED-ADDRESS too short");
    const ip = xor
      ? `${(value.readUInt8(4) ^ (STUN_MAGIC_COOKIE >>> 24))}.${
          (value.readUInt8(5) ^ ((STUN_MAGIC_COOKIE >>> 16) & 0xff))}.${
          (value.readUInt8(6) ^ ((STUN_MAGIC_COOKIE >>> 8) & 0xff))}.${
          (value.readUInt8(7) ^ (STUN_MAGIC_COOKIE & 0xff))}`
      : `${value.readUInt8(4)}.${value.readUInt8(5)}.${value.readUInt8(6)}.${value.readUInt8(7)}`;
    return { ip, port };
  }

  if (family === IPV6_FAMILY) {
    if (value.length < 20) throw new Error("IPv6 MAPPED-ADDRESS too short");
    // For IPv6, XOR with magic cookie (first 8 bytes) + transaction id (bytes 4-12)
    const xorBase = Buffer.alloc(16);
    xorBase.writeUInt32BE(STUN_MAGIC_COOKIE, 0);
    transactionId.copy(xorBase, 4, 0, 12);
    const parts: number[] = [];
    for (let i = 0; i < 16; i += 2) {
      parts.push(value.readUInt16BE(4 + i) ^ xorBase.readUInt16BE(i));
    }
    const ip = parts
      .map((w) => w.toString(16).padStart(4, "0"))
      .reduce<string[]>((acc, h, i) => {
        if (i % 2 === 0) acc.push(h);
        else acc[acc.length - 1] += h;
        return acc;
      }, [])
      .join(":");
    return { ip, port };
  }

  throw new Error(`Unknown address family: ${family}`);
}

// ─── STUN lookup ────────────────────────────────────────────────────────────

/**
 * Send a STUN binding request and return the XOR-MAPPED-ADDRESS.
 * Returns null on timeout or error.
 *
 * @param host  STUN server hostname
 * @param port  STUN server port
 * @param timeoutMs  Timeout in milliseconds (default: 3000)
 */
export async function stunLookup(
  host: string,
  port: number,
  timeoutMs = 3000,
): Promise<StunResult | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const request = buildBindingRequest();
    const timer = setTimeout(() => {
      socket.close();
      resolve(null);
    }, timeoutMs);

    socket.on("error", () => {
      clearTimeout(timer);
      socket.close();
      resolve(null);
    });

    socket.on("message", (buf) => {
      clearTimeout(timer);
      try {
        const result = parseBindingResponse(buf);
        resolve(result);
      } catch {
        resolve(null);
      } finally {
        socket.close();
      }
    });

    // Bind to an ephemeral port, then send
    socket.bind(0, () => {
      socket.send(request, 0, request.length, port, host, (err) => {
        if (err) {
          clearTimeout(timer);
          socket.close();
          resolve(null);
        }
      });
    });
  });
}

/**
 * Race multiple STUN servers; returns the first successful result.
 * Useful when some STUN servers are unreachable.
 *
 * @param servers  List of { host, port } STUN servers
 * @param timeoutMs  Per-server timeout in ms (default: 3000)
 */
export async function raceStunServers(
  servers: StunServer[],
  timeoutMs = 3000,
): Promise<StunResult | null> {
  const results = await Promise.allSettled(servers.map((s) => stunLookup(s.host, s.port, timeoutMs)));
  for (const r of results) {
    if (r.status === "fulfilled" && r.value != null) {
      return r.value;
    }
  }
  return null;
}
