import { useEffect, useState } from "react";
import { useNodeService } from "../hooks/useNodeService.js";

interface PeerProfileAvatarProps {
  ownerId: string;
  fallbackLabel: string;
  className?: string;
  large?: boolean;
}

export function PeerProfileAvatar({ ownerId, fallbackLabel, className = "", large }: PeerProfileAvatarProps) {
  const nodeService = useNodeService();
  const [src, setSrc] = useState<string | null>(null);

  const loadThumbnail = () => {
    void nodeService.getPeerProfile(ownerId).then((row) => {
      if (!row?.thumbnailContentBase64) {
        setSrc(null);
        return;
      }
      const mime = row.thumbnailMimeType ?? "image/jpeg";
      setSrc(`data:${mime};base64,${row.thumbnailContentBase64}`);
    }).catch(() => setSrc(null));
  };

  useEffect(() => {
    loadThumbnail();
    void nodeService.requestPeerProfile(ownerId).catch(() => {});
    const unsub = nodeService.on?.("profile:updated", (data: { ownerId: string }) => {
      if (data.ownerId === ownerId) loadThumbnail();
    });
    return () => {
      unsub?.();
    };
  }, [nodeService, ownerId]);

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
