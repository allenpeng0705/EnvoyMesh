import { useCallback, useEffect, useState } from "react";
import { useNodeService } from "../hooks/useNodeService.js";

const PEER_PROFILE_REFRESH_MS = 30_000;

interface PeerProfileAvatarProps {
  ownerId: string;
  fallbackLabel: string;
  className?: string;
  large?: boolean;
}

export function PeerProfileAvatar({ ownerId, fallbackLabel, className = "", large }: PeerProfileAvatarProps) {
  const nodeService = useNodeService();
  const [src, setSrc] = useState<string | null>(null);

  const pullLatestProfile = useCallback(() => {
    void nodeService.requestPeerProfile(ownerId).catch(() => {});
  }, [nodeService, ownerId]);

  const loadThumbnail = useCallback(() => {
    void nodeService
      .getPeerProfile(ownerId)
      .then((row) => {
        if (!row?.thumbnailContentBase64) {
          setSrc(null);
          pullLatestProfile();
          return;
        }
        const mime = row.thumbnailMimeType ?? "image/jpeg";
        setSrc(`data:${mime};base64,${row.thumbnailContentBase64}`);
      })
      .catch(() => setSrc(null));
  }, [nodeService, ownerId, pullLatestProfile]);

  useEffect(() => {
    loadThumbnail();
    const unsubProfile = nodeService.on?.("profile:updated", (data: { ownerId: string }) => {
      if (data.ownerId === ownerId) loadThumbnail();
    });
    const unsubChat = nodeService.on?.("chat:message", (msg: { sender?: { ownerId?: string } }) => {
      if (msg.sender?.ownerId === ownerId) pullLatestProfile();
    });
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") pullLatestProfile();
    }, PEER_PROFILE_REFRESH_MS);
    return () => {
      unsubProfile?.();
      unsubChat?.();
      window.clearInterval(refreshTimer);
    };
  }, [nodeService, ownerId, loadThumbnail, pullLatestProfile]);

  const sizeClass = large ? "profile-avatar large" : "profile-avatar";
  const initial = (fallbackLabel.trim()[0] ?? "?").toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`${sizeClass} profile-avatar--photo ${className}`.trim()}
      />
    );
  }

  return (
    <div className={`${sizeClass} ${className}`.trim()} aria-hidden>
      {initial}
    </div>
  );
}
