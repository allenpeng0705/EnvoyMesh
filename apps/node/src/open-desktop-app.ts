/**
 * Open allowlisted desktop apps on the home node (owner-only).
 * Mac / Windows / Linux — never accepts free-form executable paths from clients.
 * When the app is not installed, opens the official product website instead.
 */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { DESKTOP_APP_SITE, type DesktopAppId } from "@envoymesh/api";

export type { DesktopAppId };

export const DESKTOP_APP_IDS: readonly DesktopAppId[] = ["obsidian", "notion"] as const;

export function isDesktopAppId(value: unknown): value is DesktopAppId {
  return value === "obsidian" || value === "notion";
}

export interface OpenDesktopAppResult {
  ok: boolean;
  error?: string;
  openedWebsite?: boolean;
  websiteUrl?: string;
}

/** Product home page used when Open cannot launch a local install. */
export function desktopAppHomeUrl(app: DesktopAppId): string {
  return DESKTOP_APP_SITE[app].home;
}

/** Download / desktop-install page for Plugins card links. */
export function desktopAppDownloadUrl(app: DesktopAppId): string {
  return DESKTOP_APP_SITE[app].download;
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

async function openUrlInDefaultBrowser(url: string): Promise<void> {
  const os = platform();
  if (os === "darwin") {
    await runAndWait("open", [url]);
    return;
  }
  if (os === "win32") {
    // `cmd /c start "" <url>` — empty title avoids swallowing the URL as the window title.
    await spawnDetached("cmd.exe", ["/c", "start", "", url]);
    return;
  }
  await spawnDetached("xdg-open", [url]);
}

async function openWebsiteFallback(app: DesktopAppId): Promise<OpenDesktopAppResult> {
  const websiteUrl = desktopAppHomeUrl(app);
  try {
    await openUrlInDefaultBrowser(websiteUrl);
    return { ok: true, openedWebsite: true, websiteUrl };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error:
        app === "obsidian"
          ? `Obsidian is not installed. Could not open ${websiteUrl} (${detail}).`
          : `Notion is not installed. Could not open ${websiteUrl} (${detail}).`,
      websiteUrl,
    };
  }
}

async function openOnDarwin(app: DesktopAppId): Promise<OpenDesktopAppResult> {
  if (!macDesktopAppInstalled(app)) return openWebsiteFallback(app);
  await runAndWait("open", ["-a", macAppName(app)]);
  return { ok: true };
}

async function openOnWin32(app: DesktopAppId): Promise<OpenDesktopAppResult> {
  const exe = windowsDesktopAppExe(app);
  if (!exe) return openWebsiteFallback(app);
  await spawnDetached(exe, []);
  return { ok: true };
}

async function openOnLinux(app: DesktopAppId): Promise<OpenDesktopAppResult> {
  const bin = app === "obsidian" ? "obsidian" : "notion-app";
  try {
    await runAndWait("which", [bin]);
  } catch {
    return openWebsiteFallback(app);
  }
  await spawnDetached(bin, []);
  return { ok: true };
}

/**
 * Launch Obsidian or Notion on the home machine.
 * Allowlist-only — clients cannot pass arbitrary commands.
 * If the app is not installed, opens the official website in the default browser.
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
