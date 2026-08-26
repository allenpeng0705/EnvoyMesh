#!/usr/bin/env node
/**
 * envoy-harness-tui — interactive ACP host.
 *
 * Modes:
 * - `--demo` (default): in-process fake backend
 * - `--spawn`: child `envoy-harness --acp` over stdio
 * - `--cluster-only`: mesh cluster console (no local agent chat)
 * - `--peers <id>@<host:port>`: wire static peer discovery (repeatable)
 */
import { createFakeSessionBackend, loadConfig, resolvePeerEndpoints, } from "@envoymesh/envoy-harness";
import { createClusterTui } from "./cluster-wiring.js";
import { createInProcessTui } from "./in-process.js";
import { formatPeersForEnv, parseTuiPeerFlags, } from "./peers-config.js";
import { createSpawnedTui } from "./spawn.js";
import { runInteractive } from "./ui.js";
import { DEFAULT_ACCENT } from "./transcript.js";
const TUI_HELP = `envoy-harness-tui — terminal host for envoy-harness (ACP)

Usage:
  envoy-harness-tui [--demo | --spawn | --cluster-only]
                    [--peers <id>@<host:port>] [--connect-timeout-ms <n>]
                    [--provider <name>] [--model <model>]
                    [--permissions default|ask|approve] [--ask-permission]

Modes:
  --demo            in-process fake backend (default)
  --spawn           spawn \`envoy-harness --acp\` and attach over stdio;
                    pass --provider/--model for a live model and
                    --permissions to set the auto-run policy on session start
  --cluster-only    mesh cluster console (distributed ops; chat echoes hint)

Mesh / collaboration:
  --peers <id>@<host:port>   static peer endpoint (repeatable)
  --connect-timeout-ms <n>   per-peer TCP connect timeout (default 10000)
  ENVOY_PEERS                same as --peers (comma or space separated)
  config.toml [[peers]]      loaded automatically (see mesh guide)

  Env:
  ENVOY_HARNESS_BIN  override harness executable for --spawn
  --no-color         disable ANSI colors (status bar + transcript)

Inside the TUI: /mesh /help /cluster /peers /route /scoreboard /team /trace
Permission: /permissions (show) | default | ask | approve · /sandbox · /approval
Prompts: type allow or deny
`;
function buildHarnessArgs(argv, peers) {
    const harnessArgs = [];
    const providerIndex = argv.indexOf("--provider");
    if (providerIndex !== -1 && argv[providerIndex + 1]) {
        harnessArgs.push("--provider", argv[providerIndex + 1]);
    }
    const modelIndex = argv.indexOf("--model");
    if (modelIndex !== -1 && argv[modelIndex + 1]) {
        harnessArgs.push("--model", argv[modelIndex + 1]);
    }
    const timeoutIndex = argv.indexOf("--connect-timeout-ms");
    if (timeoutIndex !== -1 && argv[timeoutIndex + 1]) {
        harnessArgs.push("--connect-timeout-ms", argv[timeoutIndex + 1]);
    }
    for (const peer of peers) {
        harnessArgs.push("--peers", `${peer.id}@${peer.endpoint}`);
    }
    return harnessArgs;
}
/** Parse `--permissions default|ask|approve` (hosts pass their policy). */
function parsePermissionsFlag(argv) {
    const index = argv.indexOf("--permissions");
    if (index === -1)
        return undefined;
    const raw = argv[index + 1]?.toLowerCase();
    if (raw === "default")
        return "safe-only";
    if (raw === "ask")
        return "always-confirm";
    if (raw === "approve")
        return "off";
    if (raw === "safe-only" || raw === "always-confirm" || raw === "off") {
        return raw;
    }
    return undefined;
}
async function main() {
    const argv = process.argv.slice(2);
    if (argv.includes("--help") || argv.includes("-h")) {
        process.stdout.write(TUI_HELP);
        return;
    }
    const noColor = argv.includes("--no-color");
    const interactiveOpts = {
        ...(noColor
            ? { transcriptFormat: { useColor: false } }
            : { accent: DEFAULT_ACCENT, transcriptFormat: { useColor: true } }),
    };
    let peerFlags;
    try {
        peerFlags = parseTuiPeerFlags(argv);
    }
    catch (err) {
        process.stderr.write(`envoy-harness-tui: ${err.message}\n`);
        process.exitCode = 2;
        return;
    }
    const spawn = argv.includes("--spawn");
    const clusterOnly = peerFlags.clusterOnly;
    const demo = !spawn && !clusterOnly;
    const { layer: configLayer } = await loadConfig({});
    const configuredPeers = resolvePeerEndpoints({
        configLayer,
        cliPeers: peerFlags.peers,
    });
    if (clusterOnly) {
        if (configuredPeers.length === 0) {
            process.stderr.write("envoy-harness-tui: --cluster-only requires at least one --peers <id>@<host:port> or ENVOY_PEERS\n");
            process.exitCode = 2;
            return;
        }
        const tui = await createClusterTui({
            peers: configuredPeers,
            cwd: process.cwd(),
            ...(peerFlags.connectTimeoutMs !== undefined
                ? { connectTimeoutMs: peerFlags.connectTimeoutMs }
                : {}),
            onFailure: (id, err) => {
                process.stderr.write(`[mesh] peer ${id} failed: ${err.message}\n`);
            },
        });
        try {
            process.stdout.write("envoy-harness-tui (cluster console) — /mesh /help for mesh commands\n");
            await runInteractive({
                session: tui.session,
                configuredPeers,
                ...interactiveOpts,
            });
        }
        finally {
            tui.close();
        }
        return;
    }
    if (spawn) {
        const harnessArgs = buildHarnessArgs(argv, configuredPeers);
        const initialAutoRun = parsePermissionsFlag(argv);
        const spawnEnv = configuredPeers.length > 0
            ? {
                ...process.env,
                ENVOY_PEERS: formatPeersForEnv(configuredPeers),
            }
            : process.env;
        const tui = createSpawnedTui({
            cwd: process.cwd(),
            stderr: "inherit",
            harnessArgs,
            env: spawnEnv,
            ...(initialAutoRun !== undefined ? { initialAutoRun } : {}),
        });
        try {
            const meshNote = configuredPeers.length > 0
                ? ` (${configuredPeers.length} peer(s) wired — /mesh /cluster)`
                : " — /mesh to discover collaboration";
            process.stdout.write(`envoy-harness-tui (spawned --acp)${meshNote}\n`);
            await runInteractive({
                session: tui.session,
                configuredPeers,
                ...interactiveOpts,
            });
        }
        finally {
            tui.close();
        }
        return;
    }
    if (demo && configuredPeers.length > 0) {
        const wired = await import("./cluster-wiring.js");
        const clusterTui = await wired.createClusterTui({
            peers: configuredPeers,
            cwd: process.cwd(),
            base: createFakeSessionBackend({
                ...(argv.includes("--ask-permission")
                    ? { permissionTool: "bash" }
                    : {}),
            }),
            ...(peerFlags.connectTimeoutMs !== undefined
                ? { connectTimeoutMs: peerFlags.connectTimeoutMs }
                : {}),
            onFailure: (id, err) => {
                process.stderr.write(`[mesh] peer ${id} failed: ${err.message}\n`);
            },
        });
        try {
            process.stdout.write("envoy-harness-tui (demo + mesh) — /mesh /help for commands\n");
            await runInteractive({
                session: clusterTui.session,
                configuredPeers,
            });
        }
        finally {
            clusterTui.close();
        }
        return;
    }
    const tui = createInProcessTui({
        cwd: process.cwd(),
        backend: createFakeSessionBackend({
            ...(argv.includes("--ask-permission")
                ? { permissionTool: "bash" }
                : {}),
        }),
    });
    try {
        process.stdout.write("envoy-harness-tui (demo) — /mesh for collaboration · /help for commands\n");
        await runInteractive({
            session: tui.session,
            configuredPeers,
            ...interactiveOpts,
        });
    }
    finally {
        tui.close();
    }
}
main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
//# sourceMappingURL=bin.js.map