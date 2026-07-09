import { useEffect, useState } from "react";
import {
  canViewProfileGalleryPhoto,
  type BondLevel,
  type PeerProfileView,
  type ProfileGalleryPhotoVisibility,
} from "@envoymesh/api";
import { useNodeService } from "../hooks/useNodeService.js";
import { useT } from "../context/I18nContext.js";

interface PeerProfileGalleryStripProps {
  ownerId: string;
  bondLevel: BondLevel;
}

export function PeerProfileGalleryStrip({ ownerId, bondLevel }: PeerProfileGalleryStripProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [peer, setPeer] = useState<PeerProfileView | undefined>();

  const visibilityLabel = (v: ProfileGalleryPhotoVisibility) => {
    if (v === "public") return t("profilePhotos.galleryVisibilityPublic");
    if (v === "referred") return t("profilePhotos.galleryVisibilityReferred");
    return t("profilePhotos.galleryVisibilityDirect");
  };

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

  const gallery = peer?.profile?.galleryPhotos ?? [];
  const visible = gallery.filter((photo) => canViewProfileGalleryPhoto(photo.visibility, bondLevel));
  if (visible.length === 0) {
    return null;
  }

  return (
    <section className="peer-profile-gallery-strip" aria-label={t("profilePhotos.galleryStripAria")}>
      <p className="muted small peer-profile-gallery-strip__hint">
        {t("profilePhotos.galleryStripHint", { count: visible.length })}
      </p>
      <ul className="peer-profile-gallery-strip__list">
        {visible.map((photo) => (
          <li key={photo.photoId} className="peer-profile-gallery-strip__item">
            <span className="peer-profile-gallery-strip__label">{photo.label ?? photo.photoId}</span>
            <span className="peer-profile-gallery-strip__vis">{visibilityLabel(photo.visibility)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
