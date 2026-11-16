# EnvoyHome product site

Self-contained marketing site for EnvoyHome — the household agent in the EnvoyMesh apps family.
Everything here is static and opens directly from the filesystem: no build step, no CDN, no
external fonts, scripts or images.

## Pages

| File | Purpose |
|------|---------|
| `index.html` | English landing page — product overview, capabilities, screenshots, memory, smart home, channels, security, get started |
| `index-zh.html` | Simplified Chinese landing page (same sections, translated) |
| `privacy.html` | English privacy policy |
| `privacy-zh.html` | Simplified Chinese privacy policy |

## Assets

```
screens/
  envoyhome-logo.png            # 512px product logo (from docs/screens/)
  envoyhome-logo-128.png        # favicon (from docs/screens/)
  envoyhome-architecture.svg    # product architecture (from docs/screens/)
  envoyhome-architecture-zh.svg # Chinese architecture (from docs/screens/)
  desktop-workflows.png         # captured from the local desktop Settings shell
  desktop-home-assistant.png
  desktop-chat.png
  mobile-pairing.png             # real Flutter Connect screen; pairing field empty
  mobile-chat.png                # real generic conversation with an assistant reply
  mobile-settings.png            # connected Settings hub; no credential detail pages
  family-envoymesh.png           # EnvoyMesh logo (from ../EnvoyMesh/sites/envoydev/screens/)
  family-envoydev.png            # EnvoyDev logo (from ../EnvoyMesh/sites/envoydev/screens/)
  family-veda-notes.png          # Veda Notes app icon (from ../aiNotes/docs/images/app-icon.png)
vendor/
  qrcode.min.js                 # vendored QR renderer (no network request)
```

The desktop screenshots were captured from `apps/desktop/ui-dist/` running against a local
daemon with a demonstration profile (`Alice`) and dark theme. No pairing QR, credential,
provider key or live household data appears in them.

The mobile screenshots were captured from the actual Flutter app running on an iOS simulator
and paired to a local daemon. The chat uses a generic title and prompt. Every image was
inspected before being copied here; no pairing QR or token, credential, provider key or
household data appears in them.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
cd sites/envoyhome
python3 -m http.server 8080
# http://127.0.0.1:8080/
```

## Offline check

```bash
# no external resources (only ordinary hyperlinks leave the site)
grep -RInE 'src="https?://|url\(https?://|@import' . || echo "no external resources"
```

Language links stay inside the folder (`index.html` ↔ `index-zh.html`,
`privacy.html` ↔ `privacy-zh.html`). External `https://` links are normal anchors to GitHub
and email addresses; they are never loaded as page resources.

## Content sources

Copy is drawn from `README.md`, `README.zh-CN.md`, `QuickStart.md`, `design_doc/*.md`,
`docs/privacy-policy.md`, `docs/smart-home.md`, `docs/store-listing.md`, and the channel /
Home Assistant / MQTT setup guides. Claims are limited to what those documents support;
the preview posture (no `v1.0.0` tag yet; store submit uses
`apps/mobile/store-release/`; live IM verification in progress) is stated on the pages.

**Store privacy URL after deploy:** `https://www.envoymesh.cn/envoyhome/privacy.html`  
Release guide: [`docs/mobile-store-release.md`](../../docs/mobile-store-release.md) · listing pack: [`apps/mobile/store-release/`](../../apps/mobile/store-release/).

When the product ships a public release, update the "Get started" section and the
`Last updated` date on both privacy pages.
