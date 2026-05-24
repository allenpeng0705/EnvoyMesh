import { useEffect } from "react";
import type { BondRecord, ChatMessage } from "@envoymesh/api";
import type { NodeServiceClient } from "./useNodeService.js";

function chatMessagePreview(msg: ChatMessage): string {
  const text = msg.content?.text;
  if (typeof text === "string" && text.trim()) {
    return text.trim().slice(0, 200);
  }
  if (msg.content?.attachments?.length) {
    return "Sent a file";
  }
  return "New chat message";
}

/** Desktop/browser notifications for inbound chat when the tab is in the background. */
export function useChatNotifications(opts: {
  enabled: boolean;
  nodeService: NodeServiceClient;
  wsOpen: boolean;
  bonds: BondRecord[];
  peerId: string;
}) {
  const { enabled, nodeService, wsOpen, bonds, peerId } = opts;

  useEffect(() => {
    if (!enabled || !wsOpen) return;

    const unsub = nodeService.on("chat:message", (data) => {
      const msg = data as ChatMessage;
      if (msg.metadata?.deliveryReceipt === "sent") return;
      if (peerId && msg.sender.nodeId === peerId) return;
      if (typeof document !== "undefined" && !document.hidden) return;
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;

      const isBonded = bonds.some(
        (b) =>
          b.peerOwnerId === msg.sender.ownerId ||
          (b.displayName && b.displayName === msg.sender.displayName),
      );
      const title = isBonded
        ? (msg.sender.displayName ?? "Contact")
        : (msg.sender.displayName ?? "Stranger");
      try {
        new Notification(title, {
          body: chatMessagePreview(msg),
          tag: msg.messageId,
        });
      } catch {
        /* ignore — e.g. insecure context */
      }
    });

    return unsub;
  }, [enabled, wsOpen, nodeService, bonds, peerId]);
}
