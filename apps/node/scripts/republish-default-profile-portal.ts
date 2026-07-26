import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { publishProfilePortal } from "../src/web-content-author.js";

async function main() {
  const nodeRoot = join(fileURLToPath(new URL("../", import.meta.url)));
  const root = join(nodeRoot, "data/default");
  const vaultDir = join(nodeRoot, "shared_vault");
  const profile = JSON.parse(await readFile(join(root, "human-profile.json"), "utf8")) as {
    ownerId: string;
    displayName: string;
    username?: string;
    bio?: string;
    hobbies?: string[];
    knowledge?: string[];
    capabilities?: Array<{ tag?: string }>;
    profileVisibility?: string;
    publicThumbnail?: { vaultRelativePath: string; mimeType: string };
    galleryPhotos?: Array<{ photoId: string; label?: string; mimeType: string }>;
  };

  let avatarBase64: string | undefined;
  let avatarMimeType: string | undefined;
  if (profile.publicThumbnail?.vaultRelativePath) {
    try {
      const bytes = await readFile(join(vaultDir, profile.publicThumbnail.vaultRelativePath));
      avatarBase64 = bytes.toString("base64");
      avatarMimeType = profile.publicThumbnail.mimeType;
    } catch (err) {
      console.warn("avatar read failed", err);
    }
  }

  const result = await publishProfilePortal(root, {
    ownerId: profile.ownerId,
    displayName: profile.displayName,
    username: profile.username,
    bio: profile.bio,
    hobbies: profile.hobbies,
    knowledge: profile.knowledge,
    capabilities: profile.capabilities,
    photos: (profile.galleryPhotos ?? []).map((p) => ({
      photoId: p.photoId,
      title: p.label,
      mimeType: p.mimeType,
    })),
    avatarBase64,
    avatarMimeType,
    visibility: profile.profileVisibility === "public" ? "public" : "bonded",
  });

  const html = await readFile(join(root, "web/index.html"), "utf8");
  console.log(
    JSON.stringify({
      path: result.path,
      bytes: result.byteLength,
      hasBio: html.includes("blues guitar"),
      tiles: (html.match(/class="em-mosaic__tile"/g) ?? []).length,
      hasBlog: html.includes(">Blog<"),
      hasNav: html.includes("em-nav"),
      hasAvatar: /avatar\.(jpg|png|webp)/.test(html),
      hasMusic: html.includes("music"),
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
