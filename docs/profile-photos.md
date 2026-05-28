# Profile photos & gallery

Owner-signed **HumanProfile** metadata plus vault bytes for thumbnails and gallery images. Peers receive **thumbnails inline** via `profile.sync`; gallery **files** move only through explicit **share** flows.

**Related:** [agent_bridge_guide.md](./agent_bridge_guide.md) (external agents — separate from profile media).

---

## Concepts

| Piece | Storage | On the wire | Who sees what |
|-------|---------|-------------|----------------|
| **Public thumbnail** | `profile/thumbnail.{jpg\|png\|webp}` | `profile.sync` + inline bytes (hash-checked) | Discover, contacts, chat headers (avatar) |
| **Gallery photo** | `profile/gallery/<id>.*` | Metadata only in signed profile | Bond-gated **metadata** in chat; **bytes** via `share.request` |

**Discover** lists peers and shows **thumbnails** from cached `profile.sync` — not a full gallery browser. Public gallery labels appear in synced profile metadata for bonded contacts at the right bond level.

---

## Upload pipeline

1. Social **Photos** tab (or mobile Me tab) → pick image → optional square crop (thumbnail).
2. Node/mobile writes to vault under `profile/` (path-validated, no `..`).
3. **EXIF/metadata stripped** for JPEG, PNG, and WebP (RIFF `EXIF` / `XMP ` / `ICCP` chunks).
4. Size limits: thumbnail **512 KiB**, gallery **5 MiB**, max **12** gallery items.
5. Profile re-signed; thumbnail changes trigger **`syncProfileToBonds`** (pushes `profile.sync` to all bonds).

**Automatic refresh (no manual action):** When a contact changes their thumbnail, they broadcast `profile.sync`. Your node caches inline bytes and emits **`profile:updated`**; Social avatars reload from cache. When your mesh comes online, **`refreshBondPeerProfiles`** re-pushes your profile and requests each bond’s profile. Bond / hello acceptance does the same for the new contact pair.

---

## P2P intents

| Intent | Direction | Behavior |
|--------|-----------|----------|
| `profile.sync` | You → bonds | Signed profile + optional inline thumbnail |
| `profile.request` | Peer → you | You reply with `profile.response` (same payload shape) |
| `profile.response` | You → requester | Signed profile + inline thumbnail when present |

**`profile.request` / `profile.response`** work even if you have **no thumbnail** (gallery-only or text profile). Inline bytes are omitted when no `publicThumbnail` is set.

Inbound `profile.sync` / `profile.response` requires a **known owner public key** (from bonds/intro) and valid profile signature. Thumbnail inline must match `contentSha256` on the profile ref.

---

## Gallery visibility

| Visibility | Bond can see metadata (`canViewProfileGalleryPhoto`) | Default share sensitivity |
|------------|------------------------------------------------------|---------------------------|
| `public` | Everyone (except blocked) | `public` |
| `referred` | Referred + direct | `friends` |
| `direct` | Direct only | `friends` |

**UI “Share…”** and agent tool `mesh.share_profile_gallery_photo` use `galleryPhotoShareSensitivity()` from `@envoymesh/api`.

**Chat UI:** bonded contact threads show a **gallery metadata** strip (labels + visibility) filtered by your bond — not image previews (bytes are not synced).

---

## Sharing gallery bytes

| Path | Actor | Result |
|------|-------|--------|
| Photos tab **Share…** | Human | `shareFile` → P2P `share.request` |
| `mesh.share_profile_gallery_photo` | Agent | Auto-share if **Settings → AI → Profile media** allows; else approval inbox |

Agent policy defaults: gallery auto-share **off** (`DEFAULT_PROFILE_MEDIA_POLICY`).

---

## Say Hello

`sendHello` also calls `requestPeerProfile` so new contacts can fetch your signed profile + thumbnail after intro.

---

## APIs (NodeService)

- `setPublicProfileThumbnail`, `upsertProfileGalleryPhoto`, `removeProfileGalleryPhoto`, `updateProfileGalleryPhotoVisibility`
- `syncProfileToBonds`, `refreshBondPeerProfiles`, `getPeerProfile`, `listPeerProfiles`, `requestPeerProfile`

---

## Tests

```bash
npx vitest run apps/node/test/profile-photo-import.test.ts apps/node/test/profile-photo-node-e2e.test.ts
npx vitest run packages/api/test/profile-media.test.ts packages/api/test/strip-image-metadata.test.ts
npx vitest run packages/mobile-node/test/mobile-profile-photo-e2e.test.ts packages/mobile-node/test/mobile-profile-sync-e2e.test.ts
npx vitest run apps/social/test/e2e/profile-photos-desktop-e2e.test.tsx
```

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Contact has initials, no photo | Bond exists? They have `publicThumbnail`? Run Say Hello or wait for `profile.sync` |
| `profile.sync` ignored | Owner pubkey in contact store? Signature valid? |
| Share fails | Recipient bonded? Path under `profile/gallery/`? |
| Gallery visible in chat but no image | Expected — use **Share** to send file bytes |
