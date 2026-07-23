import { useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useToast } from "../../hooks/useToast.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import {
  galleryPhotoShareSensitivity,
  type ProfileGalleryPhotoVisibility,
  type ProfilePhotoMime,
} from "@envoymesh/api";
import { ProfilePhotoAvatar } from "../ProfilePhotoAvatar.js";
import { PhotoPickerSheet } from "../PhotoPickerSheet.js";
import { fileToBase64, mimeFromFile } from "../../lib/profile-photo-upload.js";
import type { TFunction } from "../../context/I18nContext.js";

function visibilityLabel(t: TFunction, visibility: ProfileGalleryPhotoVisibility): string {
  switch (visibility) {
    case "public":
      return t("profilePhotos.visibilityEveryone");
    case "referred":
      return t("profilePhotos.visibilityReferred");
    case "direct":
      return t("profilePhotos.visibilityDirect");
  }
}

export interface ProfilePhotosTabProps {
  variant?: "desktop" | "mobile";
}

export function ProfilePhotosTab({ variant = "desktop" }: ProfilePhotosTabProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { humanProfile, refreshHumanProfile, bonds } = useNodeState();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<"thumbnail" | "gallery" | null>(null);
  const [shareTarget, setShareTarget] = useState<{ vaultRelativePath: string; label: string } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message?: string; variant?: "default" | "destructive"; onConfirm: () => void } | null>(null);

  const uploadThumbnail = async (_file: File, blob: Blob, mime: ProfilePhotoMime) => {
    setBusy(true);
    try {
      await nodeService.setPublicProfileThumbnail({
        contentBase64: await fileToBase64(blob),
        mimeType: mime,
      });
      await refreshHumanProfile();
      void nodeService.syncProfileToBonds().catch((err) => {
        console.warn("[profile.sync] broadcast to bonds failed:", err);
      });
      showToast(t("profilePhotos.thumbnailUpdated"), "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("profilePhotos.uploadFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const uploadGallery = async (file: File) => {
    setBusy(true);
    try {
      await nodeService.upsertProfileGalleryPhoto({
        contentBase64: await fileToBase64(file),
        mimeType: mimeFromFile(file),
        visibility: "public",
        label: file.name,
      });
      await refreshHumanProfile();
      showToast(t("profilePhotos.galleryPhotoAdded"), "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("profilePhotos.uploadFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const shareGalleryPhoto = async (ownerId: string) => {
    if (!shareTarget) return;
    const photo = humanProfile?.galleryPhotos?.find((p) => p.vaultRelativePath === shareTarget.vaultRelativePath);
    if (!photo) return;
    setBusy(true);
    try {
      await nodeService.shareFile(ownerId, {
        path: photo.vaultRelativePath,
        sensitivity: galleryPhotoShareSensitivity(photo.visibility),
      });
      showToast(t("profilePhotos.shareSent"), "success");
      setShareTarget(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("profilePhotos.shareFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const rootClass = variant === "mobile" ? "profile-photos-tab mv-profile-photos" : "profile-photos-tab";

  return (
    <div className={rootClass}>
      {!humanProfile?.publicThumbnail && (
        <div className="profile-photo-suggest" role="status">
          <strong>{t("profilePhotos.suggestTitle")}</strong>
          <p className="muted small">{t("profilePhotos.suggestDesc")}</p>
        </div>
      )}

      <section className="profile-photos-hero">
        <button
          type="button"
          className="profile-photos-hero-btn"
          onClick={() => setPicker("thumbnail")}
          disabled={busy}
          aria-label={t("profilePhotos.changeThumbnailAria")}
        >
          <ProfilePhotoAvatar
            large
            photo={humanProfile?.publicThumbnail}
            fallbackLabel={humanProfile?.displayName ?? humanProfile?.username ?? "?"}
          />
          <span className="profile-photos-hero-label">
            {humanProfile?.publicThumbnail ? t("profilePhotos.changePhoto") : t("profilePhotos.addPhoto")}
          </span>
        </button>
        <p className="muted small">{t("profilePhotos.thumbnailHint")}</p>
      </section>

      <section className="profile-section profile-gallery-section">
        <div className="profile-gallery-header">
          <h3>{t("profilePhotos.gallery")}</h3>
          <button
            type="button"
            className="btn-secondary btn-small"
            disabled={busy}
            onClick={() => setPicker("gallery")}
          >
            {t("profilePhotos.addPhotoBtn")}
          </button>
        </div>
        <p className="muted small">{t("profilePhotos.galleryHint")}</p>
        <div className="profile-gallery-grid">
          {(humanProfile?.galleryPhotos ?? []).map((photo) => (
            <div key={photo.photoId} className="profile-gallery-card">
              <ProfilePhotoAvatar photo={photo} fallbackLabel={photo.label ?? photo.photoId} large />
              <span className="profile-gallery-vis-label">{visibilityLabel(t, photo.visibility)}</span>
              <label className="profile-gallery-visibility">
                {t("profilePhotos.visibilityLabel")}
                <select
                  value={photo.visibility}
                  disabled={busy}
                  onChange={(e) => {
                    void nodeService
                      .updateProfileGalleryPhotoVisibility({
                        vaultRelativePath: photo.vaultRelativePath,
                        visibility: e.target.value as ProfileGalleryPhotoVisibility,
                      })
                      .then(() => refreshHumanProfile())
                      .catch((err) =>
                        showToast(err instanceof Error ? err.message : t("profilePhotos.updateFailed"), "error"),
                      );
                  }}
                >
                  <option value="public">{t("profilePhotos.visibilityEveryone")}</option>
                  <option value="referred">{t("profilePhotos.visibilityReferred")}</option>
                  <option value="direct">{t("profilePhotos.visibilityDirect")}</option>
                </select>
              </label>
              <div className="profile-gallery-card-actions">
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  disabled={busy || bonds.length === 0}
                  onClick={() =>
                    setShareTarget({
                      vaultRelativePath: photo.vaultRelativePath,
                      label: photo.label ?? t("profilePhotos.defaultPhotoLabel"),
                    })
                  }
                >
                  {t("profilePhotos.shareBtn")}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  disabled={busy}
                  onClick={() => {
                    setConfirm({
                      title: t("profilePhotos.removeConfirm"),
                      message: t("profilePhotos.removeConfirmMessage"),
                      variant: "destructive",
                      onConfirm: () => {
                        setConfirm(null);
                        void nodeService
                          .removeProfileGalleryPhoto({ vaultRelativePath: photo.vaultRelativePath })
                          .then(() => refreshHumanProfile())
                          .catch((err) =>
                            showToast(err instanceof Error ? err.message : t("profilePhotos.removeFailed"), "error"),
                          );
                      },
                    });
                  }}
                >
                  {t("profilePhotos.removeBtn")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {shareTarget && (
        <div className="photo-picker-backdrop" role="presentation" onClick={() => setShareTarget(null)}>
          <div className="photo-picker-sheet photo-share-sheet" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="photo-picker-title">{t("profilePhotos.shareTitle", { label: shareTarget.label })}</h3>
            <p className="muted small">{t("profilePhotos.sharePickContact")}</p>
            <ul className="photo-share-contact-list">
              {bonds.map((b) => (
                <li key={b.peerOwnerId}>
                  <button
                    type="button"
                    className="photo-share-contact-btn"
                    disabled={busy}
                    onClick={() => void shareGalleryPhoto(b.peerOwnerId)}
                  >
                    {b.displayName ?? b.peerOwnerId.slice(0, 16)}
                  </button>
                </li>
              ))}
            </ul>
            {bonds.length === 0 && <p className="muted small">{t("profilePhotos.addContactFirst")}</p>}
            <button type="button" className="btn-secondary" onClick={() => setShareTarget(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      <PhotoPickerSheet
        open={picker !== null}
        purpose={picker === "gallery" ? "gallery" : "thumbnail"}
        busy={busy}
        onClose={() => setPicker(null)}
        onConfirmThumbnail={(file, blob, mime) => void uploadThumbnail(file, blob, mime)}
        onConfirmGallery={(file) => void uploadGallery(file)}
      />
      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          variant={confirm.variant}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}
