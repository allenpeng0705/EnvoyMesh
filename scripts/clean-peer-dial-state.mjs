#!/usr/bin/env node
/**
 * Reset stale libp2p dial hints on disk (both home nodes should run while stopped).
 * Keeps bonds/identity/trust — only scrubs peer-directory listenAddrs + discovery LAN seeds.
 *
 * Usage (from repo root, node NOT running):
 *   node scripts/clean-peer-dial-state.mjs
 *   node scripts/clean-peer-dial-state.mjs --profile apps/node/data/default
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const profileDir = process.argv.includes("--profile")
  ? process.argv[process.argv.indexOf("--profile") + 1]
  : join("apps", "node", "data", "default");

const peerDirPath = join(profileDir, "peer-directory.json");
const seedsPath = join(profileDir, "discovery-seeds.json");

function isLanEphemeralSeed(addr) {
  const a = addr.trim();
  const portMatch = a.match(/\/tcp\/(\d+)(?:\/|$)/);
  if (!portMatch) {
    return false;
  }
  const port = Number(portMatch[1]);
  if (port < 32768 || port === 4001 || port === 4002 || port === 4011 || port === 41641) {
    return false;
  }
  return (
    /\/ip4\/192\.168\./.test(a) ||
    /\/ip4\/10\./.test(a) ||
    /\/ip4\/172\.(1[6-9]|2\d|3[01])\./.test(a)
  );
}

async function cleanPeerDirectory() {
  let raw;
  try {
    raw = await readFile(peerDirPath, "utf8");
  } catch {
    console.log(`[skip] no ${peerDirPath}`);
    return;
  }
  const file = JSON.parse(raw);
  let addrsRemoved = 0;
  let recordsTouched = 0;
  for (const record of file.records ?? []) {
    const before = record.listenAddrs?.length ?? 0;
    record.listenAddrs = [];
    if (before > 0) {
      recordsTouched += 1;
      addrsRemoved += before;
    }
  }
  await writeFile(peerDirPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(
    `[peer-directory] cleared listenAddrs on ${recordsTouched} record(s), removed ${addrsRemoved} stale addr(s)`,
  );
}

async function cleanDiscoverySeeds() {
  let raw;
  try {
    raw = await readFile(seedsPath, "utf8");
  } catch {
    console.log(`[skip] no ${seedsPath}`);
    return;
  }
  const file = JSON.parse(raw);
  const before = file.records?.length ?? 0;
  file.records = (file.records ?? []).filter((r) => !isLanEphemeralSeed(String(r.addr ?? "")));
  const removed = before - file.records.length;
  await writeFile(seedsPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(`[discovery-seeds] removed ${removed} LAN ephemeral seed(s), kept ${file.records.length}`);
}

console.log(`Cleaning dial state in ${profileDir} …`);
await cleanPeerDirectory();
await cleanDiscoverySeeds();
console.log("Done. Restart node on BOTH machines, then open bonded contact chat.");
