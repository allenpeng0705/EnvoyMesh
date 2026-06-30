/**
 * terminalExec runtime (Step 34).
 *
 * Extracted from `node-service-impl.ts`. Owns the public `terminalExec`
 * method which writes a command to the terminal stdin, polls the
 * scrollback until stable for 400ms (or 12s timeout), and returns
 * the tail of the scrollback as a UTF-8 string.
 */
export interface TerminalExecContext {
  /** Resolve the terminal manager (throws if not initialised). */
  requireTerminalManager(): {
    writeStdin(sessionId: string, buf: Buffer): void;
    getScrollback(sessionId: string): Buffer;
  };
}

export interface TerminalExecParams {
  sessionId: string;
  command: string;
}

export interface TerminalExecResult {
  output: string;
}

const MAX_WAIT_MS = 12_000;
const POLL_INTERVAL_MS = 200;
const STABLE_MS = 400;
const MIN_ELAPSED_BEFORE_STABLE = 800;
const MAX_TAIL_BYTES = 2_097_152;

export async function terminalExecViaRuntime(
  ctx: TerminalExecContext,
  params: TerminalExecParams,
): Promise<TerminalExecResult> {
  const mgr = ctx.requireTerminalManager();
  mgr.writeStdin(params.sessionId, Buffer.from(params.command + "\r", "utf8"));

  const startedAt = Date.now();
  let lastLen = mgr.getScrollback(params.sessionId).length;
  let stableSince = 0;

  return new Promise<TerminalExecResult>((resolve) => {
    const poll = (): void => {
      const currentBuf = mgr.getScrollback(params.sessionId);
      const elapsed = Date.now() - startedAt;
      if (currentBuf.length !== lastLen) {
        lastLen = currentBuf.length;
        stableSince = elapsed;
      }
      if (
        elapsed >= MAX_WAIT_MS ||
        (elapsed - stableSince >= STABLE_MS && elapsed > MIN_ELAPSED_BEFORE_STABLE)
      ) {
        const tail = currentBuf.length > MAX_TAIL_BYTES
          ? currentBuf.subarray(currentBuf.length - MAX_TAIL_BYTES)
          : currentBuf;
        resolve({ output: tail.toString("utf8") });
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    };
    setTimeout(poll, POLL_INTERVAL_MS);
  });
}