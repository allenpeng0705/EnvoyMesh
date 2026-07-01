/**
 * upsertProfileGalleryPhoto runtime.
 *
 * Extracted from `node-service-impl.ts` by `outputs/extract_method.py`.
 * The class method is now a 1-line delegation to
 * `upsertProfileGalleryPhotoViaRuntime(this._upsert_profile_gallery_photo_context(), ...args)`.
 *
 * The context is loosely-typed (`any`) by design: this script trades
 * type-safety for extraction speed. The runtime stays testable because
 * the dependencies it reads (loadConfig, getTaskStore, etc.) all live
 * on the context object and can be replaced with vi.fn() in unit tests.
 */
import { photoIdFromGalleryPath, profileGalleryVaultPath, importProfilePhotoBytes, parseProfilePhotoMime } from "./profile-photo.js";
import { ProfileGalleryPhotoVisibility, MAX_PROFILE_GALLERY_PHOTOS, MAX_PROFILE_GALLERY_PHOTO_BYTES } from "@envoymesh/api";
import { ProfileGalleryPhotoSchema } from "@envoymesh/protocol";

export async function upsertProfileGalleryPhotoViaRuntime(
  ctx: any,
  params: any
): Promise<any> {

        const mime = parseProfilePhotoMime(params.mimeType);
        const visibility = params.visibility as ProfileGalleryPhotoVisibility;
        const { base, existing } = await ctx._loadHumanProfileForPhotoUpdate();
        const gallery = [...(existing.galleryPhotos ?? [])];
        const photoId = params.photoId?.trim() || undefined;
        const existingIdx = photoId
          ? gallery.findIndex((p) => p.photoId === photoId)
          : -1;
        if (gallery.length >= MAX_PROFILE_GALLERY_PHOTOS && existingIdx < 0) {
          throw new Error(`Gallery limit reached (max ${MAX_PROFILE_GALLERY_PHOTOS} photos)`);
        }
        const vaultRelativePath = profileGalleryVaultPath(mime, photoId);
        const imported = await importProfilePhotoBytes({
          vaultDir: ctx._vaultDir,
          relativePath: vaultRelativePath,
          contentBase64: params.contentBase64,
          mimeType: mime,
          maxBytes: MAX_PROFILE_GALLERY_PHOTO_BYTES,
        });
        const entry = ProfileGalleryPhotoSchema.parse({
          ...imported,
          photoId: photoId ?? photoIdFromGalleryPath(vaultRelativePath),
          label: params.label?.trim() || undefined,
          visibility,
        });
        if (existingIdx >= 0) {
          gallery[existingIdx] = entry;
        } else {
          gallery.push(entry);
        }
        return ctx._signAndSaveHumanProfile({ ...base, galleryPhotos: gallery });
      
}
