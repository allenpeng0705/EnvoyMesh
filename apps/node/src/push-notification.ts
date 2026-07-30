/**
 * Push notification dispatch for thin-client (EnvoyGo) devices — Phase 31I,
 * extended in Phase 42I for VoIP call pushes.
 *
 * When a chat message arrives and the target thin-client device is not
 * connected via WebSocket, the home node dispatches a push notification
 * through platform-specific channels:
 *   - iOS: Apple Push Notification service (APNs) — native HTTP/2, no Firebase
 *   - Android: Firebase Cloud Messaging (FCM) HTTP v1
 *
 * Credentials are loaded from two sources (checked in order):
 *   1. Environment variables (APNS_KEY_ID, FCM_PROJECT_ID, …) — preferred
 *      for dev (`npm run node:dev`) and Docker.
 *   2. `<profileDir>/push-config.json` — a static config file for packaged
 *      builds (DMG/exe) where env vars aren't available. See
 *      `push-config.example.json` for the template.
 *
 * When credentials are absent from both sources, dispatch logs a warning
 * and skips silently.
 *
 * Token persistence: push tokens are saved to `<profileDir>/push-tokens.json`
 * so they survive node restarts.
 *
 * Phase 42I — VoIP pushes (`tokenType: "voip"`) use a separate APNs topic
 * (typically `<bundle>.voip`) and the `apns-push-type: voip` header so iOS
 * can wake the app and surface a CallKit screen even when backgrounded.
 * The `apns-push-type: alert` path remains in use for chat / bond pushes.
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
  /**
   * Phase 42I — discriminator between alert (chat / bond) and VoIP
   * (backgrounded call) tokens. iOS issues a separate VoIP token via
   * `PKPushRegistry`; storing it on the same row lets the home pick
   * the right channel for the right event.
   */
  tokenType: "alert" | "voip";
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
        // Phase 42I — backfill `tokenType` for records written by
        // older node builds (pre-42I). All alert tokens are equivalent
        // for dispatch purposes; missing field means "alert".
        const migrated: PushTokenRecord = {
          ...e,
          tokenType: e.tokenType === "voip" ? "voip" : "alert",
        };
        this.tokens.set(migrated.deviceId, migrated);
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

  /** Diagnostic: how many tokens are loaded (any owner). */
  size(): number {
    return this.tokens.size;
  }

  private async _persist(): Promise<void> {
    if (!this.filePath) {
      console.warn(
        "[push] token store not initialized — register will not persist until init(profileDir)",
      );
      return;
    }
    try {
      const entries = [...this.tokens.values()];
      await fsPromises.writeFile(this.filePath, JSON.stringify(entries, null, 2), {
        mode: 0o600,
      });
      console.log(`[push] wrote ${entries.length} token(s) → ${this.filePath}`);
    } catch (err) {
      console.warn(
        `[push] failed to persist tokens: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

// --------------------------------------------------------------------------
// Push credential loading — env vars first, then push-config.json fallback
// --------------------------------------------------------------------------

/**
 * Shape of the optional `push-config.json` file in the profile dir.
 * Used by packaged builds (DMG/exe) where env vars aren't available.
 * See `push-config.example.json` for a template.
 */
interface PushConfig {
  apns?: {
    keyId?: string
    teamId?: string
    keyPath?: string
    topic?: string
    voipTopic?: string
    sandbox?: boolean
  }
  fcm?: {
    projectId?: string
    serviceAccountJsonPath?: string
  }
}

let _pushConfig: PushConfig | null = null
let _pushConfigProfileDir: string | null = null

/**
 * Load push credentials. Checks locations in priority order:
 *   1. `<profileDir>/push-config.json` — user-managed override (post-install edit)
 *   2. `<bundleDir>/push-config.json` — bundled at build time (DMG/exe)
 *   3. `<repoRoot>/push-config.json` — dev mode (just drop at repo root)
 *
 * The source dir is stored as _pushConfigProfileDir for relative-path
 * resolution of .p8 / service-account files. So 'AuthKey.p8' resolves
 * against whichever dir the config was found in — works in dev, DMG,
 * and AppImage identically.
 *
 * Called once during PushNotificationService.init(). If no file is found
 * in any location, _pushConfig stays null (env vars are the only source).
 */
async function loadPushConfig(profileDir: string): Promise<void> {
  // 1. Profile dir (user override — highest priority after env vars)
  const profileConfigPath = path.join(profileDir, "push-config.json")
  try {
    const raw = await fsPromises.readFile(profileConfigPath, "utf-8")
    _pushConfig = JSON.parse(raw)
    _pushConfigProfileDir = profileDir
    console.log("[push] Loaded credentials from push-config.json (profile dir)")
    return
  } catch {
    // Not in profile dir — check the bundle dir.
  }

  // 2. Bundle dir (staged at build time by the operator)
  const bundleDir = process.env.ENVOYMESH_NODE_BUNDLE_DIR?.trim()
  if (bundleDir) {
    const bundleConfigPath = path.join(bundleDir, "push-config.json")
    try {
      const raw = await fsPromises.readFile(bundleConfigPath, "utf-8")
      _pushConfig = JSON.parse(raw)
      _pushConfigProfileDir = bundleDir
      console.log("[push] Loaded credentials from push-config.json (bundle dir)")
      return
    } catch {
      // Not in bundle dir either.
    }
  }

  // 3. Repo root (dev mode — just drop push-config.json + .p8 at repo root)
  // Walk up from the current working directory to find a push-config.json.
  // In dev (`npm run node:dev`), the cwd is the repo root (or apps/node —
  // try both). This means the operator/dev puts ONE set of files at the
  // repo root and it works for both dev AND build-time staging.
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), "..", ".."), // apps/node → repo root
    path.resolve(process.cwd(), ".."),       // apps/node → apps → may also be repo
  ]
  for (const candidate of candidates) {
    const candidatePath = path.join(candidate, "push-config.json")
    try {
      const raw = await fsPromises.readFile(candidatePath, "utf-8")
      _pushConfig = JSON.parse(raw)
      _pushConfigProfileDir = candidate
      console.log(`[push] Loaded credentials from push-config.json (${candidate})`)
      return
    } catch {
      // Not here — try next candidate.
    }
  }

  // No config file found — env vars are the only source.
}

/**
 * Resolve a file path from push-config.json. Supports both absolute and
 * relative paths:
 *   - Absolute (`/secure/AuthKey.p8`): used as-is.
 *   - Relative (`AuthKey.p8`): resolved against the profile dir, so the
 *     user can drop the .p8 / service-account JSON next to push-config.json
 *     and reference it by filename. Works identically in dev (./data/default/),
 *     Tauri macOS (~/Library/Application Support/EnvoyMesh/profile/), etc.
 */
function resolvePushPath(p: string | undefined): string | undefined {
  if (!p) return undefined
  if (path.isAbsolute(p)) return p
  // Relative: resolve against the profile dir.
  if (!_pushConfigProfileDir) return p
  return path.resolve(_pushConfigProfileDir, p)
}

/**
 * Read a push credential value. Checks env var first, then push-config.json.
 * This is the single entry point for all credential reads — callers don't
 * need to know whether the value came from an env var or the config file.
 */
function pushCredential(envVar: string, section: "apns" | "fcm", key: string): string | undefined {
  // 1. Env var (preferred for dev + Docker)
  const envVal = process.env[envVar]
  if (envVal && envVal.trim()) return envVal.trim()
  // 2. Config file fallback (for packaged builds)
  const sectionData = _pushConfig?.[section]
  if (sectionData) {
    const val = (sectionData as Record<string, unknown>)[key]
    if (typeof val === "string" && val.trim()) return val.trim()
  }
  return undefined
}

/** Convenience for the APNS_SANDBOX boolean (config file stores a boolean). */
function pushSandbox(): boolean {
  const envVal = process.env.APNS_SANDBOX
  if (envVal !== undefined) {
    const v = envVal.trim().toLowerCase()
    return v === "1" || v === "true" || v === "yes"
  }
  const configVal = _pushConfig?.apns?.sandbox
  return configVal ?? false
}

// --------------------------------------------------------------------------
// APNs (Apple Push Notification service) — iOS only
// --------------------------------------------------------------------------

function signApnsJwt(): string | null {
  const keyId = pushCredential("APNS_KEY_ID", "apns", "keyId")
  const teamId = pushCredential("APNS_TEAM_ID", "apns", "teamId")
  const keyPath = resolvePushPath(pushCredential("APNS_KEY_PATH", "apns", "keyPath"))
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
): Promise<number | undefined> {
  const jwt = signApnsJwt();
  const topic = pushCredential("APNS_TOPIC", "apns", "topic");
  if (!jwt || !topic) {
    console.warn("[push] APNs credentials not configured — skipping iOS push");
    return;
  }

  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
      badge: 1,
    },
    ...(payload.data ? { data: payload.data } : {}),
  });

  return dispatchApnsHttp2({
    token,
    topic,
    pushType: "alert",
    jwt,
    body,
    logTag: "APNs",
  });
}

/**
 * Phase 42I — VoIP push for backgrounded call invites.
 *
 * Differences from `sendApns`:
 *   - The APNs `topic` is the VoIP-specific bundle suffix (`.voip`),
 *     configured via `APNS_VOIP_TOPIC`. Apple requires a separate topic
 *     for VoIP pushes and rejects regular alert pushes to it.
 *   - The `apns-push-type` header is `voip` (not `alert`), which lets
 *     iOS deliver the push even when the app is terminated and wake
 *     the `PKPushRegistry` delegate so the app can show a CallKit
 *     screen via `flutter_callkit_incoming`.
 *   - The payload omits `aps.alert`; VoIP pushes use a `aps` dict with
 *     only a marker key and the call metadata in the top-level `data`.
 */
async function sendVoipPush(
  token: string,
  payload: PushNotificationPayload,
): Promise<void> {
  const jwt = signApnsJwt();
  // Prefer the explicit VoIP topic; fall back to the alert topic with
  // `.voip` appended (a common convention) so operators don't have to
  // set two env vars for a single bundle.
  const alertTopic = pushCredential("APNS_TOPIC", "apns", "topic")
  const explicitVoipTopic = pushCredential("APNS_VOIP_TOPIC", "apns", "voipTopic")
  const topic = explicitVoipTopic ?? (alertTopic ? `${alertTopic}.voip` : undefined);
  if (!jwt || !topic) {
    console.warn("[push] APNs VoIP topic not configured — skipping iOS VoIP push");
    return;
  }

  // VoIP pushes use a stripped-down APS payload. The iOS app reads
  // `data.callId` and `data.callerOwnerId` from the userInfo to start
  // the in-app call flow.
  const body = JSON.stringify({
    aps: { voip: 1 },
    data: payload.data ?? {},
  });

  await dispatchApnsHttp2({
    token,
    topic,
    pushType: "voip",
    jwt,
    body,
    logTag: "APNs-VoIP",
  });
}

/**
 * Shared HTTP/2 transport for both `sendApns` and `sendVoipPush`.
 * Split out so the two functions stay focused on payload shape and
 * header differences — every other concern (host, JWT, error
 * swallowing) is identical.
 */
async function dispatchApnsHttp2(args: {
  token: string;
  topic: string;
  pushType: "alert" | "voip";
  jwt: string;
  body: string;
  logTag: string;
}): Promise<number | undefined> {
  const isProd = !pushSandbox()
  const host = isProd ? "api.push.apple.com" : "api.sandbox.push.apple.com";

  return new Promise((resolve) => {
    const client: ClientHttp2Session = http2Connect(`https://${host}`);
    client.on("error", (err: Error) => {
      console.warn(`[push] ${args.logTag} error: ${err.message}`);
      resolve(undefined);
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${args.token}`,
      "authorization": `bearer ${args.jwt}`,
      "apns-topic": args.topic,
      "apns-push-type": args.pushType,
      "apns-expiration": "0",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(args.body),
    });

    req.on("response", (headers: Record<string, string | string[] | undefined>) => {
      const status = headers[":status"];
      if (status !== "200") {
        console.warn(`[push] ${args.logTag} rejected: status=${String(status)}`);
      }
      resolve(typeof status === "number" ? status : undefined);
    });

    req.on("error", (err: Error) => {
      console.warn(`[push] ${args.logTag} request error: ${err.message}`);
      resolve(undefined);
    });

    req.end(args.body);
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
  const keyPath = resolvePushPath(pushCredential("FCM_SERVICE_ACCOUNT_JSON", "fcm", "serviceAccountJsonPath"))
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
): Promise<number | undefined> {
  const projectId = pushCredential("FCM_PROJECT_ID", "fcm", "projectId")
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
          resolve(res.statusCode);
        });
      },
    );
    req.on("error", (err) => {
      console.warn(`[push] FCM request error: ${err.message}`);
      resolve(undefined);
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
  /** Shared so concurrent init() calls and dispatch can await readiness. */
  private initPromise: Promise<void> | null = null;

  /** Initialize the token store + load push-config.json. Call once on startup. */
  async init(profileDir: string): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      await this.store.init(profileDir);
      await loadPushConfig(profileDir);
      this.initialized = true;
      console.log("[push] Push notification service ready");
    })();
    return this.initPromise;
  }

  private async ensureReady(): Promise<boolean> {
    if (this.initPromise) {
      try {
        await this.initPromise;
      } catch {
        return false;
      }
    }
    return this.initialized;
  }

  /** Register a push token for a thin-client device. */
  registerPushToken(params: {
    platform: string;
    token: string;
    ownerId: string;
    deviceId?: string;
    /**
     * Phase 42I — discriminator between alert (chat / bond) and VoIP
     * (backgrounded call) tokens. Defaults to "alert" so older
     * EnvoyGo builds (pre-42I) keep working without a code change.
     * The `deviceId` is namespaced by tokenType so the same physical
     * device can register both an alert and a VoIP token without
     * one overwriting the other.
     */
    tokenType?: "alert" | "voip";
  }): void {
    const platform = params.platform === "ios" ? "ios" : "android";
    const tokenType: "alert" | "voip" = params.tokenType === "voip" ? "voip" : "alert";
    // Use the full token in the synthetic deviceId so two devices
    // whose tokens share a prefix don't collide on the map key. Real
    // APNs/FCM tokens are 64+ hex chars; the synthetic id is internal
    // to the node and never leaves it.
    const deviceId =
      params.deviceId ?? `${params.platform}-${tokenType}-${params.token}`;
    this.store.register({
      deviceId,
      platform,
      token: params.token,
      ownerId: params.ownerId,
      tokenType,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    });
  }

  /** Unregister a push token. */
  unregisterPushToken(deviceId: string): boolean {
    return this.store.unregister(deviceId);
  }

  /**
   * Phase 42I — list every push token registered for an owner.
   * Exposed for diagnostics + tests; production code should use
   * `dispatchChatPush` / `dispatchCallPush` rather than reading
   * the store directly.
   */
  listForOwner(ownerId: string): PushTokenRecord[] {
    return this.store.listForOwner(ownerId);
  }

  /**
   * Phase 50 — send to one token, then clean up if the push service
   * reports the token as invalid (APNs 410 Unregistered / 400 BadDeviceToken;
   * FCM 404 / 400 with UNREGISTERED error).
   *
   * Stale tokens otherwise accumulate in push-tokens.json indefinitely,
   * wasting a round-trip per dispatch. The OpenClaw gateway push path
   * already has this cleanup (`shouldClearStoredApnsRegistration`); this
   * mirrors it for the home-node → EnvoyGo path.
   */
  private async sendAndCleanup(
    record: PushTokenRecord,
    payload: PushNotificationPayload,
  ): Promise<void> {
    const status = record.platform === "ios"
      ? await sendApns(record.token, payload)
      : await sendFcm(record.token, payload);
    // APNs: 410 = Unregistered (device uninstalled app or token expired).
    //       400 is ambiguous — could be BadDeviceToken OR BadJSONPayload
    //       (our fault, not the token's). Only unregister on 410 to avoid
    //       dropping a valid token when the payload itself was malformed.
    //       403 = BadCertificate (cert/key mismatch — not a token problem).
    // FCM:  404 = registration-token-not-found / UNREGISTERED.
    //       400 = INVALID_ARGUMENT (bad token format — IS a token problem).
    //       (FCM 400 is always token-related, unlike APNs 400.)
    const shouldUnregister =
      status === 410 ||                    // APNs + FCM: token expired/not found
      (record.platform === "android" && status === 400);  // FCM: bad token format
    if (shouldUnregister) {
      console.log(
        `[push] token ${record.deviceId} returned status=${status} — unregistering`,
      );
      this.store.unregister(record.deviceId);
    }
  }

  /**
   * Dispatch a push notification for an incoming chat message.
   *
   * Called by the chat delivery pipeline when the recipient's thin
   * client is not connected via WebSocket.
   *
   * Only `tokenType: "alert"` records are targeted — VoIP tokens use a
   * different APNs topic and must not receive chat alerts.
   */
  async dispatchChatPush(params: {
    senderName: string;
    messagePreview: string;
    targetOwnerId: string;
    messageId: string;
    threadType?: "direct" | "room" | "external" | "envoyai" | "bot";
    senderOwnerId?: string;
    roomId?: string;
    /** Optional deep-link type (e.g. `pi_proposal`). */
    type?: string;
  }): Promise<void> {
    if (!(await this.ensureReady())) {
      console.warn(
        "[push] dispatchChatPush skipped — push service not initialized (no profileDir init?)",
      );
      return;
    }

    const tokens = this.store
      .listForOwner(params.targetOwnerId)
      .filter((r) => r.tokenType === "alert");
    if (tokens.length === 0) {
      console.warn(
        `[push] dispatchChatPush: no alert tokens for owner=${params.targetOwnerId}`,
      );
      return;
    }

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
    if (params.type) data.type = params.type;
    // Include senderName so the client can display it in the chat header
    // when deep-linking from a push tap (before the thread loads).
    if (params.senderName) data.senderName = params.senderName;

    for (const record of tokens) {
      await this.sendAndCleanup(record, { title, body, data });
    }
  }

  /**
   * Dispatch a push notification for a bond request.
   */
  async dispatchBondPush(params: {
    senderName: string;
    targetOwnerId: string;
    /** Phase 50 — requester ownerId for deep-link routing (optional). */
    senderOwnerId?: string;
  }): Promise<void> {
    if (!(await this.ensureReady())) return;

    const tokens = this.store
      .listForOwner(params.targetOwnerId)
      .filter((r) => r.tokenType === "alert");
    if (tokens.length === 0) return;

    for (const record of tokens) {
      await this.sendAndCleanup(record, {
        title: "New contact request",
        body: `${params.senderName} wants to connect`,
        data: {
          type: "bond_request",
          ...(params.senderOwnerId ? { senderOwnerId: params.senderOwnerId } : {}),
        },
      });
    }
  }

  /**
   * Phase 50 — Dispatch an alert push for a new approval-queue item.
   *
   * Targets `tokenType: "alert"` only. Payload carries `type: approval`
   * plus the item id + title so EnvoyGo can open the approval card on tap.
   */
  async dispatchApprovalPush(params: {
    targetOwnerId: string;
    title: string;
    body: string;
    /** Approval item id for deep-link routing. */
    itemId?: string;
  }): Promise<void> {
    if (!(await this.ensureReady())) return;

    const tokens = this.store
      .listForOwner(params.targetOwnerId)
      .filter((r) => r.tokenType === "alert");
    if (tokens.length === 0) return;

    for (const record of tokens) {
      const data: Record<string, string> = { type: "approval" };
      if (params.itemId) data.itemId = params.itemId;
      await this.sendAndCleanup(record, {
        title: params.title,
        body: params.body,
        data,
      });
    }
  }

  /**
   * Phase 45E — Dispatch an alert push for an inbound `feed.notify`.
   *
   * Targets `tokenType: "alert"` only. Payload carries `type: feed_notify`
   * plus url/title so EnvoyGo can open Browser on tap.
   */
  async dispatchFeedPush(params: {
    targetOwnerId: string;
    title: string;
    summary?: string;
    url: string;
    notificationId: string;
    publisherOwnerId?: string;
    kind?: string;
  }): Promise<void> {
    if (!(await this.ensureReady())) return;

    const tokens = this.store
      .listForOwner(params.targetOwnerId)
      .filter((r) => r.tokenType === "alert");
    if (tokens.length === 0) return;

    const title = params.title || "New published content";
    const bodyRaw = params.summary?.trim() || params.url;
    const body =
      bodyRaw.length > 120 ? bodyRaw.substring(0, 117) + "..." : bodyRaw;

    const data: Record<string, string> = {
      type: "feed_notify",
      url: params.url,
      title: params.title,
      notificationId: params.notificationId,
    };
    if (params.publisherOwnerId) data.publisherOwnerId = params.publisherOwnerId;
    if (params.kind) data.kind = params.kind;

    for (const record of tokens) {
      await this.sendAndCleanup(record, { title, body, data });
    }
  }

  /**
   * Phase 42I — Dispatch a VoIP push for an incoming call invite.
   *
   * Called by the call path when the callee's thin-client device is
   * not connected via WebSocket. The push wakes the iOS app via
   * `PKPushRegistry` and surfaces a CallKit screen via
   * `flutter_callkit_incoming`. Android uses FCM with a high-priority
   * message (no separate "VoIP" channel exists on FCM).
   *
   * - iOS: dispatches to `tokenType: "voip"` records only, using the
   *   `APNS_VOIP_TOPIC` (or `${APNS_TOPIC}.voip` fallback) and
   *   `apns-push-type: voip`. The payload uses the `{ aps: { voip: 1 } }`
   *   shape that iOS expects for VoIP pushes.
   * - Android: dispatches via the regular FCM path with a `type: call`
   *   marker in `data`. FCM's high-priority tier is what triggers the
   *   full-screen incoming-call intent.
   *
   * Records with `tokenType: "alert"` (older EnvoyGo builds, or devices
   * where VoIP is disabled) are intentionally skipped — a regular alert
   * push cannot wake a CallKit screen, so it's better to do nothing
   * than to confuse the user with a chat-style notification.
   */
  async dispatchCallPush(params: {
    callerName: string;
    targetOwnerId: string;
    callId: string;
    callerOwnerId: string;
  }): Promise<void> {
    if (!(await this.ensureReady())) return;

    const tokens = this.store.listForOwner(params.targetOwnerId);
    if (tokens.length === 0) return;

    const data: Record<string, string> = {
      type: "call",
      callId: params.callId,
      callerOwnerId: params.callerOwnerId,
    };
    const title = "Incoming call";
    const body = params.callerName || "EnvoyMesh call";

    for (const record of tokens) {
      if (record.platform === "ios" && record.tokenType === "voip") {
        await sendVoipPush(record.token, { title, body, data });
      } else if (record.platform === "android") {
        // Android has no separate VoIP channel — use FCM with a
        // high-priority hint so the system surfaces a full-screen
        // intent. The `type: call` marker lets EnvoyGo start the
        // in-app call flow when the user taps through.
        await this.sendAndCleanup(record, {
          title,
          body,
          data: { ...data, priority: "high" },
        });
      }
      // iOS + alert tokens: skipped (see method doc).
    }
  }
}

/** Singleton instance. */
export const pushNotificationService = new PushNotificationService();
