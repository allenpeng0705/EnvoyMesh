import type { HumanProfilePayload, ProfileThumbnailInline } from "@envoymesh/protocol";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sha256Hex } from "./profile-photo.js";

export async function loadProfileThumbnailInline(
  vaultDir: string,
  profile: HumanProfilePayload,
): Promise<ProfileThumbnailInline | undefined> {
  const ref = profile.publicThumbnail;
  if (!ref) return undefined;
  const abs = resolve(vaultDir, ref.vaultRelativePath);
  let bytes: Buffer;
  try {
    bytes = await readFile(abs);
  } catch {
    return undefined;
  }
  const contentSha256 = sha256Hex(bytes);
  if (contentSha256 !== ref.contentSha256) return undefined;
  return {
    contentBase64: bytes.toString("base64"),
    mimeType: ref.mimeType,
    contentSha256,
  };
}
