import { useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import {
  galleryPhotoShareSensitivity,
  type ProfileGalleryPhotoVisibility,
  type ProfilePhotoMime,
} from "@envoymesh/api";
import { ProfilePhotoAvatar } from "../ProfilePhotoAvatar.js";
import { PhotoPickerSheet } from "../PhotoPickerSheet.js";
import { fileToBase64, mimeFromFile } from "../../lib/profile-photo-upload.js";
import { useToast } from "../../hooks/useToast.js";

const VISIBILITY_LABELS: Record<ProfileGalleryPhotoVisibility, string> = {
  public: "Everyone on the mesh",
  referred: "Introduced contacts",
  direct: "My contacts only",
};

export interface ProfilePhotosTabProps {
  variant?: "desktop" | "mobile";
}

export function ProfilePhotosTab({ variant = "desktop" }: ProfilePhotosTabProps) {
  const nodeService = useNodeService();
  const { humanProfile, refreshHumanProfile, bonds } = useNodeState();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<"thumbnail" | "gallery" | null>(null);
  const [shareTarget, setShareTarget] = useState<{ vaultRelativePath: string; label: string } | null>(null);

  const uploadThumbnail = async (_file: File, blob: Blob, mime: ProfilePhotoMime) => {
    setBusy(true);
    try {
      await nodeService.setPublicProfileThumbnail({
        contentBase64: await fileToBase64(blob),
        mimeType: mime,
      });
      await refreshHumanProfile();
      void nodeService.syncProfileToBonds();
      showToast("Thumbnail updated", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", "error");
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
      showToast("Gallery photo added", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", "error");
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
      showToast("Share sent", "success");
      setShareTarget(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Share failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const rootClass = variant === "mobile" ? "profile-photos-tab mv-profile-photos" : "profile-photos-tab";

  return (
    <div className={rootClass}>
      {!humanProfile?.publicThumbnail && (
        <div className="profile-photo-suggest" role="status">
          <strong>Add a profile photo</strong>
          <p className="muted small">
            Optional, but recommended — contacts and Discover will show your face instead of initials.
          </p>
        </div>
      )}

      <section className="profile-photos-hero">
        <button
          type="button"
          className="profile-photos-hero-btn"
          onClick={() => setPicker("thumbnail")}
          disabled={busy}
          aria-label="Change profile thumbnail"
        >
          <ProfilePhotoAvatar
            large
            photo={humanProfile?.publicThumbnail}
            fallbackLabel={humanProfile?.displayName ?? humanProfile?.username ?? "?"}
          />
          <span className="profile-photos-hero-label">
            {humanProfile?.publicThumbnail ? "Change photo" : "Add photo"}
          </span>
        </button>
        <p className="muted small">
          Thumbnail is always public. Drag to adjust crop when you upload.
        </p>
      </section>

      <section className="profile-section profile-gallery-section">
        <div className="profile-gallery-header">
          <h3>Gallery</h3>
          <button
            type="button"
            className="btn-secondary btn-small"
            disabled={busy}
            onClick={() => setPicker("gallery")}
          >
            Add photo
          </button>
        </div>
        <p className="muted small">
          Gallery metadata syncs to bonded contacts (visibility below). <strong>Discover</strong> shows your
          public thumbnail only — share a photo to send full image bytes.
        </p>
        <div className="profile-gallery-grid">
          {(humanProfile?.galleryPhotos ?? []).map((photo) => (
            <div key={photo.photoId} className="profile-gallery-card">
              <ProfilePhotoAvatar photo={photo} fallbackLabel={photo.label ?? photo.photoId} large />
              <span className="profile-gallery-vis-label">{VISIBILITY_LABELS[photo.visibility]}</span>
              <label className="profile-gallery-visibility">
                Visibility
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
                        showToast(err instanceof Error ? err.message : "Update failed", "error"),
                      );
                  }}
                >
                  <option value="public">Everyone on the mesh</option>
                  <option value="referred">Introduced contacts</option>
                  <option value="direct">My contacts only</option>
                </select>
              </label>
              <div className="profile-gallery-card-actions">
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  disabled={busy || bonds.length === 0}
                  onClick={() =>
                    setShareTarget({ vaultRelativePath: photo.vaultRelativePath, label: photo.label ?? "Photo" })
                  }
                >
                  Share…
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm("Remove this gallery photo?")) return;
                    void nodeService
                      .removeProfileGalleryPhoto({ vaultRelativePath: photo.vaultRelativePath })
                      .then(() => refreshHumanProfile())
                      .catch((err) =>
                        showToast(err instanceof Error ? err.message : "Remove failed", "error"),
                      );
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {shareTarget && (
        <div className="photo-picker-backdrop" role="presentation" onClick={() => setShareTarget(null)}>
          <div className="photo-picker-sheet photo-share-sheet" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="photo-picker-title">Share {shareTarget.label}</h3>
            <p className="muted small">Pick a bonded contact</p>
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
            {bonds.length === 0 && <p className="muted small">Add a contact first.</p>}
            <button type="button" className="btn-secondary" onClick={() => setShareTarget(null)}>
              Cancel
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
    </div>
  );
}
