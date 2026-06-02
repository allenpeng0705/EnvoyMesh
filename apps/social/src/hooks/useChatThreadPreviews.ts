import { useEffect, useMemo, useState } from "react";
import { useNodeState } from "../context/NodeStateContext.js";
import { useNodeService } from "./useNodeService.js";
import type { ChatMessage, ChatRoomMessageEvent } from "@envoymesh/api";
import { isChatRoomThreadKey } from "@envoymesh/api";

export interface ThreadPreview {
  text: string;
  timeLabel: string;
  /** Latest message time (for sidebar sort). */
  timestampMs: number;
}

function latestMessage(msgs: ChatMessage[]): ChatMessage | undefined {
  if (msgs.length === 0) return undefined;
  return msgs.reduce((a, b) => {
    const ta = new Date(a.metadata.timestamp).getTime();
    const tb = new Date(b.metadata.timestamp).getTime();
    return tb >= ta ? b : a;
  });
}

function formatPreview(text: string, max = 52): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}\u2026`;
}

/** Other party's owner id in a 1:1 thread (requires self owner id when both sides have one). */
function threadPeerOwnerId(msg: ChatMessage, selfOwnerId: string | undefined): string | null {
  const so = msg.sender.ownerId;
  const ro = msg.recipient.ownerId;
  if (selfOwnerId) {
    if (so && so !== selfOwnerId) return so;
    if (ro && ro !== selfOwnerId) return ro;
    return so ?? ro ?? null;
  }
  return so ?? ro ?? null;
}

/** Thread key for preview map — bonded owner id or `room:{uuid}`. */
function previewThreadKey(msg: ChatMessage, selfOwnerId: string | undefined): string | null {
  const rcvO = msg.recipient.ownerId?.trim();
  if (rcvO && isChatRoomThreadKey(rcvO)) return rcvO;
  return threadPeerOwnerId(msg, selfOwnerId);
}

function formatThreadTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (today.getTime() - day.getTime()) / 86400000;
  if (diff === 0) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Loads last message snippet + time per bonded peer thread for sidebar / mobile chat rows.
 */
export function useChatThreadPreviews(peerOwnerIds: readonly string[]): Record<string, ThreadPreview> {
  const nodeService = useNodeService();
  const { humanProfile } = useNodeState();
  const selfOwnerId = humanProfile?.ownerId;

  /** Stable string key — avoids re-fetch / re-subscribe when parent passes a new array with same ids. */
  const peerIdsKey = [...peerOwnerIds].sort().join("\0");
  const peerIdSet = useMemo(
    () => new Set(peerIdsKey ? peerIdsKey.split("\0") : []),
    [peerIdsKey],
  );

  const [previews, setPreviews] = useState<Record<string, ThreadPreview>>({});

  useEffect(() => {
    let cancelled = false;
    if (peerIdSet.size === 0) {
      setPreviews({});
      return;
    }
    const ids = [...peerIdSet];
    void (async () => {
      const next: Record<string, ThreadPreview> = {};
      await Promise.all(
        ids.map(async (pid) => {
          try {
            const msgs = await nodeService.listChatHistory(pid, 48);
            const last = latestMessage(msgs);
            if (!last) return;
            next[pid] = {
              text: formatPreview(last.content?.text ?? ""),
              timeLabel: formatThreadTime(last.metadata.timestamp),
              timestampMs: new Date(last.metadata.timestamp).getTime(),
            };
          } catch {
            /* ignore per-peer errors */
          }
        }),
      );
      if (!cancelled) setPreviews(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [nodeService, peerIdsKey]);

  useEffect(() => {
    const applyPreview = (msg: ChatMessage) => {
      const peer = previewThreadKey(msg, selfOwnerId);
      if (!peer || !peerIdSet.has(peer)) return;
      setPreviews((prev) => ({
        ...prev,
        [peer]: {
          text: formatPreview(msg.content?.text ?? ""),
          timeLabel: formatThreadTime(msg.metadata.timestamp),
          timestampMs: new Date(msg.metadata.timestamp).getTime(),
        },
      }));
    };
    const unsub = nodeService.on("chat:message", applyPreview);
    const unsubRoom = nodeService.on("chat:room-message", (data) => {
      applyPreview((data as ChatRoomMessageEvent).message);
    });
    return () => {
      unsub();
      unsubRoom();
    };
  }, [nodeService, selfOwnerId, peerIdsKey, peerIdSet]);

  return previews;
}
