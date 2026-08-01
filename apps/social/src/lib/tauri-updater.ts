import type { DownloadEvent } from "@tauri-apps/plugin-updater";
import { isTauriShell } from "./tauri-shell.js";

/** Minimal surface used by Settings — value imports of Tauri plugins stay dynamic (mobile-safe). */
export type DesktopUpdateHandle = {
  version: string;
  body?: string;
  downloadAndInstall: (onEvent?: (event: DownloadEvent) => void) => Promise<void>;
};

export type UpdateCheckResult =
  | { status: "unavailable" }
  | { status: "up-to-date" }
  | { status: "available"; update: DesktopUpdateHandle }
  | { status: "error"; reason: string };

export type UpdateInstallProgress =
  | { phase: "stopping-node" }
  | { phase: "downloading"; downloaded: number; total: number | null }
  | { phase: "installing" }
  | { phase: "relaunching" };

async function stopNodeForUpdate(): Promise<void> {
  if (typeof window === "undefined") return;
  const w = window as Window & {
    __TAURI__?: { core?: { invoke?: (cmd: string) => Promise<unknown> } };
    __TAURI_INTERNALS__?: { invoke?: (cmd: string) => Promise<unknown> };
  };
  const invoke = w.__TAURI__?.core?.invoke ?? w.__TAURI_INTERNALS__?.invoke;
  if (!invoke) return;
  try {
    await invoke("stop_node_process");
  } catch {
    // Best-effort — Exit hooks also stop the child.
  }
}

/** Check GitHub `latest.json` (or configured endpoints) for a newer desktop build. */
export async function checkDesktopUpdate(): Promise<UpdateCheckResult> {
  if (!isTauriShell()) {
    return { status: "unavailable" };
  }
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      return { status: "up-to-date" };
    }
    return {
      status: "available",
      update: {
        version: update.version,
        body: update.body,
        downloadAndInstall: (onEvent) => update.downloadAndInstall(onEvent),
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: "error", reason };
  }
}

/**
 * Download, verify, install, and relaunch. Stops the home-node child first so
 * OpenClaw/Node are not left orphaned mid-replace.
 */
export async function installDesktopUpdate(
  update: DesktopUpdateHandle,
  onProgress?: (progress: UpdateInstallProgress) => void,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isTauriShell()) {
    return { ok: false, reason: "not-tauri" };
  }
  try {
    onProgress?.({ phase: "stopping-node" });
    await stopNodeForUpdate();

    let downloaded = 0;
    let total: number | null = null;
    onProgress?.({ phase: "downloading", downloaded: 0, total: null });

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength ?? null;
          downloaded = 0;
          onProgress?.({ phase: "downloading", downloaded, total });
          break;
        case "Progress":
          downloaded += event.data.chunkLength ?? 0;
          onProgress?.({ phase: "downloading", downloaded, total });
          break;
        case "Finished":
          onProgress?.({ phase: "installing" });
          break;
      }
    });

    onProgress?.({ phase: "relaunching" });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason };
  }
}
