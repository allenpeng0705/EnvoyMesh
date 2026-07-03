#!/usr/bin/env node
// =============================================================================
// envoymesh-bundle.mjs — cross-platform runtime for an EnvoyMesh bundle.
//
// Lives at bin/envoymesh-bundle.mjs inside the produced bundle. Spawns the
// bundled OpenClaw gateway, waits for it to respond on the webhook route,
// then spawns the bundled EnvoyMesh node. Handles SIGINT/SIGTERM (and
// Windows Ctrl-C) for clean shutdown.
//
// Invoked by ./start.sh (mac/linux) or start.bat (Windows). Both launchers
// just `exec node bin/envoymesh-bundle.mjs` after locating a usable node.
//
// Env-var overrides:
//   ENVOYMESH_GATEWAY_PORT  default 18789 (must be reachable from envoy-node)
//   ENVOYMESH_BRIDGE_PORT   default 3031
//   ENVOYMESH_PROFILE       default <bundle>/var/profile
//   ENVOYMESH_GATEWAY_URL   default derived from GATEWAY_PORT
//   ENVOYMESH_BRIDGE_URL    default derived from BRIDGE_PORT
//   OPENCLAW_PORT           same as ENVOYMESH_GATEWAY_PORT (alias)
//
// Exit codes:
//   0  clean shutdown (Ctrl-C or child exit forwarded)
//   1  bundle is incomplete (missing built artifacts)
//   2  OpenClaw gateway failed to start
//   3  EnvoyMesh node failed to start
// =============================================================================

import { spawn } from "node:child_process";
import {
  accessSync,
  constants,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_ROOT = resolve(__dirname, "..");
const NODE = process.execPath; // the bundled node that ran us (or system fallback)
const IS_WINDOWS = process.platform === "win32";
const MAC_LOG_FILE =
  process.platform === "darwin"
    ? join(homedir(), "Library", "Logs", "EnvoyMesh", "bundle.log")
    : null;

/** Always append macOS launch output to ~/Library/Logs/EnvoyMesh/bundle.log. */
function initMacLaunchLog() {
  if (!MAC_LOG_FILE) {
    return;
  }
  mkdirSync(dirname(MAC_LOG_FILE), { recursive: true });
  const stream = createWriteStream(MAC_LOG_FILE, { flags: "a" });
  stream.write(
    `\n=== ${new Date().toISOString()} pid=${process.pid} ===\n`,
  );
  stream.write(`bundle root: ${BUNDLE_ROOT}\n`);
  for (const method of ["log", "warn", "error"]) {
    const orig = console[method].bind(console);
    console[method] = (...args) => {
      try {
        stream.write(
          `${args.map((a) => (typeof a === "string" ? a : String(a))).join(" ")}\n`,
        );
      } catch {
        /* ignore log write errors */
      }
      orig(...args);
    };
  }
}

initMacLaunchLog();

const GATEWAY_PORT = Number(
  process.env.ENVOYMESH_GATEWAY_PORT || process.env.OPENCLAW_PORT || 18789,
);
const BRIDGE_PORT = Number(process.env.ENVOYMESH_BRIDGE_PORT || 3031);

const paths = {
  openclaw: join(BUNDLE_ROOT, "openclaw"),
  openclawDir: join(BUNDLE_ROOT, "openclaw"),
  openclawMjs: join(BUNDLE_ROOT, "openclaw", "openclaw.mjs"),
  openclawDistEntry: join(BUNDLE_ROOT, "openclaw", "dist", "entry.js"),
  openclawExtensions: join(BUNDLE_ROOT, "openclaw", "extensions"),
  nodeRoot: join(BUNDLE_ROOT, "node"),
  skillsDir: join(BUNDLE_ROOT, "node", "skills"),
  envoyNode: join(BUNDLE_ROOT, "node", "dist", "src", "index.js"),
  envoyNodeAlt: join(BUNDLE_ROOT, "node", "dist", "index.js"),
  envoyNodeLegacy: join(BUNDLE_ROOT, "node", "src", "index.js"),
  socialIndex: join(BUNDLE_ROOT, "social", "index.html"),
  socialDistIndex: join(BUNDLE_ROOT, "social", "dist", "index.html"),
  varDir: join(BUNDLE_ROOT, "var"),
};

// ----- logging helpers ------------------------------------------------------

function info(msg) {
  console.log(`[bundle] ${msg}`);
}
function warn(msg) {
  console.warn(`[bundle] WARN: ${msg}`);
}
function fail(msg, code = 1) {
  console.error(`[bundle] ERROR: ${msg}`);
  notifyUserFailure(msg);
  process.exit(code);
}

/** Show a macOS alert when launched from Finder (no visible terminal). */
function notifyUserFailure(msg) {
  if (process.platform !== "darwin" || process.stdout.isTTY) {
    return;
  }
  const text = String(msg).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const logHint = MAC_LOG_FILE
    ? ` See ${MAC_LOG_FILE} for details.`
    : "";
  try {
    spawn(
      "osascript",
      [
        "-e",
        `display alert "EnvoyMesh failed to start" message "${text}${logHint}" as critical`,
      ],
      { stdio: "ignore", detached: true },
    ).unref();
  } catch {
    /* ignore */
  }
}

// ----- preflight checks -----------------------------------------------------

function isMacAppBundle(root) {
  return (
    process.platform === "darwin" &&
    root.includes(`${join("", ".app", "Contents", "Resources")}`)
  );
}

function resolveVarDir() {
  const explicit = (process.env.ENVOYMESH_VAR_DIR ?? "").trim();
  if (explicit) {
    return resolve(explicit);
  }

  // Installed .app bundles are code-signed. Never write runtime state inside
  // the signed Resources/bundle tree — it breaks Gatekeeper on the next launch.
  if (isMacAppBundle(BUNDLE_ROOT)) {
    const appSupport = join(
      homedir(),
      "Library",
      "Application Support",
      "EnvoyMesh",
    );
    info(`runtime data: ${appSupport}`);
    return appSupport;
  }

  const bundleVarDir = join(BUNDLE_ROOT, "var");
  const userTmpRoot = join(
    tmpdir(),
    `envoymesh-${process.env.USER || "user"}-${process.pid}`,
  );
  const fallbackVarDir = ensureDir(userTmpRoot)
    ? userTmpRoot
    : mkdtempSync(join(tmpdir(), "envoymesh-"));

  if (ensureDir(bundleVarDir) && isWritableDir(bundleVarDir)) {
    return bundleVarDir;
  }

  warn(`Bundle is on a read-only filesystem (${realpathSync(BUNDLE_ROOT)}).`);
  warn(`Runtime state will live in ${fallbackVarDir} and will be lost on reboot.`);
  warn(`Drag EnvoyMesh.app to /Applications and re-launch for a stable install.`);
  return fallbackVarDir;
}

async function gatewayResponds(url) {
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(2000),
    });
    return res.status !== 0;
  } catch {
    return false;
  }
}

function ensureDir(p) {
  try {
    mkdirSync(p, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

// Detect whether the bundle is on a writable filesystem. When the user
// double-clicks EnvoyMesh.app from a mounted .dmg, BUNDLE_ROOT is on a
// read-only HFS+ mount and `var/` is not writable. We need to fall
// back to a temp dir in that case or OpenClaw crashes a few seconds
// after launch when it tries to write its state dir.
//
// Two checks: (1) `accessSync` to probe the var dir; (2) probe the
// *parent* because `mkdirSync(... {recursive:true})` succeeds on a
// pre-existing read-only dir.
function isWritableDir(p) {
  try {
    accessSync(p, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

info(`bundle root: ${BUNDLE_ROOT}`);
info(`node:        ${NODE} (${process.version})`);
info(`platform:    ${process.platform}-${process.arch}`);

// OpenClaw can be invoked either as openclaw.mjs (the canonical entry) or
// via the dist/entry.js bootstrap. Either is fine.
const openclawEntry = existsSync(paths.openclawMjs)
  ? paths.openclawMjs
  : existsSync(paths.openclawDistEntry)
    ? paths.openclawDistEntry
    : null;
if (!openclawEntry) {
  fail(
    `OpenClaw not built — looked for ${paths.openclawMjs} and ${paths.openclawDistEntry}.`,
  );
}

// EnvoyMesh node — try the canonical path, fall back to the legacy one.
const envoyEntry = existsSync(paths.envoyNode)
  ? paths.envoyNode
  : existsSync(paths.envoyNodeAlt)
    ? paths.envoyNodeAlt
    : existsSync(paths.envoyNodeLegacy)
      ? paths.envoyNodeLegacy
      : null;
if (!envoyEntry) {
  fail(
    `EnvoyMesh node not built — looked for ${paths.envoyNode}, ${paths.envoyNodeAlt}, and ${paths.envoyNodeLegacy}. Re-run the bundle script from the source tree.`,
  );
}

// Social UI is optional — if missing, the user can still run the node.
const hasSocial = existsSync(paths.socialIndex) || existsSync(paths.socialDistIndex);
if (hasSocial) {
  info(
    `social:      ${existsSync(paths.socialDistIndex) ? paths.socialDistIndex : paths.socialIndex}`,
  );
} else {
  warn(
    `Social UI not built (looked for ${paths.socialIndex}). The node will still start; you'll need a separate UI to interact with it.`,
  );
}

// Resolve the runtime data directory. For macOS .app installs, keep state in
// ~/Library/Application Support/EnvoyMesh so we do not mutate the signed bundle.
paths.varDir = resolveVarDir();

ensureDir(paths.varDir);
ensureDir(join(paths.varDir, "openclaw"));
ensureDir(join(paths.varDir, "profile"));

const profileDir =
  process.env.ENVOYMESH_PROFILE?.trim() || join(paths.varDir, "profile");
ensureDir(profileDir);

// ----- env wiring for the children -----------------------------------------

const childEnv = {
  ...process.env,
  // OpenClaw gateway location
  OPENCLAW_ROOT: paths.openclaw,
  ENVOYMESH_OPENCLAW_DIR: paths.openclawDir,
  OPENCLAW_BUNDLED_PLUGINS_DIR: paths.openclawExtensions,
  OPENCLAW_STATE_DIR: join(paths.varDir, "openclaw"),
  // Bridge endpoints the EnvoyMesh node uses to talk to the gateway
  ENVOYMESH_BRIDGE_URL:
    process.env.ENVOYMESH_BRIDGE_URL ||
    `http://127.0.0.1:${BRIDGE_PORT}/bridge/send`,
  ENVOYMESH_GATEWAY_URL:
    process.env.ENVOYMESH_GATEWAY_URL ||
    `http://127.0.0.1:${GATEWAY_PORT}/webhook/envoymesh`,
  ENVOYMESH_PROFILE: profileDir,
  ENVOYMESH_VAR_DIR: paths.varDir,
  // Stable CI=true suppresses OpenClaw's interactive prompts
  CI: process.env.CI || "true",
  NODE_ENV: process.env.NODE_ENV || "production",
  ...(existsSync(paths.skillsDir)
    ? { ENVOYMESH_BUNDLED_SKILLS_DIR: paths.skillsDir }
    : {}),
};

// ----- spawn OpenClaw gateway (or reuse an existing one) -------------------

const gatewayUrl = `http://127.0.0.1:${GATEWAY_PORT}/webhook/envoymesh`;

let openclawProc = null;
let openclawStartedByUs = false;

if (await gatewayResponds(gatewayUrl)) {
  info(
    `OpenClaw gateway already responding on port ${GATEWAY_PORT} — reusing it.`,
  );
} else {
  info(`Starting OpenClaw gateway on port ${GATEWAY_PORT}...`);
  const openclawArgs = [
    openclawEntry,
    "gateway",
    "--port",
    String(GATEWAY_PORT),
    "--bind",
    "loopback",
    "--auth",
    "none",
    "--allow-unconfigured",
  ];
  openclawProc = spawn(NODE, openclawArgs, {
    env: childEnv,
    stdio: "inherit",
  });
  openclawStartedByUs = true;
}

// ----- wait for the gateway to respond -------------------------------------

async function waitForGateway() {
  if (!openclawStartedByUs) {
    return;
  }
  for (let i = 0; i < 30; i++) {
    if (openclawProc?.exitCode != null) {
      fail(
        `OpenClaw gateway exited with code ${openclawProc.exitCode} before becoming ready. ` +
          `Port ${GATEWAY_PORT} may be in use by another app — stop dev OpenClaw/node processes and try again.`,
        2,
      );
    }
    if (await gatewayResponds(gatewayUrl)) {
      info(`OpenClaw gateway ready (HTTP on ${gatewayUrl})`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (await gatewayResponds(gatewayUrl)) {
    info(`OpenClaw gateway ready (HTTP on ${gatewayUrl})`);
    return;
  }
  fail(
    `OpenClaw gateway did not respond on port ${GATEWAY_PORT} within 30s. ` +
      `Check ${join(paths.varDir, "openclaw")} for logs.`,
    2,
  );
}

await waitForGateway();

// ----- spawn EnvoyMesh node ------------------------------------------------

info("Starting EnvoyMesh node...");
const nodeProc = spawn(NODE, [envoyEntry, "--profile", profileDir], {
  env: childEnv,
  cwd: paths.nodeRoot,
  stdio: "inherit",
});

// ----- shutdown coordination -----------------------------------------------

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  info(`Received ${signal}, shutting down...`);
  try {
    nodeProc.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  if (openclawStartedByUs) {
    try {
      openclawProc?.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  // Hard kill if children don't exit within 5s
  setTimeout(() => {
    try {
      nodeProc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    if (openclawStartedByUs) {
      try {
        openclawProc?.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
    process.exit(0);
  }, 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
if (IS_WINDOWS) {
  // SIGINT doesn't always reach a Node child on Windows. Watch stdin for Ctrl-C.
  process.stdin.on("data", (chunk) => {
    const s = chunk.toString();
    if (s.includes("\u0003")) shutdown("SIGINT");
  });
}

// ----- forward child exits -------------------------------------------------

nodeProc.on("exit", (code, sig) => {
  if (shuttingDown) return;
  if (sig) {
    info(`EnvoyMesh node exited via ${sig}`);
  } else {
    info(`EnvoyMesh node exited with code ${code}`);
  }
  if (openclawStartedByUs) {
    try {
      openclawProc?.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(code ?? 0), 200).unref();
});

if (openclawProc) {
  openclawProc.on("exit", (code, sig) => {
    if (shuttingDown) return;
    if (sig) {
      warn(`OpenClaw gateway exited via ${sig}`);
    } else if (code !== 0) {
      warn(`OpenClaw gateway exited with code ${code}`);
    }
    try {
      nodeProc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    setTimeout(() => process.exit(code ?? 1), 200).unref();
  });
}
