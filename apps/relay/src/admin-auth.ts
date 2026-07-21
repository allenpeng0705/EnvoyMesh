/**
 * HTTP Basic Auth for the relay admin UI and sensitive JSON endpoints.
 */
import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface AdminCredentials {
  user: string;
  password: string;
}

export function adminCredentialsConfigured(creds: {
  adminUser: string;
  adminPassword: string;
}): AdminCredentials | null {
  const user = creds.adminUser.trim();
  const password = creds.adminPassword;
  if (!user || !password) return null;
  return { user, password };
}

function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Still do a compare to reduce timing signal on length alone.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export function parseBasicAuthHeader(
  header: string | undefined,
): { user: string; password: string } | null {
  if (!header) return null;
  const m = /^Basic\s+(\S+)$/i.exec(header.trim());
  if (!m) return null;
  try {
    const decoded = Buffer.from(m[1], "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    if (colon < 0) return null;
    return {
      user: decoded.slice(0, colon),
      password: decoded.slice(colon + 1),
    };
  } catch {
    return null;
  }
}

export function checkBasicAuth(
  req: IncomingMessage,
  creds: AdminCredentials,
): boolean {
  const parsed = parseBasicAuthHeader(req.headers.authorization);
  if (!parsed) return false;
  return (
    safeEqualString(parsed.user, creds.user) &&
    safeEqualString(parsed.password, creds.password)
  );
}

export function sendUnauthorized(res: ServerResponse, realm = "EnvoyMesh Relay Admin"): void {
  res.writeHead(401, {
    "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"`,
  });
  res.end("Unauthorized");
}

/** Paths that expose operator-sensitive relay state when admin creds are set. */
export function isSensitiveRelayHttpPath(pathname: string): boolean {
  if (pathname === "/info") return true;
  if (pathname === "/version") return true;
  if (pathname === "/protocols") return true;
  if (pathname === "/reservations") return true;
  if (pathname === "/reservations/inspect") return true;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  return false;
}

export function requiresAdminAuth(
  pathname: string,
  creds: AdminCredentials | null,
): boolean {
  if (!creds) {
    // Fail closed for /admin when credentials are not configured.
    return pathname === "/admin" || pathname.startsWith("/admin/");
  }
  return isSensitiveRelayHttpPath(pathname);
}
