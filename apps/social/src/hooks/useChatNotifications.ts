import { useEffect } from "react";
import {
  OWNER_FAMILY_PROFILE_ID,
  type BondRecord,
  type ChatMessage,
  type ChatRoomMessageEvent,
} from "@envoymesh/api";
import type { NodeServiceClient } from "./useNodeService.js";
import { MESSAGES } from "../i18n/messages/index.js";
import { translate, type TranslateParams } from "../i18n/translate.js";
import { normalizeLocale, type LocaleId } from "../i18n/types.js";
import {
  isChatMessageVisibleToProfile,
  messageIsOutgoing,
} from "../lib/chat-visibility.js";

/**
 * Localized chat message preview for the desktop / browser notification
 * body. Locale is passed in (not via useI18n / useNodeState) because this
 * hook runs inside NodeStateProvider — above I18nProvider and before the
 * NodeState context value is published to consumers.
 */
function chatMessagePreview(
  localeKey: LocaleId,
  msg: ChatMessage,
): string {
  const text = msg.content?.text;
  if (typeof text === "string" && text.trim()) {
    return text.trim().slice(0, 200);
  }
  if (msg.content?.attachments?.length) {
    return translate(MESSAGES[localeKey], "chatNotifications.sentAFile", "Sent a file");
  }
  return translate(MESSAGES[localeKey], "chatNotifications.newMessage", "New chat message");
}

function tr(
  localeKey: LocaleId,
  key: string,
  fallback: string,
  params?: TranslateParams,
): string {
  return translate(MESSAGES[localeKey], key, fallback, params);
}

/** Desktop/browser notifications for inbound chat when the tab is in the background. */
export function useChatNotifications(opts: {
  enabled: boolean;
  nodeService: NodeServiceClient;
  wsOpen: boolean;
  bonds: BondRecord[];
  peerId: string;
  /** Mesh owner id — improves thread routing for visibility checks. */
  selfOwnerId?: string;
  /** Family profile for this session (mom/dad/owner). Defaults to owner desktop. */
  familyProfileId?: string;
  /** App locale (from NodeStateProvider appSettings — do not use useNodeState here). */
  locale?: string;
}) {
  const { enabled, nodeService, wsOpen, bonds, peerId, selfOwnerId } = opts;
  const localeKey: LocaleId = normalizeLocale(opts.locale);
  const familyProfileId =
    opts.familyProfileId?.trim() || OWNER_FAMILY_PROFILE_ID;

  useEffect(() => {
    if (!enabled || !wsOpen) return;

    const maybeNotify = (msg: ChatMessage) => {
      if (msg.metadata?.deliveryReceipt === "sent") return;
      if (
        messageIsOutgoing(
          msg,
          selfOwnerId ?? "",
          peerId,
          familyProfileId,
        )
      ) {
        return;
      }
      // Never notify for other family profiles' threads (Dad↔Mom, etc.).
      if (
        !isChatMessageVisibleToProfile(msg, {
          familyProfileId,
          selfOwnerId,
          selfPeerId: peerId,
        })
      ) {
        return;
      }
      if (typeof document !== "undefined" && !document.hidden) return;
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;

      const isBonded = bonds.some(
        (b) =>
          b.peerOwnerId === msg.sender.ownerId ||
          (b.displayName && b.displayName === msg.sender.displayName),
      );
      const title = isBonded
        ? (msg.sender.displayName ?? tr(localeKey, "chatNotifications.contactFallback", "Contact"))
        : (msg.sender.displayName ?? tr(localeKey, "chatNotifications.strangerFallback", "Stranger"));
      try {
        new Notification(title, {
          body: chatMessagePreview(localeKey, msg),
          tag: msg.messageId,
        });
      } catch {
        /* ignore — e.g. insecure context */
      }
    };

    const unsub = nodeService.on("chat:message", (data) => {
      maybeNotify(data as ChatMessage);
    });
    const unsubRoom = nodeService.on("chat:room-message", (data) => {
      maybeNotify((data as ChatRoomMessageEvent).message);
    });

    return () => {
      unsub();
      unsubRoom();
    };
  }, [enabled, wsOpen, nodeService, bonds, peerId, selfOwnerId, localeKey, familyProfileId]);
}
