/**
 * Serve + accept fleet relay-roster.json (Path C sync).
 *
 * GET  — public (homes + peer pull)
 * PUT  — join-token auth; writes disk when candidate issuedAt is newer
 */
import { timingSafeEqual } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  coerceRelayRosterDocument,
  isRelayRosterExpired,
  isRelayRosterNewer,
  RELAY_ROSTER_HTTP_PATH,
  type RelayRosterDocument,
} from "@envoymesh/api";

export const RELAY_ROSTER_JOIN_TOKEN_HEADER = "x-envoy-relay-join-token" as const;
export const RELAY_ROSTER_SYNC_DEPTH_HEADER = "x-envoy-roster-sync-depth" as const;
export const RELAY_ROSTER_MAX_SYNC_DEPTH = 2;
const MAX_ROSTER_BODY_BYTES = 256 * 1024;

export function resolveRelayRosterFilePath(input: {
  profileDir: string;
  envPath?: string | null;
}): string {
  const fromEnv = input.envPath?.trim();
  if (fromEnv) return fromEnv;
  return join(input.profileDir, "relay-roster.json");
}

export async function readRelayRosterFileBytes(
  path: string,
): Promise<{ ok: true; body: string } | { ok: false; reason: "missing" | "read-error"; detail?: string }> {
  try {
    const body = await readFile(path, "utf8");
    return { ok: true, body };
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "ENOENT") return { ok: false, reason: "missing" };
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "read-error", detail };
  }
}

export async function loadRelayRosterDocument(
  path: string,
): Promise<RelayRosterDocument | null> {
  const raw = await readRelayRosterFileBytes(path);
  if (!raw.ok) return null;
  try {
    return coerceRelayRosterDocument(JSON.parse(raw.body) as unknown);
  } catch {
    return null;
  }
}

export async function writeRelayRosterDocument(
  path: string,
  doc: RelayRosterDocument,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  const body = `${JSON.stringify(doc, null, 2)}\n`;
  await writeFile(tmp, body, { mode: 0o600 });
  await rename(tmp, path);
}

/**
 * If the live roster file is missing, copy a seed once (never overwrite).
 * Seed candidates: ENVOYMESH_RELAY_ROSTER_SEED, then cwd/relay-roster.json.
 */
export async function ensureRelayRosterSeeded(input: {
  destPath: string;
  seedPath?: string | null;
  cwd?: string;
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
}): Promise<"present" | "seeded" | "missing"> {
  const log = input.log ?? console.log;
  const warn = input.warn ?? console.warn;
  const existing = await readRelayRosterFileBytes(input.destPath);
  if (existing.ok) return "present";

  const candidates = [
    input.seedPath?.trim(),
    join(input.cwd ?? process.cwd(), "relay-roster.json"),
  ].filter((p): p is string => Boolean(p && p.trim()));

  for (const seed of candidates) {
    if (seed === input.destPath) continue;
    const raw = await readRelayRosterFileBytes(seed);
    if (!raw.ok) continue;
    try {
      await mkdir(dirname(input.destPath), { recursive: true });
      const tmp = `${input.destPath}.${process.pid}.seed.tmp`;
      await writeFile(tmp, raw.body.endsWith("\n") ? raw.body : `${raw.body}\n`, {
        mode: 0o600,
      });
      await rename(tmp, input.destPath);
      log(`[relay-roster] seeded ${input.destPath} from ${seed}`);
      return "seeded";
    } catch (err) {
      warn(
        `[relay-roster] seed copy failed from ${seed}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return "missing";
}

function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/** Extract join token from Bearer or X-Envoy-Relay-Join-Token. */
export function extractRelayRosterJoinToken(req: IncomingMessage): string | null {
  const header = req.headers[RELAY_ROSTER_JOIN_TOKEN_HEADER];
  if (typeof header === "string" && header.trim()) return header.trim();
  const auth = req.headers.authorization;
  if (typeof auth === "string") {
    const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
    if (m?.[1]) return m[1];
  }
  return null;
}

export function checkRelayRosterJoinToken(
  req: IncomingMessage,
  configuredToken: string | null | undefined,
): boolean {
  const expected = configuredToken?.trim();
  if (!expected || expected.length < 8) return false;
  const got = extractRelayRosterJoinToken(req);
  if (!got) return false;
  return safeEqualString(got, expected);
}

export function parseRosterSyncDepth(req: IncomingMessage): number {
  const raw = req.headers[RELAY_ROSTER_SYNC_DEPTH_HEADER];
  const n = typeof raw === "string" ? Number(raw) : 0;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

async function readBodyCapped(req: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new Error("body-too-large");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export type PutRelayRosterResult =
  | { ok: true; applied: true; document: RelayRosterDocument; syncDepth: number }
  | { ok: true; applied: false; reason: "not-newer"; document: RelayRosterDocument }
  | { ok: false; status: number; reason: string };

/**
 * Validate + optionally persist a PUT body. Caller may fan-out when applied.
 */
export async function putRelayRosterDocument(input: {
  path: string;
  bodyText: string;
  joinTokenConfigured: string | null | undefined;
  req: IncomingMessage;
}): Promise<PutRelayRosterResult> {
  if (!checkRelayRosterJoinToken(input.req, input.joinTokenConfigured)) {
    return { ok: false, status: 401, reason: "unauthorized" };
  }
  let json: unknown;
  try {
    json = JSON.parse(input.bodyText) as unknown;
  } catch {
    return { ok: false, status: 400, reason: "invalid-json" };
  }
  let doc: RelayRosterDocument;
  try {
    doc = coerceRelayRosterDocument(json);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 400, reason: `schema:${detail}` };
  }
  if (isRelayRosterExpired(doc)) {
    return { ok: false, status: 400, reason: "expired" };
  }
  const current = await loadRelayRosterDocument(input.path);
  if (!isRelayRosterNewer(doc, current)) {
    return { ok: true, applied: false, reason: "not-newer", document: current ?? doc };
  }
  await writeRelayRosterDocument(input.path, doc);
  return {
    ok: true,
    applied: true,
    document: doc,
    syncDepth: parseRosterSyncDepth(input.req),
  };
}

export async function handleRelayRosterHttpRequest(input: {
  req: IncomingMessage;
  res: ServerResponse;
  pathname: string;
  profileDir: string;
  envPath?: string | null;
  joinToken: string | null | undefined;
  onApplied?: (doc: RelayRosterDocument, syncDepth: number) => void | Promise<void>;
}): Promise<boolean> {
  if (input.pathname !== RELAY_ROSTER_HTTP_PATH && input.pathname !== "/relay-roster.json") {
    return false;
  }
  const path = resolveRelayRosterFilePath({
    profileDir: input.profileDir,
    envPath: input.envPath,
  });

  if (input.req.method === "GET" || input.req.method === "HEAD") {
    const rosterRead = await readRelayRosterFileBytes(path);
    if (!rosterRead.ok) {
      input.res.writeHead(rosterRead.reason === "missing" ? 404 : 500, {
        "Content-Type": "application/json",
      });
      input.res.end(
        JSON.stringify({
          error: rosterRead.reason === "missing" ? "roster-not-configured" : "roster-read-error",
          detail: rosterRead.detail,
        }),
      );
      return true;
    }
    input.res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    });
    if (input.req.method === "HEAD") {
      input.res.end();
    } else {
      input.res.end(rosterRead.body);
    }
    return true;
  }

  if (input.req.method === "PUT" || input.req.method === "POST") {
    let bodyText: string;
    try {
      bodyText = await readBodyCapped(input.req, MAX_ROSTER_BODY_BYTES);
    } catch {
      input.res.writeHead(413, { "Content-Type": "application/json" });
      input.res.end(JSON.stringify({ error: "body-too-large" }));
      return true;
    }
    const result = await putRelayRosterDocument({
      path,
      bodyText,
      joinTokenConfigured: input.joinToken,
      req: input.req,
    });
    if (!result.ok) {
      input.res.writeHead(result.status, { "Content-Type": "application/json" });
      input.res.end(JSON.stringify({ error: result.reason }));
      return true;
    }
    if (result.applied) {
      input.res.writeHead(200, { "Content-Type": "application/json" });
      input.res.end(JSON.stringify({ ok: true, applied: true, issuedAt: result.document.issuedAt }));
      if (input.onApplied) {
        await input.onApplied(result.document, result.syncDepth);
      }
    } else {
      input.res.writeHead(200, { "Content-Type": "application/json" });
      input.res.end(JSON.stringify({ ok: true, applied: false, reason: result.reason }));
    }
    return true;
  }

  input.res.writeHead(405, { "Content-Type": "application/json", Allow: "GET, HEAD, PUT, POST" });
  input.res.end(JSON.stringify({ error: "method-not-allowed" }));
  return true;
}
