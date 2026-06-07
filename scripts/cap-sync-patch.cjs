#!/usr/bin/env node
/**
 * Patch the Capacitor-generated `packageClassList` after `npx cap sync`.
 *
 * The Capacitor CLI auto-derives the list from plugin packages it finds in
 * `node_modules`. Local Pods (e.g. our EnvoyQrScanner) are not detected, so
 * the auto-generated list drops them. We add them back here, idem-potently.
 *
 * Run via: `npm run cap:sync` (see apps/mobile/package.json).
 */
const fs = require("node:fs");
const path = require("node:path");

// Extra plugin classes that live in local Pods and are not picked up by
// `npx cap sync`'s auto-discovery.
const EXTRA_PLUGINS = ["EnvoyQrScanner"];

const TARGETS = [
  "ios/App/App/capacitor.config.json",
  "android/app/src/main/assets/capacitor.config.json",
];

const root = path.resolve(__dirname, "..");
let touched = 0;

for (const rel of TARGETS) {
  const abs = path.join(root, "apps/mobile", rel);
  if (!fs.existsSync(abs)) continue;
  const json = JSON.parse(fs.readFileSync(abs, "utf-8"));
  const list = Array.isArray(json.packageClassList) ? json.packageClassList : [];
  let changed = false;
  for (const cls of EXTRA_PLUGINS) {
    if (!list.includes(cls)) {
      list.push(cls);
      changed = true;
    }
  }
  if (changed) {
    json.packageClassList = list;
    fs.writeFileSync(abs, JSON.stringify(json, null, "\t") + "\n");
    touched += 1;
    console.log(`[cap-sync-patch] added ${EXTRA_PLUGINS.join(", ")} to ${rel}`);
  }
}

if (touched === 0) {
  console.log("[cap-sync-patch] no changes needed");
}
