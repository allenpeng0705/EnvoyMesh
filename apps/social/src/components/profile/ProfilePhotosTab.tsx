/**
 * System Profile → Photos: avatar + PhotoWall gallery.
 * Visibility is set when adding a photo, or when opening it in the lightbox.
 */
import { useCallback, useMemo, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useToast } from "../../hooks/useToast.js";
import type {
  ProfileGalleryPhoto,
  ProfileGalleryPhotoVisibility,
  ProfilePhotoMime,
} from "@envoymesh/api";
import { ProfilePhotoAvatar } from "../ProfilePhotoAvatar.js";
import { PhotoPickerSheet } from "../PhotoPickerSheet.js";
import {
  BrowserPhotoGallery,
  type BrowserPhotoGalleryOwnerMeta,
} from "../BrowserPhotoGallery.js";
import { fileToBase64 } from "../../lib/profile-photo-upload.js";
import type { PhotoWallItem } from "../../lib/parse-photo-wall-markdown.js";

function mimeToExt(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

/** User-written description only — never filenames or gallery ids. */
function photoDescription(label?: string): string | undefined {
  const text = label?.trim();
  if (!text) return undefined;
  if (/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(text)) return undefined;
  if (/^gallery-[a-z0-9_-]+$/i.test(text)) return undefined;
  return text;
}

function galleryPhotosToWallItems(
  ownerId: string,
  photos: readonly ProfileGalleryPhoto[],
): { items: PhotoWallItem[]; ownerByUrl: Record<string, BrowserPhotoGalleryOwnerMeta> } {
  const items: PhotoWallItem[] = [];
  const ownerByUrl: Record<string, BrowserPhotoGalleryOwnerMeta> = {};
  for (const p of photos) {
    const ext = mimeToExt(p.mimeType);
    const url = `envoy://${ownerId}/photos/wall/gallery-${p.photoId}.${ext}`;
    const caption = photoDescription(p.label);
    items.push(caption ? { title: "Photo", url, caption } : { title: "Photo", url });
    ownerByUrl[url] = {
      vaultRelativePath: p.vaultRelativePath,
      visibility: p.visibility,
    };
  }
  return { items, ownerByUrl };
}

export interface ProfilePhotosTabProps {
  variant?: "desktop" | "mobile";
}

export function ProfilePhotosTab({ variant = "desktop" }: ProfilePhotosTabProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { humanProfile, refreshHumanProfile } = useNodeState();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<"thumbnail" | "gallery" | null>(null);

  const ownerId = humanProfile?.ownerId?.trim() ?? "";
  const gallery = humanProfile?.galleryPhotos ?? [];

  const { items: wallPhotos, ownerByUrl } = useMemo(
    () => (ownerId ? galleryPhotosToWallItems(ownerId, gallery) : { items: [], ownerByUrl: {} }),
    [ownerId, gallery],
  );

  const libraryRead = useCallback(
    (params: Parameters<typeof nodeService.libraryRead>[0]) => nodeService.libraryRead(params),
    [nodeService],
  );

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

  const uploadGallery = async (
    file: File,
    visibility: ProfileGalleryPhotoVisibility,
    caption?: string,
  ) => {
    setBusy(true);
    try {
      await nodeService.ensureDefaultWebSite?.().catch(() => undefined);
      const { fitImageFileToMaxBytes, blobToBase64 } = await import("../../lib/fit-image.js");
      const { MAX_PROFILE_GALLERY_PHOTO_BYTES } = await import("@envoymesh/api");
      const fitted = await fitImageFileToMaxBytes(file, MAX_PROFILE_GALLERY_PHOTO_BYTES, file.type);
      const label = caption?.trim() || undefined;
      await nodeService.upsertProfileGalleryPhoto({
        contentBase64: await blobToBase64(fitted.blob),
        mimeType: fitted.mimeType as ProfilePhotoMime,
        visibility,
        ...(label ? { label } : {}),
      });
      await refreshHumanProfile();
      showToast(t("profilePhotos.galleryPhotoAdded"), "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("profilePhotos.uploadFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const changeVisibility = async (
    vaultRelativePath: string,
    visibility: ProfileGalleryPhotoVisibility,
  ) => {
    setBusy(true);
    try {
      await nodeService.updateProfileGalleryPhotoVisibility({
        vaultRelativePath,
        visibility,
      });
      await refreshHumanProfile();
      showToast(t("profilePhotos.visibilityUpdated", "Visibility updated"), "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("profilePhotos.updateFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async (vaultRelativePath: string) => {
    setBusy(true);
    try {
      await nodeService.removeProfileGalleryPhoto({ vaultRelativePath });
      await refreshHumanProfile();
      showToast(t("profilePhotos.galleryPhotoRemoved", "Photo removed"), "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("profilePhotos.removeFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const rootClass = variant === "mobile" ? "profile-photos-tab mv-profile-photos" : "profile-photos-tab";

  return (
    <div className={rootClass} data-testid="profile-photos-tab">
      {!humanProfile?.publicThumbnail && (
        <div className="profile-photo-suggest" role="status">
          <strong>{t("profilePhotos.suggestTitle")}</strong>
          <p className="muted small">{t("profilePhotos.suggestDesc")}</p>
        </div>
      )}

      <div className="profile-photos-toolbar">
        <button
          type="button"
          className="profile-photos-avatar-btn"
          onClick={() => setPicker("thumbnail")}
          disabled={busy}
          aria-label={t("profilePhotos.changeThumbnailAria")}
        >
          <ProfilePhotoAvatar
            photo={humanProfile?.publicThumbnail}
            fallbackLabel={humanProfile?.displayName ?? humanProfile?.username ?? "?"}
            className="profile-photos-avatar"
          />
          <span className="profile-photos-avatar-hint">
            {humanProfile?.publicThumbnail
              ? t("profilePhotos.changePhoto")
              : t("profilePhotos.addPhoto")}
          </span>
        </button>
      </div>

      <section className="profile-photowall" aria-label={t("profilePhotos.gallery", "PhotoWall")}>
        <BrowserPhotoGallery
          photos={wallPhotos}
          libraryRead={libraryRead}
          ownerByUrl={ownerByUrl}
          ownerBusy={busy}
          addDisabled={busy}
          onAddPhoto={() => setPicker("gallery")}
          onOwnerVisibilityChange={(path, visibility) => void changeVisibility(path, visibility)}
          onOwnerDelete={(path) => void removePhoto(path)}
        />
      </section>

      <PhotoPickerSheet
        open={picker !== null}
        purpose={picker === "gallery" ? "gallery" : "thumbnail"}
        busy={busy}
        onClose={() => setPicker(null)}
        onConfirmThumbnail={(file, blob, mime) => void uploadThumbnail(file, blob, mime)}
        onConfirmGallery={(file, visibility, caption) =>
          void uploadGallery(file, visibility, caption)
        }
      />
    </div>
  );
}
