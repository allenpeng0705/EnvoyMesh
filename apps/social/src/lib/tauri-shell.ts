type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function readTauriInvoke(): TauriInvoke | null {
  if (typeof window === "undefined") {
    return null;
  }
  const w = window as Window & {
    __TAURI__?: { core?: { invoke?: TauriInvoke } };
  };
  return w.__TAURI__?.core?.invoke ?? null;
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
