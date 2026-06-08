/**
 * Push notification dispatch for thin-client (EnvoyGo) devices.
 *
 * When a chat message arrives and the target thin-client device is
 * not connected via WebSocket, the home node dispatches a push
 * notification through platform-specific channels:
 *   - iOS: Apple Push Notification service (APNs)
 *   - Android: Firebase Cloud Messaging (FCM)
 *
 * This module is intentionally lightweight — production-grade
 * APNs HTTP/2 and FCM HTTP v1 dispatch requires platform-specific
 * credentials (APNs .p8 key, FCM service account JSON) configured
 * via environment variables.
 */

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

/**
 * Simple in-memory push token registry.
 *
 * In production, this should be persisted to a JSON file so tokens
 * survive node restarts.
 */
class PushTokenRegistry {
  private readonly tokens = new Map<string, PushTokenRecord>();

  register(params: {
    platform: string;
    token: string;
    ownerId: string;
    deviceId?: string;
  }): void {
    const deviceId = params.deviceId ?? params.token;
    this.tokens.set(deviceId, {
      deviceId,
      platform: (params.platform === "ios" ? "ios" : "android") as
        | "ios"
        | "android",
      token: params.token,
      ownerId: params.ownerId,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    });
  }

  getTokenForOwner(ownerId: string): PushTokenRecord | undefined {
    for (const record of this.tokens.values()) {
      if (record.ownerId === ownerId) return record;
    }
    return undefined;
  }

  listForOwner(ownerId: string): PushTokenRecord[] {
    return [...this.tokens.values()].filter(
      (r) => r.ownerId === ownerId,
    );
  }
}

/**
 * Push notification dispatcher.
 *
 * When a chat message arrives for an owner, checks if any of their
 * thin-client devices are offline (no active WS connection). If so,
 * dispatches a push notification.
 */
export class PushNotificationService {
  private readonly registry = new PushTokenRegistry();

  /** Register a push token for a thin-client device. */
  registerPushToken(params: {
    platform: string;
    token: string;
    ownerId: string;
  }): void {
    this.registry.register(params);
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
    const tokens = this.registry.listForOwner(params.targetOwnerId);
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
      await this._sendPush(record, { title, body, data });
    }
  }

  private async _sendPush(
    record: PushTokenRecord,
    payload: PushNotificationPayload,
  ): Promise<void> {
    if (record.platform === "ios") {
      // TODO(31I): APNs HTTP/2 dispatch
      // Requires: APNS_KEY_PATH, APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC env vars
      // const apns = new ApnsClient({ ... });
      // await apns.send(record.token, payload);
      console.log(
        `[push] Would send APNs to ${record.token}: ${payload.title}`,
      );
    } else {
      // TODO(31I): FCM HTTP v1 dispatch
      // Requires: FCM_SERVICE_ACCOUNT_JSON env var
      // const fcm = new FcmClient({ ... });
      // await fcm.send(record.token, payload);
      console.log(
        `[push] Would send FCM to ${record.token}: ${payload.title}`,
      );
    }
  }
}

/** Singleton instance. */
export const pushNotificationService = new PushNotificationService();
