import type { ProfilePhotoMime } from "./profile-media.js";
/** Remove JPEG APP (EXIF) segments; keep image structure intact. */
export declare function stripJpegMetadata(bytes: Uint8Array): Uint8Array;
/** Drop eXIf / iTXt / tIME / zTXt ancillary PNG chunks. */
export declare function stripPngMetadata(bytes: Uint8Array): Uint8Array;
/** Drop EXIF/XMP/ICCP chunks from RIFF WebP; keep VP8/VP8L image bitstreams. */
export declare function stripWebpMetadata(bytes: Uint8Array): Uint8Array;
export declare function stripImageMetadata(bytes: Uint8Array, mime: ProfilePhotoMime): Uint8Array;
//# sourceMappingURL=strip-image-metadata.d.ts.map