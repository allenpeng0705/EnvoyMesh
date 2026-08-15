#!/usr/bin/env node
/**
 * Cross-platform env prefix for npm scripts (cmd.exe cannot parse `FOO=bar cmd`).
 *
 * Usage:
 *   node scripts/run-with-env.mjs FOO=1 BAR=2 -- npm run dev -w @envoymesh/social --
 */
import { spawn } from "node:child_process";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep < 0) {
  console.error("Usage: node scripts/run-with-env.mjs KEY=val ... -- command [args...]");
  process.exit(1);
}

const assignments = argv.slice(0, sep);
const command = argv.slice(sep + 1);
if (command.length === 0) {
  console.error("Missing command after --");
  process.exit(1);
}

const env = { ...process.env };
for (const item of assignments) {
  const eq = item.indexOf("=");
  if (eq <= 0) {
    console.error(`Invalid env assignment (expected KEY=value): ${item}`);
    process.exit(1);
  }
  env[item.slice(0, eq)] = item.slice(eq + 1);
}

// Single command string + shell so Windows resolves npm.cmd and quoting stays intact.
const child = spawn(command.join(" "), {
  env,
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
