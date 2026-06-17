/**
 * Push notification dispatch for thin-client (EnvoyGo) devices — Phase 31I.
 *
 * When a chat message arrives and the target thin-client device is not
 * connected via WebSocket, the home node dispatches a push notification
 * through platform-specific channels:
 *   - iOS: Apple Push Notification service (APNs) — native HTTP/2, no Firebase
 *   - Android: Firebase Cloud Messaging (FCM) HTTP v1
 *
 * Both backends are gated behind environment variables. When credentials
 * are absent, dispatch logs a warning and skips silently.
 *
 * Token persistence: push tokens are saved to `<profileDir>/push-tokens.json`
 * so they survive node restarts.
 */

import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import { connect as http2Connect, type ClientHttp2Session } from "node:http2";
import { request as httpsRequest } from "node:https";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface PushTokenRecord {
  deviceId: string;
  platform: "ios" | "android";
  token: string;
  ownerId: string;
  createdAt: string;
  lastUsedAt: string;
}

interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// --------------------------------------------------------------------------
// Token store (file-backed)
// --------------------------------------------------------------------------

class PushTokenStore {
  private tokens = new Map<string, PushTokenRecord>();
  private filePath: string | null = null;

  /** Load tokens from disk. Safe to call multiple times (idempotent). */
  async init(profileDir: string): Promise<void> {
    this.filePath = path.join(profileDir, "push-tokens.json");
    try {
      const raw = await fsPromises.readFile(this.filePath, "utf-8");
      const entries: PushTokenRecord[] = JSON.parse(raw);
      for (const e of entries) {
        this.tokens.set(e.deviceId, e);
      }
    } catch {
      // File doesn't exist yet — normal on first boot
    }
  }

  register(record: PushTokenRecord): void {
    this.tokens.set(record.deviceId, record);
    void this._persist();
  }

  unregister(deviceId: string): boolean {
    const deleted = this.tokens.delete(deviceId);
    if (deleted) void this._persist();
    return deleted;
  }

  listForOwner(ownerId: string): PushTokenRecord[] {
    return [...this.tokens.values()].filter((r) => r.ownerId === ownerId);
  }

  private async _persist(): Promise<void> {
    if (!this.filePath) return;
    try {
      const entries = [...this.tokens.values()];
      await fsPromises.writeFile(this.filePath, JSON.stringify(entries, null, 2), {
        mode: 0o600,
      });
    } catch {
      // Best-effort — don't crash the node on write failure
    }
  }
}

// --------------------------------------------------------------------------
// APNs (Apple Push Notification service) — iOS only
// --------------------------------------------------------------------------

/**
 * Sign a JWT for APNs using the ES256 private key (.p8 file).
 *
 * Required env vars:
 *   APNS_KEY_ID — the 10-character Key ID from the Apple Developer portal
 *   APNS_TEAM_ID — your Apple Developer Team ID
 *   APNS_KEY_PATH — path to the .p8 private key file
 *   APNS_TOPIC   — the app's bundle ID (e.g. com.envoymesh.EnvoyGo)
 */
function signApnsJwt(): string | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const keyPath = process.env.APNS_KEY_PATH;
  if (!keyId || !teamId || !keyPath) return null;

  let keyPem: string;
  try {
    keyPem = readFileSync(keyPath, "utf-8");
  } catch {
    return null;
  }

  const header = Buffer.from(
    JSON.stringify({ alg: "ES256", kid: keyId }),
  ).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(
    JSON.stringify({ iss: teamId, iat: now }),
  ).toString("base64url");

  const sign = crypto.createSign("SHA256");
  sign.update(`${header}.${claims}`);
  sign.end();
  const signature = sign.sign(keyPem).toString("base64url");

  return `${header}.${claims}.${signature}`;
}

async function sendApns(
  token: string,
  payload: PushNotificationPayload,
): Promise<void> {
  const jwt = signApnsJwt();
  const topic = process.env.APNS_TOPIC;
  if (!jwt || !topic) {
    console.warn("[push] APNs credentials not configured — skipping iOS push");
    return;
  }

  const isProd = !process.env.APNS_SANDBOX;
  const host = isProd
    ? "api.push.apple.com"
    : "api.sandbox.push.apple.com";

  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
      badge: 1,
    },
    ...(payload.data ? { data: payload.data } : {}),
  });

  return new Promise((resolve, reject) => {
    const client: ClientHttp2Session = http2Connect(`https://${host}`);
    client.on("error", (err: Error) => {
      console.warn(`[push] APNs error: ${err.message}`);
      reject(err);
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      "authorization": `bearer ${jwt}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-expiration": "0",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });

    req.on("response", (headers: Record<string, string | string[] | undefined>) => {
      const status = headers[":status"];
      if (status === "200") {
        resolve();
      } else {
        console.warn(`[push] APNs rejected: status=${String(status)}`);
        resolve();
      }
    });

    req.on("error", (err: Error) => {
      console.warn(`[push] APNs request error: ${err.message}`);
      resolve(); // Don't reject — network error shouldn't crash node
    });

    req.end(body);
    // Node http2 client auto-closes after response
    const _cleanup: ReturnType<typeof setTimeout> = setTimeout(() => client.close(), 10_000);
  });
}

// --------------------------------------------------------------------------
// FCM (Firebase Cloud Messaging) — Android only
// --------------------------------------------------------------------------

/**
 * FCM HTTP v1 dispatch using a service account JSON key.
 *
 * Required env vars:
 *   FCM_PROJECT_ID          — the Firebase project ID
 *   FCM_SERVICE_ACCOUNT_JSON — path to the service account JSON key file
 */
async function signFcmAccessToken(): Promise<string | null> {
  const keyPath = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!keyPath) return null;

  let key: { client_email: string; private_key: string };
  try {
    key = JSON.parse(readFileSync(keyPath, "utf-8"));
  } catch {
    return null;
  }

  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");

  const sign = crypto.createSign("SHA256");
  sign.update(`${header}.${claims}`);
  sign.end();
  const signature = sign.sign(key.private_key).toString("base64url");

  const assertion = `${header}.${claims}.${signature}`;

  // Exchange JWT for access token
  return new Promise((resolve) => {
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString();

    const req = httpsRequest(
      {
        hostname: "oauth2.googleapis.com",
        path: "/token",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve((parsed.access_token as string) ?? null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.end(body);
  });
}

async function sendFcm(
  token: string,
  payload: PushNotificationPayload,
): Promise<void> {
  const projectId = process.env.FCM_PROJECT_ID;
  const accessToken = await signFcmAccessToken();
  if (!projectId || !accessToken) {
    console.warn("[push] FCM credentials not configured — skipping Android push");
    return;
  }

  const body = JSON.stringify({
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data
        ? Object.fromEntries(
            Object.entries(payload.data).map(([k, v]) => [k, v]),
          )
        : undefined,
    },
  });

  return new Promise((resolve) => {
    const req = httpsRequest(
      {
        hostname: "fcm.googleapis.com",
        path: `/v1/projects/${projectId}/messages:send`,
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            console.warn(`[push] FCM rejected: status=${res.statusCode}`);
          }
          resolve();
        });
      },
    );
    req.on("error", (err) => {
      console.warn(`[push] FCM request error: ${err.message}`);
      resolve();
    });
    req.end(body);
  });
}

// --------------------------------------------------------------------------
// Push notification service
// --------------------------------------------------------------------------

export class PushNotificationService {
  private readonly store = new PushTokenStore();
  private initialized = false;

  /** Initialize the token store. Call once on node startup. */
  async init(profileDir: string): Promise<void> {
    await this.store.init(profileDir);
    this.initialized = true;
  }

  /** Register a push token for a thin-client device. */
  registerPushToken(params: {
    platform: string;
    token: string;
    ownerId: string;
    deviceId?: string;
  }): void {
    const platform = params.platform === "ios" ? "ios" : "android";
    const deviceId = params.deviceId ?? `${params.platform}-${params.token.slice(0, 12)}`;
    this.store.register({
      deviceId,
      platform,
      token: params.token,
      ownerId: params.ownerId,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    });
  }

  /** Unregister a push token. */
  unregisterPushToken(deviceId: string): boolean {
    return this.store.unregister(deviceId);
  }

  /**
   * Dispatch a push notification for an incoming chat message.
   *
   * Called by the chat delivery pipeline when the recipient's thin
   * client is not connected via WebSocket.
   */
  async dispatchChatPush(params: {
    senderName: string;
    messagePreview: string;
    targetOwnerId: string;
    messageId: string;
    threadType?: "direct" | "room";
    senderOwnerId?: string;
    roomId?: string;
  }): Promise<void> {
    if (!this.initialized) return;

    const tokens = this.store.listForOwner(params.targetOwnerId);
    if (tokens.length === 0) return;

    const title = params.senderName || "New message";
    const body =
      params.messagePreview.length > 120
        ? params.messagePreview.substring(0, 117) + "..."
        : params.messagePreview;

    const data: Record<string, string> = {
      threadType: params.threadType ?? "direct",
      messageId: params.messageId,
    };
    if (params.senderOwnerId) data.senderOwnerId = params.senderOwnerId;
    if (params.roomId) data.roomId = params.roomId;

    for (const record of tokens) {
      if (record.platform === "ios") {
        await sendApns(record.token, { title, body, data });
      } else {
        await sendFcm(record.token, { title, body, data });
      }
    }
  }

  /**
   * Dispatch a push notification for a bond request.
   */
  async dispatchBondPush(params: {
    senderName: string;
    targetOwnerId: string;
  }): Promise<void> {
    if (!this.initialized) return;

    const tokens = this.store.listForOwner(params.targetOwnerId);
    if (tokens.length === 0) return;

    for (const record of tokens) {
      if (record.platform === "ios") {
        await sendApns(record.token, {
          title: "New contact request",
          body: `${params.senderName} wants to connect`,
          data: { type: "bond_request" },
        });
      } else {
        await sendFcm(record.token, {
          title: "New contact request",
          body: `${params.senderName} wants to connect`,
          data: { type: "bond_request" },
        });
      }
    }
  }
}

/** Singleton instance. */
export const pushNotificationService = new PushNotificationService();
