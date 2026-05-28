import { useEffect, useState } from "react";
import {
  canViewProfileGalleryPhoto,
  type BondLevel,
  type PeerProfileView,
  type ProfileGalleryPhotoVisibility,
} from "@envoymesh/api";
import { useNodeState } from "../context/NodeStateContext.js";
import { useNodeService } from "../hooks/useNodeService.js";

const VISIBILITY_LABELS: Record<ProfileGalleryPhotoVisibility, string> = {
  public: "Public",
  referred: "Introduced",
  direct: "Contacts only",
};

interface PeerProfileGalleryStripProps {
  ownerId: string;
  bondLevel: BondLevel;
}

export function PeerProfileGalleryStrip({ ownerId, bondLevel }: PeerProfileGalleryStripProps) {
  const nodeService = useNodeService();
  const [peer, setPeer] = useState<PeerProfileView | undefined>();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void nodeService.getPeerProfile(ownerId).then((row) => {
        if (!cancelled) setPeer(row);
      });
    };
    load();
    void nodeService.requestPeerProfile(ownerId).catch(() => {});
    const unsub = nodeService.on?.("profile:updated", (data: { ownerId: string }) => {
      if (data.ownerId === ownerId) load();
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [nodeService, ownerId]);

  const gallery = peer?.profile.galleryPhotos ?? [];
  const visible = gallery.filter((photo) => canViewProfileGalleryPhoto(photo.visibility, bondLevel));
  if (visible.length === 0) {
    return null;
  }

  return (
    <section className="peer-profile-gallery-strip" aria-label="Contact gallery metadata">
      <p className="muted small peer-profile-gallery-strip__hint">
        Gallery ({visible.length} visible at your bond level). Image bytes are not synced — ask them to
        share a file, or you may already have it in Inbox.
      </p>
      <ul className="peer-profile-gallery-strip__list">
        {visible.map((photo) => (
          <li key={photo.photoId} className="peer-profile-gallery-strip__item">
            <span className="peer-profile-gallery-strip__label">{photo.label ?? photo.photoId}</span>
            <span className="peer-profile-gallery-strip__vis">{VISIBILITY_LABELS[photo.visibility]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
