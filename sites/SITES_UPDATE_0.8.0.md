# Sites & release hygiene — v0.8.0

**Release:** 0.8.0 (EnvoyMesh) · **EnvoyGo** 1.8.0+53  
**Revised:** 2026-10-01  

## Canonical product URLs

| Product | URL |
|---------|-----|
| EnvoyMesh | https://www.envoymesh.cn/ |
| EnvoyDev | https://www.envoymesh.cn/envoydev |
| Veda Notes | https://www.envoymesh.cn/veda-ai |
| EnvoyHome | https://www.envoymesh.cn/envoyhome/ |
| Privacy (EnvoyMesh) | https://www.envoymesh.cn/privacy |

Binary mirrors (stable paths): `https://download.envoymesh.cn/EnvoyMesh/…`

HomeClaw install docs stay on **https://www.homeclaw.cn/** (separate product).

## Checklist

| Item | Status |
|------|--------|
| `VERSION` + `node scripts/sync-version.mjs` → 0.8.0 | ✅ |
| `apps/envoygo/pubspec.yaml` → 1.8.0+N | ✅ |
| README / README.zh-CN product + mirror links | ✅ |
| `sites/index*.html` download mirrors | ✅ (prior pass) |
| `CHANGELOG.md` `[0.8.0]` | ✅ |
| EnvoyGo store listing website + privacy URLs | ✅ (support email still manual) |
| `sites/envoyhome/` deployed under `/envoyhome/` | Deploy when ready |

Guidebook HTML still references **0.4.0** until a dedicated guidebook refresh ships.