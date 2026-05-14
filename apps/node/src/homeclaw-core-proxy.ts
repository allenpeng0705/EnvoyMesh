import { Buffer } from "node:buffer";
import type { HomeClawCoreProxyParams, HomeClawCoreProxyResult } from "@envoymesh/api";

const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);

const MAX_BODY_IN = 12 * 1024 * 1024;
const MAX_BODY_OUT = 64 * 1024 * 1024;

const REQ_HEADER_ALLOW = /^(authorization|content-type|accept|x-[a-z0-9._-]+)$/i;
const BLOCKED_REQ_HEADERS = new Set([
  "host",
  "connection",
  "transfer-encoding",
  "keep-alive",
  "proxy-connection",
  "te",
  "upgrade",
  "content-length",
]);

const RES_HEADER_ALLOW = /^(content-type|content-length|cache-control|etag|last-modified|x-[a-z0-9._-]+)$/i;

/**
 * Canonical HomeClaw Core HTTP base URL ( node's LAN ) for proxy and WebSocket tunnel.
 */
export function resolveHomeClawCoreHttpBase(persistedCoreBase?: string): string {
  const base = (persistedCoreBase?.trim().replace(/\/+$/, "") || defaultCoreBase()).trim();
  return base || "http://127.0.0.1:9000";
}

function defaultCoreBase(): string {
  const raw = process.env.HOMECLAW_CORE_BASE_URL?.trim();
  if (raw && raw.length > 0) {
    return raw.replace(/\/+$/, "");
  }
  return "http://127.0.0.1:9000";
}

function parsePathInput(rawPath: string): { pathname: string; search: string } | { error: string } {
  const trimmed = rawPath.trim();
  if (!trimmed.startsWith("/")) {
    return { error: "path must start with /" };
  }
  let pathname: string;
  let search: string;
  const q = trimmed.indexOf("?");
  if (q === -1) {
    pathname = trimmed;
    search = "";
  } else {
    pathname = trimmed.slice(0, q);
    search = trimmed.slice(q); // includes '?'
  }
  if (pathname.includes("..") || pathname.includes("\0")) {
    return { error: "invalid path" };
  }
  return { pathname, search };
}

function isPathAllowed(pathname: string): boolean {
  if (pathname === "/ready") {
    return true;
  }
  if (pathname.startsWith("/files/") || pathname.startsWith("/files/out")) {
    return true;
  }
  const prefixes = [
    "/api/",
    "/inbound",
    "/memory/",
    "/knowledge_base/",
    "/clawcode",
  ];
  for (const p of prefixes) {
    if (p.endsWith("/")) {
      if (pathname.startsWith(p)) {
        return true;
      }
    } else if (pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`)) {
      return true;
    }
  }
  return false;
}

function buildTargetUrl(coreBase: string, pathname: string, search: string): string {
  const base = coreBase.replace(/\/+$/, "");
  return `${base}${pathname}${search}`;
}

function pickRequestHeaders(headers: Record<string, string> | undefined): Headers {
  const out = new Headers();
  if (!headers) {
    return out;
  }
  for (const [k, v] of Object.entries(headers)) {
    const key = k.trim();
    if (!key || BLOCKED_REQ_HEADERS.has(key.toLowerCase())) {
      continue;
    }
    if (!REQ_HEADER_ALLOW.test(key)) {
      continue;
    }
    out.set(key, v);
  }
  return out;
}

function packResponseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    const kl = key.toLowerCase();
    if (!RES_HEADER_ALLOW.test(kl)) {
      return;
    }
    if (kl === "content-length" || kl === "transfer-encoding") {
      return;
    }
    out[key] = value;
  });
  return out;
}

/**
 * Execute a single SSR-safe HomeClaw Core HTTP proxy call (used by JSON-RPC `homeclawCoreProxy`).
 */
export async function executeHomeClawCoreProxy(
  params: HomeClawCoreProxyParams,
  persistedCoreBase?: string,
): Promise<HomeClawCoreProxyResult> {
  const methodUpper = (params.method ?? "").trim().toUpperCase();
  if (!ALLOWED_METHODS.has(methodUpper)) {
    return {
      status: 400,
      headers: {},
      error: `unsupported method: ${params.method}`,
    };
  }

  const pathParse = parsePathInput(params.path ?? "");
  if ("error" in pathParse) {
    return { status: 400, headers: {}, error: pathParse.error };
  }
  if (!isPathAllowed(pathParse.pathname)) {
    return { status: 403, headers: {}, error: `path not allowed: ${pathParse.pathname}` };
  }

  let bodyBuf: Buffer | undefined;
  if (params.bodyBase64 !== undefined && params.bodyBase64 !== null && params.bodyBase64 !== "") {
    try {
      bodyBuf = Buffer.from(params.bodyBase64, "base64");
    } catch {
      return { status: 400, headers: {}, error: "invalid bodyBase64" };
    }
    if (bodyBuf.length > MAX_BODY_IN) {
      return { status: 413, headers: {}, error: "request body too large" };
    }
  }

  const hasBody =
    methodUpper !== "GET" &&
    methodUpper !== "HEAD" &&
    bodyBuf !== undefined &&
    bodyBuf.length > 0;

  const base = resolveHomeClawCoreHttpBase(persistedCoreBase);

  const url = buildTargetUrl(base, pathParse.pathname, pathParse.search);
  const forwardHeaders = pickRequestHeaders(params.headers);

  const timeoutMsRaw =
    typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs)
      ? params.timeoutMs
      : 175_000;
  const timeoutMs = Math.min(Math.max(Math.floor(timeoutMsRaw), 1000), 14_400_000);

  try {
    const res = await fetch(url, {
      method: methodUpper,
      headers: forwardHeaders,
      body: hasBody ? bodyBuf : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BODY_OUT) {
      return { status: 502, headers: {}, error: "Core response too large" };
    }

    const headerObj = packResponseHeaders(res.headers);

    if (buf.length === 0) {
      return { status: res.status, headers: headerObj };
    }
    return {
      status: res.status,
      headers: headerObj,
      bodyBase64: buf.toString("base64"),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 502, headers: {}, error: `Core request failed: ${msg}` };
  }
}
