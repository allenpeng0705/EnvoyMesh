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

function forwardSignal(signal) {
  if (!child.pid || child.killed) return;
  try {
    // Prefer process-group kill so `npm` + nested `vite` both stop cleanly.
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    console.error(`[run-with-env] received ${signal} — stopping child…`);
    forwardSignal(signal);
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(
      `[run-with-env] child exited on ${signal} (npm often reports this as code ${128 + ({ SIGINT: 2, SIGTERM: 15, SIGHUP: 1 }[signal] ?? 0)})`,
    );
    // Re-raise so shells / npm preserve the same failure mode.
    try {
      process.kill(process.pid, signal);
    } catch {
      process.exit(1);
    }
    return;
  }
  if (code && code !== 0) {
    console.error(`[run-with-env] child exited with code ${code}`);
  }
  process.exit(code ?? 1);
});
