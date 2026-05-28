import { useEffect, useState } from "react";
import { useNodeService } from "../hooks/useNodeService.js";
import type { ProfilePhotoRef } from "@envoymesh/api";

interface ProfilePhotoAvatarProps {
  photo?: ProfilePhotoRef;
  fallbackLabel: string;
  className?: string;
  large?: boolean;
}

export function ProfilePhotoAvatar({ photo, fallbackLabel, className = "", large }: ProfilePhotoAvatarProps) {
  const nodeService = useNodeService();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!photo?.vaultRelativePath) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void nodeService
      .readLibraryItemContent({ relativePath: photo.vaultRelativePath, maxBytes: 512 * 1024 })
      .then((result) => {
        if (cancelled) return;
        objectUrl = `data:${result.mimeType};base64,${result.contentBase64}`;
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl?.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    };
  }, [nodeService, photo?.vaultRelativePath, photo?.contentSha256]);

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
