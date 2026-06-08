#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WS_ROOT = resolve(__dirname, "..", "..", "..");

// ---- helpers ----

function sh(cmd: string, args: string[], opts?: { cwd?: string }): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts?.cwd ?? WS_ROOT,
      stdio: "inherit",
      shell: true,
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

function shOut(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { encoding: "utf-8", shell: true });
  return (r.stdout ?? "").trim();
}

function ok(label: string, pass: boolean, extra?: string) {
  const mark = pass ? "✓" : "✗";
  console.log(`  ${mark} ${label}${extra ? ` (${extra})` : ""}`);
}

function curlCode(url: string): string {
  return shOut("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", url]);
}

// ---- commands ----

async function openclaw(args: string[]): Promise<number> {
  return sh("openclaw", args);
}

async function start(): Promise<number> {
  console.log("Starting EnvoyMesh node + OpenClaw gateway...\n");
  return sh("npm", ["run", "node:dev"]);
}

async function statusCmd(): Promise<void> {
  console.log("EnvoyMesh Status\n" + "=".repeat(44) + "\n");

  // Node
  const nodePid = shOut("pgrep", ["-f", "tsx src/index.ts"]);
  ok("Node", !!nodePid);

  // Bridge
  const bridge = curlCode("http://127.0.0.1:3031/bridge/send");
  ok("Bridge (:3031)", bridge !== "000", `HTTP ${bridge}`);

  // Gateway
  const gw = curlCode("http://127.0.0.1:18789/webhook/envoymesh");
  ok("Gateway (:18789)", gw !== "000" && gw !== "404", `HTTP ${gw}`);

  // WebSocket
  const ws = curlCode("http://127.0.0.1:3030/ws");
  ok("WebSocket (:3030)", ws !== "000");

  // OpenClaw
  const ver = shOut("openclaw", ["--version"]);
  ok("OpenClaw CLI", !!ver, ver);

  // Bridge config
  const cfgPath = join(WS_ROOT, "data", "default", "bridge-config.json");
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
      ok("Bridge config", true, `enabled=${cfg.enabled}, agent=${cfg.agentName ?? "My Agent"}`);
    } catch { ok("Bridge config", false, "invalid JSON"); }
  } else {
    ok("Bridge config", false, "not found");
  }

  // Plugins
  const plugins = shOut("openclaw", ["plugins", "list"]);
  if (plugins) {
    console.log("\nPlugins:");
    plugins.split("\n").forEach(l => console.log("  " + l));
  }
}

async function setup(): Promise<number> {
  const s = join(WS_ROOT, "scripts", "setup.sh");
  if (!existsSync(s)) { console.log("setup.sh not found"); return 1; }
  return sh("bash", ["scripts/setup.sh"]);
}

async function stop(): Promise<void> {
  const pid = shOut("pgrep", ["-f", "tsx src/index.ts"]);
  if (!pid) { console.log("Node not running"); return; }
  console.log("Stopping node (PID " + pid + ")...");
  shOut("kill", ["-SIGINT", pid]);
  // Also kill any orphaned gateway
  const gwPid = shOut("pgrep", ["-f", "openclaw.mjs"]);
  if (gwPid) shOut("kill", ["-SIGTERM", gwPid]);
  console.log("Stopped.");
}

async function restart(): Promise<void> {
  await stop();
  await new Promise(r => setTimeout(r, 1000));
  process.exit(await start());
}

async function gateway(args: string[]): Promise<number> {
  const sub = args[0];
  switch (sub) {
    case "start":
      return sh("openclaw", ["gateway", "--port", "18789", "--bind", "loopback", "--auth", "none", "--allow-unconfigured"]);
    case "stop": {
      const pid = shOut("pgrep", ["-f", "openclaw.mjs"]);
      if (pid) { shOut("kill", ["-SIGTERM", pid]); console.log("Gateway stopped"); }
      else console.log("Gateway not running");
      return 0;
    }
    case "restart": {
      const pid = shOut("pgrep", ["-f", "openclaw.mjs"]);
      if (pid) shOut("kill", ["-SIGTERM", pid]);
      await new Promise(r => setTimeout(r, 500));
      return sh("openclaw", ["gateway", "--port", "18789", "--bind", "loopback", "--auth", "none", "--allow-unconfigured"]);
    }
    case "status": {
      const gw = curlCode("http://127.0.0.1:18789/webhook/envoymesh");
      console.log(gw !== "000" ? `Gateway running (HTTP ${gw})` : "Gateway not running");
      return 0;
    }
    default:
      console.log("Usage: envoymesh gateway <start|stop|restart|status>");
      return 1;
  }
}

async function config(): Promise<void> {
  const cfgPath = join(WS_ROOT, "data", "default", "bridge-config.json");
  if (!existsSync(cfgPath)) { console.log("No bridge config found"); return; }
  const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
  console.log(JSON.stringify(cfg, null, 2));
}

async function chat(args: string[]): Promise<void> {
  const to = args[0];
  const text = args.slice(1).join(" ");
  if (!to || !text) {
    console.log("Usage: envoymesh chat <to> <message>");
    console.log("  Sends a message via the bridge to a peer.");
    return;
  }
  const resp = shOut("curl", [
    "-s", "-X", "POST",
    "http://127.0.0.1:3031/bridge/send",
    "-H", "Content-Type: application/json",
    "-d", JSON.stringify({ to, text }),
  ]);
  console.log(resp);
}

async function doctor(): Promise<void> {
  console.log("EnvoyMesh Doctor\n" + "=".repeat(44) + "\n");

  // Check prerequisites
  const checks: Array<[string, boolean, string]> = [];

  checks.push(["pnpm", shOut("which", ["pnpm"]) !== "", ""]);
  checks.push(["openclaw", shOut("which", ["openclaw"]) !== "", shOut("openclaw", ["--version"])]);
  checks.push(["Node >= 22", process.version >= "v22", process.version]);

  const ocDir = join(WS_ROOT, "packages", "openclaw");
  checks.push(["OpenClaw source", existsSync(join(ocDir, "openclaw.mjs")), ocDir]);
  checks.push(["dist/entry.js", existsSync(join(ocDir, "dist", "entry.js")), ""]);
  checks.push(["Extension linked", existsSync(join(ocDir, "extensions", "envoymesh", "index.ts")), ""]);
  checks.push(["Plugin onStartup", (() => {
    try {
      const p = join(ocDir, "extensions", "envoymesh", "openclaw.plugin.json");
      return JSON.parse(readFileSync(p, "utf-8")).activation?.onStartup === true;
    } catch { return false; }
  })(), ""]);

  const cfgPath = join(WS_ROOT, "data", "default", "bridge-config.json");
  checks.push(["Bridge config", existsSync(cfgPath), ""]);
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
      checks.push(["Bridge enabled", cfg.enabled === true, ""]);
      checks.push(["agentUrl configured", !!cfg.agentUrl, cfg.agentUrl]);
    } catch { checks.push(["Bridge config valid", false, "invalid JSON"]); }
  }

  for (const [name, pass, extra] of checks) {
    ok(name, pass, extra);
  }

  const issues = checks.filter(([, pass]) => !pass).length;
  console.log(`\n${issues === 0 ? "✓ All checks passed" : `✗ ${issues} issue(s) found. Run: envoymesh setup`}`);
}

async function version(): Promise<void> {
  const pkg = JSON.parse(readFileSync(join(WS_ROOT, "package.json"), "utf-8"));
  console.log(`EnvoyMesh ${pkg.version}`);
  console.log(`OpenClaw  ${shOut("openclaw", ["--version"])}`);
  console.log(`Node      ${process.version}`);
}

async function discover(args: string[]): Promise<void> {
  const query = args.join(" ") || "*";
  console.log(`Discovering peers matching "${query}"...\n`);
  const resp = shOut("curl", [
    "-s", "-X", "POST",
    "http://127.0.0.1:3031/bridge/send",
    "-H", "Content-Type: application/json",
    "-d", JSON.stringify({ to: "envoymesh-discovery", text: `discovery.query: ${query}` }),
  ]);
  console.log(resp || "No response — is the node running?");
}

async function peers(): Promise<void> {
  const tools = shOut("curl", ["-s", "http://127.0.0.1:3031/bridge/list-tools"]);
  console.log(tools || "No response — is the node running?");
}

async function build(): Promise<number> {
  return sh("npm", ["run", "node:build"]);
}

async function testCmd(args: string[]): Promise<number> {
  return sh("npx", ["vitest", "run", ...args]);
}

async function typecheck(): Promise<number> {
  return sh("npm", ["run", "typecheck"]);
}

async function socialCmd(args: string[]): Promise<void> {
  const sub = args[0] || "dev";
  switch (sub) {
    case "dev": case "start": await sh("npm", ["run", "social:dev"]); break;
    case "build": await sh("npm", ["run", "social:build"]); break;
    default: console.log("Usage: envoymesh social <dev|build>");
  }
}

async function tauriCmd(args: string[]): Promise<void> {
  const sub = args[0] || "dev";
  switch (sub) {
    case "dev": await sh("npm", ["run", "tauri:dev"]); break;
    case "build": await sh("npm", ["run", "tauri:build"]); break;
    default: console.log("Usage: envoymesh tauri <dev|build>");
  }
}

async function relay(): Promise<number> {
  return sh("npm", ["run", "relay:dev"]);
}

async function smokeCmd(args: string[]): Promise<void> {
  const sub = args[0] || "local";
  switch (sub) {
    case "local": await sh("npm", ["run", "smoke:local"]); break;
    case "bridge": await sh("npm", ["run", "smoke:openclaw-bridge"]); break;
    default: console.log("Usage: envoymesh smoke <local|bridge>");
  }
}

async function clean(): Promise<void> {
  console.log("Cleaning build artifacts...");
  const dirs = ["packages/openclaw/dist", "packages/openclaw/node_modules",
                "apps/node/dist", "packages/*/dist", "apps/*/dist"];
  for (const d of dirs) {
    const full = join(WS_ROOT, d);
    if (existsSync(full)) {
      shOut("rm", ["-rf", full]);
      console.log("  Removed", d);
    }
  }
  // Clean temp gateway dirs
  shOut("rm", ["-rf", "/tmp/envoymesh-gateway-*"]);
  console.log("Done.");
}

async function logs(args: string[]): Promise<void> {
  const nodePid = shOut("pgrep", ["-f", "tsx src/index.ts"]);
  if (!nodePid) { console.log("Node not running. Start with: envoymesh start"); return; }
  console.log("Node PID:", nodePid);
  console.log("Gateway PID:", shOut("pgrep", ["-f", "openclaw.mjs"]) || "not running");
  console.log("(Use envoymesh oc gateway logs for detailed gateway logs)");
}

async function identity(): Promise<void> {
  const cfgPath = join(WS_ROOT, "data", "default", "bridge-config.json");
  if (!existsSync(cfgPath)) { console.log("No config found — run envoymesh setup"); return; }
  const bridgeCfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
  // Read owner/device from human-profile.json
  const profPath = join(WS_ROOT, "data", "default", "human-profile.json");
  let profile: any = {};
  if (existsSync(profPath)) {
    try { profile = JSON.parse(readFileSync(profPath, "utf-8")); } catch { /* ok */ }
  }
  console.log("Identity\n" + "=".repeat(40));
  console.log(`Owner:   ${profile.owner?.ownerId ?? "unknown"}`);
  console.log(`Device:  ${profile.device?.deviceId ?? "unknown"}`);
  console.log(`Agent:   ${bridgeCfg.agentName ?? "My Agent"} (${bridgeCfg.agentUrl ?? "not set"})`);
  console.log(`Bridge:  ${bridgeCfg.enabled ? "enabled" : "disabled"} (port ${bridgeCfg.listenPort ?? 3031})`);
}

async function inbox(): Promise<void> {
  // List recent chat logs via the WebSocket event history or chat log files
  const chatLogDir = join(WS_ROOT, "data", "default", "chat-logs");
  if (!existsSync(chatLogDir)) { console.log("No chat logs yet"); return; }
  const { readdirSync } = await import("node:fs");
  const files = readdirSync(chatLogDir).filter(f => f.endsWith(".jsonl")).slice(-5);
  if (files.length === 0) { console.log("No messages yet"); return; }
  console.log("Recent messages (" + files.length + " log(s)):\n");
  for (const f of files.reverse()) {
    const content = readFileSync(join(chatLogDir, f), "utf-8");
    const lines = content.trim().split("\n").slice(-10);
    for (const line of lines) {
      try {
        const msg = JSON.parse(line);
        const from = msg.sender?.displayName ?? msg.sender?.ownerId?.slice(0, 12) ?? "?";
        const text = (msg.content?.text ?? "").slice(0, 80);
        const time = msg.metadata?.timestamp?.slice(11, 16) ?? "";
        console.log(`  [${time}] ${from}: ${text}`);
      } catch { /* skip malformed */ }
    }
  }
}

async function send(args: string[]): Promise<void> {
  const to = args[0];
  const text = args.slice(1).join(" ");
  if (!to || !text) { console.log("Usage: envoymesh send <ownerId> <message>"); return; }
  const resp = shOut("curl", [
    "-s", "-X", "POST", "http://127.0.0.1:3031/bridge/send",
    "-H", "Content-Type: application/json",
    "-d", JSON.stringify({ to, text }),
  ]);
  console.log(resp);
}

async function agent(args: string[]): Promise<void> {
  const prompt = args.join(" ");
  if (!prompt) { console.log("Usage: envoymesh agent <prompt>"); return; }
  console.log("Asking agent:", prompt.slice(0, 60) + (prompt.length > 60 ? "..." : ""));
  const resp = shOut("curl", [
    "-s", "-X", "POST", "http://127.0.0.1:18789/webhook/envoymesh",
    "-H", "Content-Type: application/json",
    "-d", JSON.stringify({ fromOwnerId: "envoymesh-cli", text: prompt }),
  ]);
  console.log(resp || "No response — is the gateway running?");
}

async function vault(args: string[]): Promise<void> {
  const sub = args[0] || "list";
  const vaultDir = join(WS_ROOT, "shared_vault");
  switch (sub) {
    case "list": {
      if (!existsSync(vaultDir)) { console.log("Vault not found at", vaultDir); return; }
      const { readdirSync, statSync } = await import("node:fs");
      const files = readdirSync(vaultDir, { recursive: true }).filter(f =>
        statSync(join(vaultDir, f as string)).isFile()
      ).slice(0, 20);
      console.log("Vault files (" + files.length + " shown):");
      files.forEach(f => console.log("  " + f));
      break;
    }
    case "search": {
      const q = args.slice(1).join(" ");
      if (!q) { console.log("Usage: envoymesh vault search <query>"); return; }
      const { readdirSync, readFileSync: rf } = await import("node:fs");
      const walk = (dir: string): string[] => {
        const results: string[] = [];
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          if (e.isDirectory()) results.push(...walk(p));
          else if (e.isFile() && rf(p, "utf-8").toLowerCase().includes(q.toLowerCase())) results.push(p);
        }
        return results;
      };
      const matches = walk(vaultDir).slice(0, 10);
      console.log(matches.length ? "Matches:" : "No matches found");
      matches.forEach(m => console.log("  " + m.replace(vaultDir + "/", "")));
      break;
    }
    default:
      console.log("Usage: envoymesh vault <list|search>");
  }
}

// ---- main ----

const USAGE = `
EnvoyMesh CLI — manage your node, gateway, and plugins.

Usage: envoymesh <command> [args]

Core:
  start              Start node + gateway
  stop               Stop node + gateway
  restart            Restart node + gateway
  status             Show health of all services
  setup              Run full setup (deps + build + link)

Gateway:
  gateway start      Start just the gateway
  gateway stop       Stop just the gateway
  gateway restart    Restart the gateway
  gateway status     Gateway health check

Plugins & Tools:
  openclaw <...>     Pass through to OpenClaw CLI (plugins, config, doctor, etc.)
  oc <...>           Short alias for openclaw

Debug:
  doctor             Diagnose installation issues
  config             Show bridge config
  chat <to> <msg>    Send a test message via the bridge
  discover [query]   Search for peers on the mesh
  version            Show versions
  help               This help

Workspace:
  build              Build all packages
  test [args]        Run the test suite
  typecheck          Run TypeScript type checking
  clean              Clean build outputs
  social [args]      Run the Social web app
  tauri [args]       Run the Tauri desktop app

Node operations:
  identity / id      Show local identity
  inbox              Show inbox
  send <to> <msg>    Send a message via the bridge
  agent / ask <msg>  Ask the agent a question
  vault <list|search> List or search the local vault

Examples:
  envoymesh setup
  envoymesh start
  envoymesh status
  envoymesh openclaw plugins install tavily
  envoymesh openclaw plugins list
  envoymesh doctor
  envoymesh chat envoy:owner:abc "hello"
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const rest = args.slice(1);

  switch (cmd) {
    case "openclaw": case "oc":
      process.exit(await openclaw(rest));
    case "start":
      process.exit(await start());
    case "stop":
      await stop(); break;
    case "restart":
      await restart(); break;
    case "status":
      await statusCmd(); break;
    case "setup":
      process.exit(await setup());
    case "gateway": case "gw":
      process.exit(await gateway(rest));
    case "config":
      await config(); break;
    case "chat":
      await chat(rest); break;
    case "doctor":
      await doctor(); break;
    case "discover":
      await discover(rest); break;
    case "peers":
      await peers(); break;
    case "build":
      process.exit(await build());
    case "test":
      process.exit(await testCmd(rest));
    case "typecheck":
      process.exit(await typecheck());
    case "social":
      await socialCmd(rest); break;
    case "tauri":
      await tauriCmd(rest); break;
    case "relay":
      process.exit(await relay());
    case "smoke":
      await smokeCmd(rest); break;
    case "clean":
      await clean(); break;
    case "logs":
      await logs(rest); break;
    case "identity": case "id":
      await identity(); break;
    case "inbox":
      await inbox(); break;
    case "send":
      await send(rest); break;
    case "agent": case "ask":
      await agent(rest); break;
    case "vault":
      await vault(rest); break;
    case "version": case "--version": case "-v":
      await version(); break;
    case "help": case "--help": case "-h":
    case undefined:
      console.log(USAGE); break;
    default:
      console.log(`Unknown command: ${cmd}\n${USAGE}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
