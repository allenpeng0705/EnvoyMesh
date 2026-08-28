#!/usr/bin/env node
// Stage a family-only review node-config.json into the Tauri node bundle.
// Opt-in only: APPLE_REVIEW=1 ./scripts/build-desktop.sh macos (not the default build).
// Not used for Windows packages (build-desktop.ps1).
//
// Usage:
//   node scripts/stage-apple-review-node-config.mjs [srcConfig] [destDir] [token]
//
// Env:
//   APPLE_REVIEW_TOKEN — reuse a stable token across rebuilds (optional)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { randomBytes } from "node:crypto"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")

const srcConfig = process.argv[2] || join(ROOT, "node-config.json")
const destDir = process.argv[3] || join(ROOT, "apps/tauri/src-tauri/resources/node")
const token =
  process.env.APPLE_REVIEW_TOKEN ||
  process.argv[4] ||
  randomBytes(24).toString("hex")

let cfg = {}
try {
  cfg = JSON.parse(readFileSync(srcConfig, "utf8"))
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  console.warn(`  ⚠ Could not read ${srcConfig} (${msg}) — using minimal review config.`)
  cfg = {
    version: "0.1",
    profileDir: "data/default",
    discoveryProfile: "wan-default",
    relayEnabled: true,
    relayServerEnabled: false,
    advertiseAddrs: [],
    bootstrapPeers: [],
    bootstrapPresets: ["public-libp2p", "public-libp2p-am6", "public-libp2p-am7", "cn-relay", "us-relay"],
    configuredRelays: [],
    modelProviders: { mode: "disabled" },
    chatAssistEnabled: false,
  }
}

cfg.reviewPairingEnabled = true
cfg.reviewPairingToken = token
cfg.reviewPairingFamilyOnly = true
cfg.reviewPairingTtlDays = 30

const out = join(destDir, "node-config.json")
mkdirSync(destDir, { recursive: true })
writeFileSync(out, JSON.stringify(cfg, null, 2) + "\n")
console.log(`  ✓ Staged family-only review node-config.json → ${out}`)
console.log(`  ✓ Review pairing token (matches the QR): ${token}`)
