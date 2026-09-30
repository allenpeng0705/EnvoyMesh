# EnvoyDev marketing site

Self-contained marketing + download site for EnvoyDev. Four static HTML pages
(English + Chinese marketing pages and privacy policies), a `screens/` folder
with all the screenshots and logos, and a `vendor/` folder with the QR
library — fully offline, no external requests.

## Files

```
envoydev/
├── index.html         # English marketing page
├── index-zh.html      # Chinese mirror
├── privacy.html       # English privacy policy (linked from footer)
├── privacy-zh.html    # Chinese privacy policy
├── vendor/
│   └── qrcode.min.js  # local copy of the qrcode UMD bundle (QR codes work offline)
└── screens/           # all assets — travels with the site
    ├── envoydev-logo.png      (header / footer / favicon / hero)
    ├── envoymesh-logo.png     (hero lockup + Built on EnvoyMesh card)
    ├── project.png            (hero shot — desktop project view)
    ├── agents.png             (agents section — agents settings page)
    ├── mobile-projects.jpg    (mobile gallery)
    ├── mobile-chats.jpg       (mobile gallery)
    └── mobile-connection.jpg  (mobile gallery)
```

No build step. No external CSS or JS — styles are inline and `qrcode.min.js`
is vendored under `vendor/`, so the pages (including QR rendering) work from
`file://` with no network.

## Deploy

Copy the whole `envoydev/` folder into the EnvoyMesh site root:

```
cp -R sites/envoydev/ ../EnvoyMesh/sites/envoydev/
```

After copying, the cross-links (`../index.html`, `../index-zh.html`) resolve
to the EnvoyMesh homepage from `https://www.envoymesh.cn/envoydev/`.

The privacy policy URLs for the App Store / Google Play listings are
`https://www.envoymesh.cn/envoydev/privacy.html` (English) and
`.../privacy-zh.html` (Chinese).

## Swap the store URLs after release

The App Store and Google Play QR codes are rendered client-side from two
constants at the top of each page's `<script>` block. Edit both files:

```js
// index.html and index-zh.html
const APP_STORE_URL  = "https://apps.apple.com/app/envoydev/id000000000";        // ← replace
const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.envoymesh.envoydev"; // ← replace
```

Next page load, both QRs regenerate from the new URLs. No PNG files to swap.

## Other links (real, no swap needed)

- macOS `.dmg` — `https://download.envoymesh.cn/EnvoyMesh/envoydev-desktop.dmg`
- Windows `.exe` — `https://download.envoymesh.cn/EnvoyMesh/envoydev-desktop.exe`
- Android `.apk` — `https://download.envoymesh.cn/EnvoyMesh/envoydev_mobile.apk`
- GitHub releases — `https://github.com/allenpeng0705/EnvoyCoder/releases`

## Verify locally

Open `index.html` and `index-zh.html` directly in a browser (file://). The
two QR codes render from the local `vendor/qrcode.min.js` — no network
needed. The EnvoyMesh cross-links (`../index.html`) 404 locally by design;
they resolve after deploy.
