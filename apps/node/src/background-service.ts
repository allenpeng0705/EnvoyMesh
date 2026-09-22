/**
 * Per-user background service for the home node.
 *
 * Off (the default): no launchd / systemd / Task Scheduler unit. The Tauri app
 * starts the node and stops it when the window quits.
 *
 * On: the OS supervisor runs this same node at login and restarts it when it
 * crashes. A clean exit (code 0) stays down. Turning the setting off removes
 * the unit.
 *
 * The unit text and the supervisor commands follow EnvoyCoder's
 * `@envoydev/platform` service module. stdout and stderr are separate files.
 * Deleting the app runs no code, so the home folder keeps
 * `background-service-uninstall.sh` (or `.cmd`) that removes the unit.
 */

import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const NODE_SERVICE_LABEL = "mesh.envoy.node";

export type NodeServiceState =
  | "not-installed"
  | "installed-stopped"
  | "running"
  | "failed"
  | "unsupported"
  | "unknown";

export interface NodeBackgroundServiceStatus {
  state: NodeServiceState;
  enabled?: boolean;
  pid?: number;
  detail: string;
}

const RESPAWN_FILE = "background-service.respawn";
const STARTING_FILE = "background-service.starting";

/** Env the supervisor must pass through so the service node matches the app node. */
const ENV_KEYS = [
  "ENVOYMESH_HOME",
  "ENVOYMESH_PROFILE",
  "ENVOYMESH_IPFS_PATH",
  "ENVOYMESH_IPFS_EXE",
  "ENVOYMESH_NODE_EXE",
  "ENVOYMESH_NODE_BUNDLE_DIR",
  "ENVOYMESH_OPENCLAW_DIR",
  "ENVOYMESH_PI_CLI",
  "ENVOYMESH_PI_DIR",
  "ENVOYMESH_PI_TOOLS_DIR",
  "ENVOYMESH_BUNDLED_SKILLS_DIR",
  "TAURI_RESOURCE_DIR",
  "ENVOY_HARNESS_RESOURCES",
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "LANG",
  "TMPDIR",
  "TEMP",
  "SystemRoot",
] as const;

function xml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function systemdArg(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, () => "$$")
    .replace(/%/g, "%%")}"`;
}

export function meshHomeDir(): string {
  const explicit = process.env.ENVOYMESH_HOME?.trim();
  if (explicit) return explicit;
  const profile = process.env.ENVOYMESH_PROFILE?.trim();
  if (profile) {
    return path.basename(profile) === "profile" ? path.dirname(profile) : profile;
  }
  return path.join(homedir(), ".envoymesh");
}

export function respawnAppFlagPath(home = meshHomeDir()): string {
  return path.join(home, RESPAWN_FILE);
}

export function serviceStartingFlagPath(home = meshHomeDir()): string {
  return path.join(home, STARTING_FILE);
}

function platformId(): "macos" | "linux" | "windows" | "other" {
  if (process.platform === "darwin") return "macos";
  if (process.platform === "linux") return "linux";
  if (process.platform === "win32") return "windows";
  return "other";
}

function capturedEnv(): Record<string, string> {
  const env: Record<string, string> = {
    ENVOYMESH_MANAGED_BY: "service",
    ENVOYMESH_GUARDIAN_EXIT_ON_LAG: "1",
  };
  for (const key of ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) env[key] = value;
  }
  if (!env.ENVOYMESH_HOME) env.ENVOYMESH_HOME = meshHomeDir();
  return env;
}

interface UnitPlan {
  file: string;
  contents: string;
  directories: string[];
  install: Array<{ command: string; args: string[]; tolerate?: "failure" }>;
  uninstall: Array<{ command: string; args: string[]; tolerate?: "failure" }>;
  status: Array<{ command: string; args: string[] }>;
}

const LAUNCHER_SCRIPT = "background-service-launch.cjs";
const LAUNCHER_SPEC = "background-service-launch.json";
const UNINSTALL_HELPER = process.platform === "win32"
  ? "background-service-uninstall.cmd"
  : "background-service-uninstall.sh";

function launcherSource(): string {
  return `const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const spec = JSON.parse(fs.readFileSync(path.join(__dirname, ${JSON.stringify(LAUNCHER_SPEC)}), "utf8"));
if (!spec.execPath || !spec.entry) process.exit(1);
const child = spawn(spec.execPath, [spec.entry], {
  cwd: spec.cwd,
  env: { ...process.env, ...spec.env },
  stdio: "inherit",
  windowsHide: true,
});
let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  try { child.kill(signal); } catch (err) {}
}
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
if (process.platform !== "win32") process.on("SIGHUP", () => stop("SIGHUP"));
child.on("exit", (code, signal) => {
  // The supervisor asked this launcher to stop. Exit 0 so it does not start another copy.
  if (stopping) process.exit(0);
  if (signal) process.exit(1);
  process.exit(code == null ? 1 : code);
});
`;
}

/** @internal The wrapper the login service actually runs. */
export function launcherSourceForTests(): string {
  return launcherSource();
}

async function writeLauncher(): Promise<string> {
  const home = meshHomeDir();
  await mkdir(home, { recursive: true, mode: 0o700 });
  await writeFile(
    path.join(home, LAUNCHER_SPEC),
    `${JSON.stringify({
      execPath: process.execPath,
      entry: process.argv[1] ?? "",
      cwd: process.cwd(),
      env: capturedEnv(),
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
  const script = path.join(home, LAUNCHER_SCRIPT);
  await writeFile(script, launcherSource(), { mode: 0o600 });
  await writeFile(path.join(home, UNINSTALL_HELPER), uninstallHelperSource(home), { mode: 0o700 });
  return script;
}

/** A helper that does not need the app. Deleting the app runs no code, so this file is what removes the service. */
function uninstallHelperSource(home: string): string {
  const launcher = path.join(home, LAUNCHER_SCRIPT);
  const spec = path.join(home, LAUNCHER_SPEC);
  const helper = path.join(home, UNINSTALL_HELPER);
  if (process.platform === "win32") {
    const taskXml = path.join(homedir(), "AppData", "Local", "EnvoyMesh", `${NODE_SERVICE_LABEL}.xml`);
    return `@echo off
schtasks /Delete /TN ${NODE_SERVICE_LABEL} /F
del /f /q "${taskXml}"
del /f /q "${launcher}"
del /f /q "${spec}"
del /f /q "${helper}"
echo Background service removed.
`;
  }
  if (process.platform === "linux") {
    const unit = path.join(homedir(), ".config", "systemd", "user", `${NODE_SERVICE_LABEL}.service`);
    return `#!/bin/sh
systemctl --user disable --now ${NODE_SERVICE_LABEL}.service || true
systemctl --user daemon-reload || true
rm -f "${unit}"
rm -f "${launcher}" "${spec}" "${helper}"
echo "Background service removed."
`;
  }
  const uid = process.getuid?.() ?? 0;
  const plist = path.join(homedir(), "Library", "LaunchAgents", `${NODE_SERVICE_LABEL}.plist`);
  return `#!/bin/sh
launchctl bootout "gui/${uid}/${NODE_SERVICE_LABEL}" || true
rm -f "${plist}"
rm -f "${launcher}" "${spec}" "${helper}"
echo "Background service removed."
`;
}

function launchdPlan(script: string): UnitPlan {
  const uid = process.getuid?.() ?? 0;
  const domain = `gui/${uid}`;
  const target = `${domain}/${NODE_SERVICE_LABEL}`;
  const file = path.join(homedir(), "Library", "LaunchAgents", `${NODE_SERVICE_LABEL}.plist`);
  const logDir = path.join(meshHomeDir(), "logs");
  const args = [process.execPath, script];
  const contents = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(NODE_SERVICE_LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((argument) => `    <string>${xml(argument)}</string>`).join("\n")}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(meshHomeDir())}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${xml(path.join(logDir, "node-service.out.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(path.join(logDir, "node-service.err.log"))}</string>
</dict>
</plist>
`;
  return {
    file,
    contents,
    directories: [path.dirname(file), logDir],
    install: [
      { command: "launchctl", args: ["bootout", target], tolerate: "failure" },
      { command: "launchctl", args: ["bootstrap", domain, file] },
      { command: "launchctl", args: ["enable", target], tolerate: "failure" },
    ],
    uninstall: [{ command: "launchctl", args: ["bootout", target], tolerate: "failure" }],
    status: [{ command: "launchctl", args: ["print", target] }],
  };
}

function systemdPlan(script: string): UnitPlan {
  const file = path.join(homedir(), ".config", "systemd", "user", `${NODE_SERVICE_LABEL}.service`);
  const command = [process.execPath, script].map(systemdArg).join(" ");
  const contents = `[Unit]
Description=EnvoyMesh home node

[Service]
Type=simple
WorkingDirectory=${systemdArg(meshHomeDir())}
ExecStart=${command}
Restart=always
RestartSec=5
RestartPreventExitStatus=0 4

[Install]
WantedBy=default.target
`;
  const unit = `${NODE_SERVICE_LABEL}.service`;
  return {
    file,
    contents,
    directories: [path.dirname(file), path.join(meshHomeDir(), "logs")],
    install: [
      { command: "systemctl", args: ["--user", "daemon-reload"] },
      { command: "systemctl", args: ["--user", "enable", "--now", unit] },
    ],
    uninstall: [
      { command: "systemctl", args: ["--user", "disable", "--now", unit], tolerate: "failure" },
      { command: "systemctl", args: ["--user", "daemon-reload"] },
    ],
    status: [
      {
        command: "systemctl",
        args: ["--user", "show", unit, "--property=LoadState,ActiveState,UnitFileState,MainPID"],
      },
    ],
  };
}

function windowsPlan(script: string): UnitPlan {
  const file = path.join(homedir(), "AppData", "Local", "EnvoyMesh", `${NODE_SERVICE_LABEL}.xml`);
  const args = /\s/.test(script) ? `"${script}"` : script;
  const contents = `<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled></LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <!-- Task Scheduler has no "restart unless the exit was clean" switch.
           A clean exit is not a failure. A high count is what keeps a crash
           from ending the day; three retries would. -->
      <Count>999</Count>
    </RestartOnFailure>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xml(process.execPath)}</Command>
      <Arguments>${xml(args)}</Arguments>
    </Exec>
  </Actions>
</Task>
`;
  return {
    file,
    contents,
    directories: [path.dirname(file)],
    install: [{ command: "schtasks", args: ["/Create", "/TN", NODE_SERVICE_LABEL, "/XML", file, "/F"] }],
    uninstall: [{ command: "schtasks", args: ["/Delete", "/TN", NODE_SERVICE_LABEL, "/F"], tolerate: "failure" }],
    status: [
      { command: "schtasks", args: ["/Query", "/TN", NODE_SERVICE_LABEL, "/XML"] },
      { command: "schtasks", args: ["/Query", "/TN", NODE_SERVICE_LABEL, "/FO", "LIST"] },
    ],
  };
}

/** @internal */
export function unitPlanForTests(platform: "macos" | "linux" | "windows", script = "/tmp/home/background-service-launch.cjs"): UnitPlan {
  if (platform === "macos") return launchdPlan(script);
  if (platform === "linux") return systemdPlan(script);
  return windowsPlan(script);
}

function plan(script: string): UnitPlan | null {
  const id = platformId();
  if (id === "macos") return launchdPlan(script);
  if (id === "linux") return systemdPlan(script);
  if (id === "windows") return windowsPlan(script);
  return null;
}

function run(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      resolve({ code: 127, stdout, stderr: stderr || error.message });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export function parseNodeServiceStatus(
  platform: "macos" | "linux" | "windows",
  code: number,
  stdout: string,
  stderr: string,
  secondary?: { code: number; stdout: string },
): NodeBackgroundServiceStatus {
  const detail = (code === 0 ? stdout : `${stdout}\n${stderr}`).trim();
  if (platform === "macos") {
    if (code !== 0) {
      return /could not find (?:the )?(?:specified )?service|service not found|no such process/i.test(`${stdout}\n${stderr}`)
        ? { state: "not-installed", detail }
        : { state: "unknown", detail };
    }
    const pid = /pid = (\d+)/.exec(stdout);
    if (/state = running/.test(stdout)) {
      return { state: "running", enabled: true, ...(pid ? { pid: Number(pid[1]) } : {}), detail };
    }
    if (/state = /.test(stdout)) return { state: "installed-stopped", enabled: true, detail };
    return { state: "unknown", detail };
  }
  if (platform === "linux") {
    if (code !== 0) return { state: "unknown", detail };
    const field = (name: string) => new RegExp(`^${name}=(.*)$`, "m").exec(stdout)?.[1]?.trim() ?? "";
    if (field("LoadState") === "not-found") return { state: "not-installed", detail };
    const unitFile = field("UnitFileState");
    const enabled =
      unitFile === "enabled" || unitFile === "enabled-runtime"
        ? true
        : unitFile === "disabled" || unitFile === "masked"
          ? false
          : undefined;
    const active = field("ActiveState");
    const mainPid = Number(field("MainPID"));
    const pid = Number.isInteger(mainPid) && mainPid > 0 ? { pid: mainPid } : {};
    const withEnabled = enabled === undefined ? {} : { enabled };
    if (active === "active") return { state: "running", ...withEnabled, ...pid, detail };
    if (active === "failed") return { state: "failed", ...withEnabled, ...pid, detail };
    if (active === "inactive" || active === "activating" || active === "deactivating") {
      return { state: "installed-stopped", ...withEnabled, detail };
    }
    return { state: "unknown", ...withEnabled, detail };
  }
  if (code !== 0) {
    return /cannot find the file specified|0x80070002|does not exist in the system/i.test(`${stdout}\n${stderr}`)
      ? { state: "not-installed", detail }
      : { state: "unknown", detail };
  }
  const settings = /<Settings>([\s\S]*?)<\/Settings>/i.exec(stdout)?.[1];
  const enabledXml =
    settings === undefined ? undefined : /<Enabled>\s*(true|false)\s*<\/Enabled>/i.exec(settings)?.[1]?.toLowerCase();
  const enabled = enabledXml === undefined ? undefined : enabledXml === "true";
  const withEnabled = enabled === undefined ? {} : { enabled };
  const hint = secondary?.code === 0 ? secondary.stdout : "";
  const statusWord = /Status:\s*(\S+)/i.exec(hint)?.[1] ?? "";
  if (/^running$/i.test(statusWord)) return { state: "running", ...withEnabled, detail };
  if (/^ready$/i.test(statusWord)) return { state: "installed-stopped", ...withEnabled, detail };
  // A translated status word is not "stopped". Say we could not read it.
  return { state: "unknown", ...withEnabled, detail };
}

async function readStatus(unit: UnitPlan): Promise<NodeBackgroundServiceStatus> {
  const id = platformId();
  if (id === "other") return { state: "unsupported", detail: "This system cannot run a background service." };
  const step = unit.status[0];
  if (!step) return { state: "unknown", detail: "No status command." };
  const result = await run(step.command, step.args);
  const extra = unit.status[1];
  const secondary = extra ? await run(extra.command, extra.args) : undefined;
  return parseNodeServiceStatus(
    id,
    result.code,
    result.stdout,
    result.stderr,
    secondary ? { code: secondary.code, stdout: secondary.stdout } : undefined,
  );
}

function defer(script: string): void {
  const child = spawn(process.execPath, ["-e", script], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function handOffExit(): void {
  setTimeout(() => {
    process.exit(0);
  }, 400).unref?.();
}

export async function getNodeBackgroundServiceStatus(): Promise<NodeBackgroundServiceStatus> {
  const unit = plan(path.join(meshHomeDir(), LAUNCHER_SCRIPT));
  if (!unit) return { state: "unsupported", detail: "This system cannot run a background service." };
  return readStatus(unit);
}

/**
 * Turn the background service on or off.
 *
 * On, while this process was started by the app: write the unit, then leave.
 * A detached helper loads it after this process exits, so the two do not fight
 * over the home lock. The Tauri app does not restart an exit 0.
 *
 * Off, while this process is the service: remove the unit and ask the open app
 * to start a normal node again.
 */
export async function setNodeBackgroundService(enabled: boolean): Promise<NodeBackgroundServiceStatus> {
  const script = enabled ? await writeLauncher() : path.join(meshHomeDir(), LAUNCHER_SCRIPT);
  const unit = plan(script);
  if (!unit) return { state: "unsupported", detail: "This system cannot run a background service." };
  const serviceOwned = process.env.ENVOYMESH_MANAGED_BY === "service";

  if (!enabled) {
    if (serviceOwned) {
      await writeFile(respawnAppFlagPath(), "1", { mode: 0o600 });
      const steps = unit.uninstall.map((step) => ({ ...step }));
      defer(deferredSteps(steps, [
        unit.file,
        path.join(meshHomeDir(), LAUNCHER_SCRIPT),
        path.join(meshHomeDir(), LAUNCHER_SPEC),
        path.join(meshHomeDir(), UNINSTALL_HELPER),
      ]));
      handOffExit();
      return { state: "not-installed", detail: "Background service is turning off. The app will run the node." };
    }
    for (const step of unit.uninstall) {
      const result = await run(step.command, step.args);
      if (result.code !== 0 && step.tolerate !== "failure") {
        return { state: "failed", detail: `${step.command} failed: ${result.stderr || result.stdout}` };
      }
    }
    await rm(unit.file, { force: true });
    const home = meshHomeDir();
    await rm(path.join(home, LAUNCHER_SCRIPT), { force: true });
    await rm(path.join(home, LAUNCHER_SPEC), { force: true });
    await rm(path.join(home, UNINSTALL_HELPER), { force: true });
    return readStatus(unit);
  }

  for (const directory of unit.directories) {
    await mkdir(directory, { recursive: true });
  }
  await writeFile(unit.file, unit.contents, { mode: 0o600 });
  if (serviceOwned) {
    return { state: "running", detail: "Background service is already running this node." };
  }
  defer(deferredSteps(unit.install));
  await writeFile(serviceStartingFlagPath(), "1", { mode: 0o600 });
  handOffExit();
  return {
    state: "installed-stopped",
    detail: "Background service is starting. This window can close and the node stays up.",
  };
}

function deferredSteps(
  steps: Array<{ command: string; args: string[]; tolerate?: "failure" }>,
  removeFiles: string[] = [],
): string {
  const payload = JSON.stringify({ steps, removeFiles });
  return `
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const job = ${payload};
setTimeout(() => {
  const next = (index) => {
    const step = job.steps[index];
    if (!step) {
      for (const file of job.removeFiles) {
        try { fs.rmSync(file, { force: true }); } catch {}
      }
      return;
    }
    const child = spawn(step.command, step.args, { windowsHide: true });
    child.on("close", (code) => {
      if (code && code !== 0 && step.tolerate !== "failure") return;
      next(index + 1);
    });
    child.on("error", () => {
      if (step.tolerate === "failure") next(index + 1);
    });
  };
  next(0);
}, 1500);
`;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return pathToFileURL(path.resolve(entry)).href === import.meta.url;
}

if (isDirectRun()) {
  const command = process.argv[2];
  if (command === "status") {
    void getNodeBackgroundServiceStatus().then((status) => {
      process.stdout.write(`${status.state}\n`);
      if (status.detail) process.stdout.write(`${status.detail}\n`);
    });
  } else if (command === "uninstall") {
    void setNodeBackgroundService(false).then((status) => {
      process.stdout.write(`${status.detail || status.state}\n`);
      if (status.state === "failed") process.exit(1);
    });
  } else {
    process.stderr.write("Usage: node background-service.js status|uninstall\n");
    process.exit(1);
  }
}
