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

/**
 * Native OS folder picker (macOS / Linux / Windows) via Tauri.
 * Returns the absolute path, or null if cancelled / not in the desktop shell.
 */
export async function pickTauriDirectory(opts?: {
  title?: string;
  defaultPath?: string;
}): Promise<string | null> {
  const invoke = readTauriInvoke();
  if (!invoke) return null;
  try {
    const picked = (await invoke("pick_directory", {
      title: opts?.title,
      defaultPath: opts?.defaultPath,
    })) as string | null;
    const trimmed = typeof picked === "string" ? picked.trim() : "";
    return trimmed || null;
  } catch {
    return null;
  }
}

/**
 * Status of the install-time OpenClaw self-reference heal probe.
 *
 * "no-bundle"   - No bundled OpenClaw tree (sidecar-only build).
 * "healthy"     - Self-reference was already in place at launch.
 * "healed"      - Probe detected a broken/missing self-ref and repaired it.
 *                 Common after a fresh .dmg/.msi install where Gatekeeper
 *                 stripped the relative symlinks.
 * "heal-failed" - Probe detected a broken self-ref but the heal did not
 *                 complete (e.g. permission denied). Check node.log.
 */
export type OpenclawHealState =
  | "no-bundle"
  | "healthy"
  | "healed"
  | "heal-failed"
  | "unknown";

export type OpenclawHealStatus = {
  state: OpenclawHealState;
  openclawDir: string | null;
  selfRefPkg: string | null;
  message: string;
};

/**
 * Returns the OpenClaw self-reference heal status captured at launch.
 * Returns null when running outside the Tauri desktop shell.
 */
export async function getTauriOpenclawHealStatus(): Promise<OpenclawHealStatus | null> {
  const invoke = readTauriInvoke();
  if (!invoke) return null;
  try {
    const raw = (await invoke("get_openclaw_heal_status")) as {
      state: string;
      openclaw_dir?: string | null;
      self_ref_pkg?: string | null;
      message: string;
    };
    // Defensive normalisation — the Rust side already sends a known
    // discriminator, but the IPC layer can sometimes drop fields.
    const allowed: OpenclawHealState[] = [
      "no-bundle",
      "healthy",
      "healed",
      "heal-failed",
    ];
    const state: OpenclawHealState = allowed.includes(
      raw.state as OpenclawHealState,
    )
      ? (raw.state as OpenclawHealState)
      : "unknown";
    return {
      state,
      openclawDir: raw.openclaw_dir ?? null,
      selfRefPkg: raw.self_ref_pkg ?? null,
      message: raw.message ?? "",
    };
  } catch {
    return null;
  }
}
