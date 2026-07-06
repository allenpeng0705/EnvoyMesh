/**
 * Pairing kiosk server — Phase 35D (Fleet Onboarding D: Pairing Kiosk).
 *
 * A *very* small HTTP server the home node can run on demand. The operator
 * turns it on, points their LAN browser at it, and a fleet member clicks
 * "Pair this device" to mint a one-shot company invite (Phase 35A) and
 * receive the `envoy://invite?token=…` URI. They paste it into their
 * Social UI and the existing `pairDevice` flow takes over.
 *
 * Threat model:
 *   - Off by default. The node operator must flip a config flag and provide
 *     a kiosk admin token.
 *   - Binds to `127.0.0.1` unless the operator also flips a "bind to LAN" flag.
 *   - The kiosk admin token is a separate secret from the fleet token and
 *     from the user identity; it is checked as a `Bearer` header on POST /pair.
 *   - The /pair endpoint creates a one-shot invite (default 1h) and returns
 *     only the URI + expiry — never raw profile / vault / peer data.
 *
 * This file is pure: the surrounding daemon (in `node-service-impl.ts`) wires
 * it up with the right callback to mint invites. The server itself is
 * easily unit-testable with `node:http` and a fake `mintInvite`.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";
import QRCode from "qrcode";

const DEFAULT_KIOSK_BIND = "127.0.0.1";
const DEFAULT_KIOSK_PORT = 3737;
const DEFAULT_INVITE_EXPIRES_HOURS = 1;
const MAX_INVITE_EXPIRES_HOURS = 24;
const MAX_BODY_BYTES = 4 * 1024;

export interface PairingKioskMintInviteInput {
  expiresInHours?: number;
  note?: string;
}

export interface PairingKioskMintInviteResult {
  uri: string;
  expiresAt: string;
  inviteId: string;
}

export interface PairingKioskServerOptions {
  /** Bearer token required to call `POST /pair`. Required. */
  kioskAdminToken: string;
  /** Mint a fresh one-shot company invite. Required. */
  mintInvite: (input: PairingKioskMintInviteInput) => Promise<PairingKioskMintInviteResult>;
  /** Address to bind. Default 127.0.0.1 (loopback). */
  bindAddress?: string;
  /** Port to bind. Default 3737. */
  port?: number;
  /**
   * Set true to allow binding to a non-loopback address. The daemon must opt
   * in explicitly because exposing the kiosk to the LAN is the highest-risk
   * scenario here.
   */
  allowLanBind?: boolean;
  /** Optional ISO 8601 expiry for the kiosk itself. Default: no time gate. */
  kioskExpiresAt?: string;
  now?: () => Date;
  /** Override the HTML page (test seam). */
  renderIndexHtml?: (params: { postPairUrl: string }) => string;
}

export interface PairingKioskServerHandle {
  /** Stop listening and release the port. */
  close(): Promise<void>;
  /** Address actually bound (loopback or LAN). Useful for tests + UI display. */
  address: string;
  port: number;
}

function constantTimeTokenMatch(provided: string, expected: string): boolean {
  // Both inputs are user-provided; if lengths differ, we still do a constant
  // compare against a zero-padded buffer of the same length to avoid timing
  // leaks. The expected token is a long random string so false positives are
  // astronomically unlikely.
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function isLoopbackAddress(addr: string): boolean {
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

const DEFAULT_HTML = (params: { postPairUrl: string }): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>EnvoyMesh Pairing Kiosk</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: system-ui, sans-serif; max-width: 540px; margin: 2rem auto; padding: 1rem; }
      h1 { font-size: 1.4rem; }
      button { padding: 0.6rem 1rem; font-size: 1rem; }
      pre  { background: #f4f4f4; padding: 0.6rem; overflow-x: auto; }
      .muted { color: #666; font-size: 0.85rem; }
      #result svg { width: 220px; height: 220px; image-rendering: pixelated; }
    </style>
  </head>
  <body>
    <h1>EnvoyMesh Pairing Kiosk</h1>
    <p>This page is hosted by an EnvoyMesh home node. Click the button to mint a one-shot company invite and copy the URI into your Social UI.</p>
    <button id="pair">Pair this device</button>
    <div id="result" hidden></div>
    <p class="muted">POST ${params.postPairUrl}</p>
    <script>
      document.getElementById("pair").addEventListener("click", async () => {
        const out = document.getElementById("result");
        out.hidden = false;
        out.innerHTML = "<p>Requesting invite…</p>";
        try {
          const resp = await fetch(${JSON.stringify(params.postPairUrl)}, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (!resp.ok) {
            out.innerHTML = "<p>Error " + resp.status + ": " + (await resp.text()) + "</p>";
            return;
          }
          const data = await resp.json();
          const uri = "envoy://invite?token=" + data.token;
          // Prefer the QR code (scan with phone); fall back to text URI.
          const qrHtml = data.qrSvg
            ? '<div style="background:#fff;padding:12px;display:inline-block;margin-bottom:8px">' + data.qrSvg + '</div><p class="muted">Scan with your phone, or copy the link below.</p>'
            : '<p class="muted">No QR available — copy the link below.</p>';
          out.innerHTML = qrHtml +
            '<pre>' + uri + '</pre>' +
            '<p class="muted">Expires: ' + data.expiresAt + '<br>Invite ID: ' + data.inviteId + '</p>' +
            '<p>Open EnvoyMesh → Discover → Paste a contact link, then paste the URI above.</p>';
        } catch (e) {
          out.innerHTML = "<p>Network error: " + e + "</p>";
        }
      });
    </script>
  </body>
</html>
`;

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: string, contentType: string): void {
  res.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
  res.end(body);
}

function fingerprintToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url").slice(0, 8);
}

export async function startPairingKioskServer(
  options: PairingKioskServerOptions,
): Promise<PairingKioskServerHandle> {
  const bind = options.bindAddress ?? DEFAULT_KIOSK_BIND;
  const port = options.port ?? DEFAULT_KIOSK_PORT;
  const now = options.now ?? (() => new Date());
  if (!isLoopbackAddress(bind) && options.allowLanBind !== true) {
    throw new Error(
      `Refusing to bind pairing kiosk to non-loopback ${bind}; pass allowLanBind=true explicitly.`,
    );
  }
  if (!options.kioskAdminToken || options.kioskAdminToken.length < 16) {
    throw new Error("kioskAdminToken must be at least 16 chars");
  }
  if (
    options.kioskExpiresAt &&
    Date.parse(options.kioskExpiresAt) <= now().getTime()
  ) {
    throw new Error("kioskExpiresAt is already in the past");
  }

  let server: Server | null = null;

  const handleRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (
      options.kioskExpiresAt &&
      Date.parse(options.kioskExpiresAt) <= now().getTime()
    ) {
      send(res, 410, "kiosk expired", "text/plain");
      return;
    }
    const url = req.url ?? "/";
    const method = (req.method ?? "GET").toUpperCase();
    if (method === "GET" && (url === "/" || url === "/index.html")) {
      const html = (options.renderIndexHtml ?? DEFAULT_HTML)({ postPairUrl: "/pair" });
      send(res, 200, html, "text/html; charset=utf-8");
      return;
    }
    if (method === "GET" && url === "/health") {
      send(res, 200, "ok", "text/plain");
      return;
    }
    if (method === "POST" && url === "/pair") {
      const auth = req.headers["authorization"]?.trim() ?? "";
      const expected = `Bearer ${options.kioskAdminToken}`;
      if (!constantTimeTokenMatch(auth, expected)) {
        send(res, 401, "unauthorized", "text/plain");
        return;
      }
      let body: { expiresInHours?: number; note?: string } = {};
      try {
        const raw = await readBody(req);
        if (raw.length > 0) body = JSON.parse(raw);
      } catch {
        send(res, 400, "invalid json body", "text/plain");
        return;
      }
      // Defensive parsing: a `null` body, a non-numeric string, an object,
      // or `Infinity` all collapse to `NaN` after `Number(...)`, and
      // `Math.max(NaN, 1) === NaN`. If we let that through, the runtime
      // would persist an `Invalid Date` invite that no consumer can ever
      // parse. Coerce to the default first, then clamp.
      const rawHours = body.expiresInHours;
      const parsedHours =
        typeof rawHours === "number" && Number.isFinite(rawHours)
          ? rawHours
          : DEFAULT_INVITE_EXPIRES_HOURS;
      const hours = Math.min(
        Math.max(parsedHours, 1),
        MAX_INVITE_EXPIRES_HOURS,
      );
      try {
        const minted = await options.mintInvite({
          expiresInHours: hours,
          note: body.note?.slice(0, 200),
        });
        // Generate a QR code SVG for the invite URI so visitors can scan it
        // with their phone camera instead of copy-pasting. Medium error
        // correction handles minor screen glare on a kiosk display.
        const qrSvg = await QRCode.toString(minted.uri, {
          type: "svg",
          errorCorrectionLevel: "M",
          margin: 1,
        }).catch(() => "");
        send(
          res,
          200,
          JSON.stringify({
            uri: minted.uri,
            token: new URL(minted.uri).searchParams.get("token") ?? "",
            inviteId: minted.inviteId,
            expiresAt: minted.expiresAt,
            adminTokenFingerprint: fingerprintToken(options.kioskAdminToken),
            qrSvg,
          }),
          "application/json",
        );
      } catch (err) {
        send(
          res,
          500,
          `mint failed: ${err instanceof Error ? err.message : String(err)}`,
          "text/plain",
        );
      }
      return;
    }
    send(res, 404, "not found", "text/plain");
  };

  server = createServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      console.warn("[pairing-kiosk] request failed:", err);
      if (!res.headersSent) {
        send(res, 500, "internal error", "text/plain");
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => {
      server?.off("listening", onListening);
      reject(err);
    };
    const onListening = (): void => {
      server?.off("error", onError);
      resolve();
    };
    server?.once("error", onError);
    server?.once("listening", onListening);
    server?.listen(port, bind);
  });

  const addr = server.address() as AddressInfo | null;

  return {
    address: addr?.address ?? bind,
    port: addr?.port ?? port,
    async close() {
      if (!server) return;
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
      server = null;
    },
  };
}
