/**
 * Open allowlisted desktop apps on the home node (owner-only).
 * Mac / Windows / Linux — never accepts free-form executable paths from clients.
 */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir, platform } from "node:os";
import { join } from "node:path";

export type DesktopAppId = "obsidian" | "notion";

export const DESKTOP_APP_IDS: readonly DesktopAppId[] = ["obsidian", "notion"] as const;

export function isDesktopAppId(value: unknown): value is DesktopAppId {
  return value === "obsidian" || value === "notion";
}

export interface OpenDesktopAppResult {
  ok: boolean;
  error?: string;
}

function spawnDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", detached: true, shell: false });
    child.on("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/** Wait for process exit — used to verify `open -a` found the app. */
function runAndWait(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", shell: false });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "null"}`));
    });
  });
}

function macAppName(app: DesktopAppId): string {
  return app === "obsidian" ? "Obsidian" : "Notion";
}

function macAppBundlePaths(app: DesktopAppId): string[] {
  const name = `${macAppName(app)}.app`;
  return [
    join("/Applications", name),
    join(homedir(), "Applications", name),
  ];
}

export function macDesktopAppInstalled(app: DesktopAppId): boolean {
  return macAppBundlePaths(app).some((p) => existsSync(p));
}

function windowsExeCandidates(app: DesktopAppId): string[] {
  const local = process.env.LOCALAPPDATA?.trim() || join(homedir(), "AppData", "Local");
  if (app === "obsidian") {
    return [
      join(local, "Programs", "Obsidian", "Obsidian.exe"),
      join(local, "Obsidian", "Obsidian.exe"),
    ];
  }
  return [
    join(local, "Programs", "Notion", "Notion.exe"),
    join(local, "Notion", "Notion.exe"),
  ];
}

export function windowsDesktopAppExe(app: DesktopAppId): string | null {
  for (const exe of windowsExeCandidates(app)) {
    if (existsSync(exe)) return exe;
  }
  return null;
}

function notInstalledError(app: DesktopAppId): OpenDesktopAppResult {
  return {
    ok: false,
    error:
      app === "obsidian"
        ? "Obsidian is not installed on this computer. Install it from obsidian.md."
        : "Notion is not installed on this computer. Install it from notion.so.",
  };
}

async function openOnDarwin(app: DesktopAppId): Promise<OpenDesktopAppResult> {
  if (!macDesktopAppInstalled(app)) return notInstalledError(app);
  // `open -a` exits non-zero when the app cannot be resolved.
  await runAndWait("open", ["-a", macAppName(app)]);
  return { ok: true };
}

async function openOnWin32(app: DesktopAppId): Promise<OpenDesktopAppResult> {
  const exe = windowsDesktopAppExe(app);
  if (!exe) return notInstalledError(app);
  await spawnDetached(exe, []);
  return { ok: true };
}

async function openOnLinux(app: DesktopAppId): Promise<OpenDesktopAppResult> {
  const bin = app === "obsidian" ? "obsidian" : "notion-app";
  try {
    await runAndWait("which", [bin]);
  } catch {
    return notInstalledError(app);
  }
  await spawnDetached(bin, []);
  return { ok: true };
}

/**
 * Launch Obsidian or Notion on the home machine.
 * Allowlist-only — clients cannot pass arbitrary commands.
 * Returns ok:false when the app is not installed (does not pretend URI launch succeeded).
 */
export async function openDesktopApp(app: DesktopAppId): Promise<OpenDesktopAppResult> {
  const os = platform();
  try {
    if (os === "darwin") return await openOnDarwin(app);
    if (os === "win32") return await openOnWin32(app);
    return await openOnLinux(app);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error:
        app === "obsidian"
          ? `Could not open Obsidian (${detail}).`
          : `Could not open Notion (${detail}).`,
    };
  }
}
