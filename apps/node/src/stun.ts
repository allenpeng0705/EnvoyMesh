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

// ─── NAT type classification (RFC 3489 inspired) ─────────────────────────────

/**
 * Coarse NAT type classification derived from how STUN servers observe us.
 *
 * - `"open"` — no NAT (same public IP:port seen by all servers, or a single
 *   server reports an address matching a local interface). Inbound works.
 * - `"full-cone"` — normal NAT with a stable public mapping. Different servers
 *   see the SAME mapped IP:port. Inbound works once a port is mapped (UPnP or
 *   port-forwarding). This is the "not CGNAT, fully usable" case.
 * - `"symmetric"` — different STUN servers see DIFFERENT mapped IP:port pairs.
 *   This is the signature of symmetric NAT, which is what carrier-grade NAT
 *   (CGNAT) and most enterprise NAT deployments use. Inbound connections do
 *   NOT work — the public DHT is useless here because peers cannot dial you.
 * - `"unknown"` — STUN queries failed or returned insufficient data. Don't
 *   guess; fall back to other signals (UPnP, autoNAT).
 *
 * The public-DHT churn problem (docs/connectivity-internals-and-design.md)
 * is almost entirely caused by nodes behind symmetric NAT (CGNAT) whose DHT
 * routing table never fills. Detecting `"symmetric"` deterministically is what
 * makes auto-applying quietWan safe — it's a real measurement, not a guess.
 */
export type NatType = "open" | "full-cone" | "symmetric" | "unknown";

/**
 * Classify the NAT type by querying at least two STUN servers and comparing
 * the mapped addresses they observe.
 *
 * If both servers report the SAME ip:port → full-cone (or open if it matches
 * a local address). If they report DIFFERENT ip:port pairs → symmetric NAT
 * (CGNAT). If fewer than two respond → unknown.
 *
 * Pure over the results — exported so the comparison logic is unit-testable
 * without real STUN queries (the network round-trips are injected via the
 * `lookup` callback).
 *
 * @param servers  At least two STUN servers (different providers, so their
 *                 observed source addresses differ under symmetric NAT).
 * @param timeoutMs  Per-server timeout (default 3000).
 */
export async function detectNatType(
  servers: StunServer[],
  options?: { timeoutMs?: number; localInterfaceIps?: string[] },
): Promise<NatType> {
  const timeoutMs = options?.timeoutMs ?? 3000;
  if (servers.length < 2) return "unknown";
  // Query the first two distinct servers. (Additional servers don't improve
  // the classification — two differing observations is the symmetric signature.)
  const [a, b] = servers;
  const [ra, rb] = await Promise.all([
    stunLookup(a!.host, a!.port, timeoutMs),
    stunLookup(b!.host, b!.port, timeoutMs),
  ]);
  return classifyNatFromStunResults(ra, rb, options?.localInterfaceIps ?? []);
}

/**
 * Pure classification from two STUN results. Exported for unit testing.
 */
export function classifyNatFromStunResults(
  a: StunResult | null,
  b: StunResult | null,
  localInterfaceIps: string[] = [],
): NatType {
  // Both failed → can't classify.
  if (!a && !b) return "unknown";
  // Only one responded → can't compare, can't classify.
  if (!a || !b) return "unknown";

  const sameAddr = a.ip === b.ip && a.port === b.port;
  if (!sameAddr) {
    // Different servers see different mappings → symmetric NAT (CGNAT).
    return "symmetric";
  }
  // Same mapping from both servers. If it matches a local interface IP, there's
  // no NAT (open). Otherwise it's a stable public mapping (full-cone NAT).
  if (localInterfaceIps.includes(a.ip)) return "open";
  return "full-cone";
}

// ─── Definitive CGNAT detection ──────────────────────────────────────────────

/** True when an IPv4 string is in the RFC 6598 CGNAT range (100.64.0.0/10). */
export function isCgnatRangeIp(ip: string): boolean {
  const m = ip.match(/^(\d+)\.(\d+)\./);
  if (!m) return false;
  const o1 = parseInt(m[1]!, 10);
  const o2 = parseInt(m[2]!, 10);
  return o1 === 100 && o2 >= 64 && o2 <= 127;
}

/** True when an IPv4 string is RFC1918 private (10/172.16-31/192.168). */
export function isRfc1918PrivateIp(ip: string): boolean {
  const m = ip.match(/^(\d+)\.(\d+)\./);
  if (!m) return false;
  const o1 = parseInt(m[1]!, 10);
  const o2 = parseInt(m[2]!, 10);
  if (o1 === 10) return true;
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
  if (o1 === 192 && o2 === 168) return true;
  return false;
}

/**
 * Inputs to the definitive-CGNAT classifier. Each is an independent signal;
 * the classifier auto-applies quietWan only when a signal is *definitive*
 * (100% CGNAT, no false-positive risk). Ambiguous signals (e.g. STUN timeout
 * alone) do NOT trigger auto-apply — they fall through to the Settings
 * suggestion path instead.
 *
 * See docs/connectivity-internals-and-design.md Open Question #1.
 */
export interface CgnatDetectionInput {
  /**
   * STUN-observed NAT type. `"symmetric"` is a *noisy* CGNAT signal (requires
   * corroboration from UPnP-private to auto-apply — see classifyCgnat docs).
   * `"full-cone"` / `"open"` are definitive negatives.
   */
  natType?: NatType;
  /** STUN-observed public IP (if any). Checked against the RFC 6598 CGNAT range. */
  stunObservedIp?: string;
  /**
   * UPnP-reported external IP. When UPnP returns an RFC1918 private IP, the
   * gateway may be behind another NAT (CGNAT or fixable double-NAT). A *noisy*
   * signal — requires corroboration from symmetric NAT to auto-apply.
   */
  upnpExternalIp?: string;
  /**
   * Local NIC IPv4 addresses. When any is in 100.64/10 (Tailscale/headscale),
   * a STUN-observed 100.64 address is treated as overlay VPN — not ISP CGNAT.
   */
  localInterfaceIps?: string[];
  /**
   * True when a VPN/overlay interface is active (utun/tun/wg/tailscale/…).
   * Suppresses quietWan auto-apply: both symmetric+UPnP and STUN-100.64 pristine
   * paths (commercial/split-tunnel VPN often sees ISP CGNAT 100.64 without a
   * local Tailscale NIC).
   */
  likelyVpnActive?: boolean;
}

/**
 * Classify whether the node is *definitively* behind CGNAT, based on the
 * available signals. Returns one of:
 *
 * - `"cgnat"` — a pristine (zero-false-positive) signal fired, OR two noisy
 *   signals corroborate each other. Auto-applying quietWan is correct: the
 *   public DHT cannot work (no inbound), so it's pure churn.
 * - `"not-cgnat"` — a definitive negative signal (full-cone / open NAT with a
 *   routable public IP). Don't suggest quietWan for network reasons.
 * - `"unknown"` — signals are ambiguous. Don't auto-apply; fall back to the
 *   churn-based Settings suggestion.
 *
 * ## False-positive analysis (why each signal is trusted or not)
 *
 * **Pristine (trusted alone):**
 * - STUN-observed IP in RFC 6598 range (`100.64.x.x`), **unless** a local
 *   interface is also in that range (Tailscale/headscale overlay — those
 *   100.64 addresses are mutually dialable VPN IPs, not ISP CGNAT), **or**
 *   {@link CgnatDetectionInput.likelyVpnActive} (commercial/split-tunnel VPN
 *   often sees ISP CGNAT 100.64 on STUN without a local 100.64 NIC).
 *
 * **Noisy (require corroboration — two independent signals must agree):**
 * - NAT type `"symmetric"` (two STUN servers saw different mappings). False
 *   positives: transient IP change mid-test (Wi-Fi↔cellular handoff, VPN
 *   connect), enterprise STUN-intercepting firewalls. Real but rare.
 * - UPnP external IP is RFC1918 private. False positives: cascaded routers
 *   (double-NAT where the outer router HAS a public IP and the situation is
 *   fixable via port-forwarding, unlike CGNAT), buggy UPnP reporting the LAN
 *   interface. The signal is correct for true CGNAT but can't distinguish
 *   "fixable double-NAT" from "unfixable CGNAT" on its own.
 * - When {@link CgnatDetectionInput.likelyVpnActive} is set, the noisy
 *   corroboration path is suppressed (VPN users commonly look like
 *   symmetric + UPnP-private without being on ISP CGNAT).
 *
 * When a noisy signal fires alone, we return `"unknown"` (no auto-apply) and
 * let the churn-based suggestion surface it to the operator. When a pristine
 * signal fires, OR two noisy signals agree (and VPN is not active), we return
 * `"cgnat"`.
 *
 * Pure function — unit-testable without any network.
 */
export function classifyCgnat(input: CgnatDetectionInput): "cgnat" | "not-cgnat" | "unknown" {
  // Definitive negative — stable public mapping confirmed by STUN. A full-cone
  // or open NAT means the node HAS a stable public mapping that can receive
  // inbound (once a port is mapped). This wins over a buggy UPnP report: UPnP
  // can mis-report the LAN interface or sit behind a cascaded router, but STUN
  // full-cone is a direct measurement of inbound-mapping stability. The only
  // thing that overrides this is the RFC 6598 range (checked next), because
  // that's an even more pristine signal.
  if (
    (input.natType === "full-cone" || input.natType === "open") &&
    (!input.stunObservedIp || !isCgnatRangeIp(input.stunObservedIp))
  ) {
    return "not-cgnat";
  }

  // Pristine positive: RFC 6598 CGNAT range — but not when local NICs also
  // sit in 100.64/10 (Tailscale overlay), and not when a VPN is already up
  // (would re-apply quietWan right after a VPN revert on commercial VPN).
  if (input.stunObservedIp && isCgnatRangeIp(input.stunObservedIp)) {
    const localHasOverlay = (input.localInterfaceIps ?? []).some(isCgnatRangeIp);
    if (!localHasOverlay && !input.likelyVpnActive) return "cgnat";
  }

  // Noisy signals: require TWO to agree (corroboration), to avoid false positives.
  // Skip when a VPN/overlay is active — commercial VPN + home UPnP looks like
  // this pair without being ISP CGNAT, and auto-applying quietWan then breaks
  // Online-direct over the VPN.
  const symmetricSignal = input.natType === "symmetric";
  const upnpPrivateSignal = !!(input.upnpExternalIp && isRfc1918PrivateIp(input.upnpExternalIp));
  if (symmetricSignal && upnpPrivateSignal && !input.likelyVpnActive) return "cgnat";

  // Everything else → ambiguous. Don't auto-apply; let the operator decide.
  return "unknown";
}
