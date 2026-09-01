/**
 * Market Browse card thumbnail: prefer inline base64; else resolve envoy:// via libraryRead.
 */
import { useEffect, useState } from "react";
import {
  isEnvoyContentUrl,
  parseEnvoyUrl,
  resolveEnvoyUrl,
  type LibraryReadParams,
  type LibraryReadResult,
} from "@envoymesh/api";
import {
  fetchLibraryContentCached,
  peekLibraryReadBlobUrl,
} from "../lib/library-read-blob-cache.js";

type LibraryReadFn = (params: LibraryReadParams) => Promise<LibraryReadResult>;

export function MarketCardThumb({
  thumbnailContentBase64,
  thumbnailMimeType,
  thumbnailRef,
  libraryRead,
  className,
}: {
  thumbnailContentBase64?: string;
  thumbnailMimeType?: string;
  thumbnailRef?: string;
  libraryRead: LibraryReadFn;
  className?: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBlobUrl(null);
    const ref = thumbnailRef?.trim() ?? "";
    if (!ref || !isEnvoyContentUrl(ref)) return;
    if (thumbnailContentBase64?.trim()) return;

    try {
      const { targetOwnerId, path } = resolveEnvoyUrl(parseEnvoyUrl(ref));
      const peek = peekLibraryReadBlobUrl(targetOwnerId, path);
      if (peek) {
        setBlobUrl(peek);
        return;
      }
      void fetchLibraryContentCached(libraryRead, { targetOwnerId, path }).then((result) => {
        if (cancelled) return;
        if (result.status !== "ok" || !result.contentType?.startsWith("image/")) return;
        const url = result.blobUrl ?? peekLibraryReadBlobUrl(targetOwnerId, path);
        if (url) setBlobUrl(url);
      });
    } catch {
      /* ignore */
    }
    return () => {
      cancelled = true;
    };
  }, [thumbnailRef, thumbnailContentBase64, libraryRead]);

  if (thumbnailContentBase64?.trim() && thumbnailMimeType?.trim()) {
    return (
      <img
        className={className}
        alt=""
        src={`data:${thumbnailMimeType};base64,${thumbnailContentBase64}`}
      />
    );
  }
  if (blobUrl) {
    return <img className={className} alt="" src={blobUrl} />;
  }
  return null;
}
