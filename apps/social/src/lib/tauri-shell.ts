type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function readTauriInvoke(): TauriInvoke | null {
  if (typeof window === "undefined") {
    return null;
  }
  const w = window as Window & {
    __TAURI__?: { core?: { invoke?: TauriInvoke } };
    __TAURI_INTERNALS__?: { invoke?: TauriInvoke };
  };
  return w.__TAURI__?.core?.invoke ?? w.__TAURI_INTERNALS__?.invoke ?? null;
}

/** True when Social runs inside the Tauri desktop shell (not browser-only dev). */
export function isTauriShell(): boolean {
  return readTauriInvoke() !== null;
}

/**
 * Kill and respawn the node child process (Tauri only).
 * Returns false when not in Tauri or invoke fails.
 */
export async function restartTauriNodeProcess(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const invoke = readTauriInvoke();
  if (!invoke) {
    return { ok: false, reason: "not-tauri" };
  }
  try {
    await invoke("restart_node_process");
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason };
  }
}

export type AppLogPaths = {
  logsDir: string;
  nodeLog: string;
  socialLog: string;
};

export async function getTauriAppLogPaths(): Promise<AppLogPaths | null> {
  const invoke = readTauriInvoke();
  if (!invoke) return null;
  try {
    return (await invoke("get_app_log_paths")) as AppLogPaths;
  } catch {
    return null;
  }
}

export async function appendSocialLogLine(line: string): Promise<void> {
  const invoke = readTauriInvoke();
  if (!invoke) return;
  await invoke("append_social_log", { line });
}

export async function revealTauriLogDir(): Promise<boolean> {
  const invoke = readTauriInvoke();
  if (!invoke) return false;
  try {
    await invoke("reveal_log_dir");
    return true;
  } catch {
    return false;
  }
}
