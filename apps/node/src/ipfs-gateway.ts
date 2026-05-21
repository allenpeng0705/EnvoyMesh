/** Max bytes fetched from an IPFS HTTP gateway during verify (64 MiB). */
export const IPFS_GATEWAY_FETCH_MAX_BYTES = 64 * 1024 * 1024;

const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Normalize a user-provided gateway base (`ipfs.io`, `https://dweb.link/`) to origin without trailing slash.
 */
export function normalizeGatewayBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  let url: URL;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      url = new URL(trimmed);
    } else {
      url = new URL(`https://${trimmed}`);
    }
  } catch {
    throw new Error(`Invalid gateway URL: ${raw}`);
  }

  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HTTP_HOSTS.has(url.hostname))) {
    throw new Error(`Gateway must use https (http allowed only for localhost): ${raw}`);
  }

  if (url.username || url.password) {
    throw new Error(`Gateway URL must not include credentials: ${raw}`);
  }

  return url.origin;
}

export function buildIpfsGatewayContentUrl(gatewayBase: string, cid: string): string {
  const base = normalizeGatewayBaseUrl(gatewayBase);
  const encodedCid = encodeURIComponent(cid.trim());
  return `${base}/ipfs/${encodedCid}`;
}

export function resolveAllowlistedGateway(
  allowlist: string[] | undefined,
  requested?: string,
): string {
  const normalized = (allowlist ?? []).map((entry) => normalizeGatewayBaseUrl(entry)).filter(Boolean);
  if (normalized.length === 0) {
    throw new Error("No IPFS gateway allowlist configured (Settings → Node → External distribution)");
  }

  if (requested?.trim()) {
    const want = normalizeGatewayBaseUrl(requested);
    if (!normalized.includes(want)) {
      throw new Error(`Gateway not in allowlist: ${requested}`);
    }
    return want;
  }

  return normalized[0]!;
}

export async function fetchIpfsGatewayBytes(
  gatewayBase: string,
  cid: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const url = buildIpfsGatewayContentUrl(gatewayBase, cid);
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    throw new Error(`Gateway fetch failed (${res.status} ${res.statusText})`);
  }

  const lenHeader = res.headers.get("content-length");
  if (lenHeader) {
    const len = Number.parseInt(lenHeader, 10);
    if (Number.isFinite(len) && len > maxBytes) {
      throw new Error(`Gateway response too large (${len} bytes, max ${maxBytes})`);
    }
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) {
    throw new Error(`Gateway response too large (${buf.byteLength} bytes, max ${maxBytes})`);
  }

  return buf;
}
