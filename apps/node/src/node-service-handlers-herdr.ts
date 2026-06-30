/**
 * Herdr-related public API runtime (Step 35).
 *
 * Extracted from `node-service-impl.ts`. Owns:
 *   - openInHerdr (spawn the herdr terminal in a detached process)
 *   - terminalGetHerdrExportHint (write a session's scrollback to
 *     a herdr export file)
 */
export interface OpenInHerdrContext {
  /** Resolve the openclaw workspace dir (or throw). */
  resolveOpenClawWorkspaceDir(): string;
}

export interface TerminalGetHerdrExportHintContext {
  /** Resolve the profile dir (where herdr export files live). */
  getProfileDir(): string | null;
  /** Resolve the terminal manager (or throw if not initialised). */
  requireTerminalManager(): {
    listTerminalSessions(): Array<{
      sessionId: string;
      title: string;
      state: string;
    }>;
    getScrollbackTail(sessionId: string, maxBytes: number): string;
  };
}

export interface OpenInHerdrParams {
  cwd?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type OpenInHerdrResult = any;

export async function openInHerdrViaRuntime(
  ctx: OpenInHerdrContext,
  params: OpenInHerdrParams | undefined,
): Promise<OpenInHerdrResult> {
  if (process.platform === "win32") {
    return { ok: false, reason: "herdr.unsupportedPlatform" };
  }
  let cwd: string;
  try {
    cwd = params?.cwd?.trim() || ctx.resolveOpenClawWorkspaceDir();
  } catch {
    return { ok: false, reason: "herdr.workspaceUnavailable" };
  }
  const { spawn } = await import("node:child_process");
  return await new Promise<OpenInHerdrResult>((resolve) => {
    let settled = false;
    const finish = (result: OpenInHerdrResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const child = spawn("herdr", [], {
      cwd,
      detached: true,
      stdio: "ignore",
    });
    child.once("error", () => finish({ ok: false, reason: "herdr.spawnFailed" }));
    child.unref();
    process.nextTick(() => {
      if (!settled) finish({ ok: true, cwd });
    });
  });
}

export async function terminalGetHerdrExportHintViaRuntime(
  ctx: TerminalGetHerdrExportHintContext,
  params: { sessionId: string },
): Promise<unknown> {
  const sessionId = params.sessionId.trim();
  if (!sessionId) {
    throw new Error("terminal.sessionNotFound");
  }
  const manager = ctx.requireTerminalManager();
  const summary = manager.listTerminalSessions().find((s) => s.sessionId === sessionId);
  if (!summary) {
    throw new Error("terminal.sessionNotFound");
  }
  if (summary.state !== "running") {
    throw new Error("terminal.sessionNotRunning");
  }
  const scrollback = manager.getScrollbackTail(sessionId, 64 * 1024);
  const profileDir = ctx.getProfileDir();
  if (!profileDir) {
    throw new Error("terminal.profileNotInitialised");
  }
  const { writeHerdrExportFile } = await import("./herdr-export.js");
  return writeHerdrExportFile(profileDir, sessionId, summary.title, scrollback) as never;
}