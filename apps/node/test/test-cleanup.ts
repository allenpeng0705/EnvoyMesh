/**
 * Test cleanup helpers for files in apps/node/test/.
 *
 * Currently exports a single `cleanupTempDir` that retries on transient fs
 * races (ENOTEMPTY / EBUSY) caused by parallel async writes that haven't
 * settled yet. See known-broken-e2e.md for the flake pattern.
 */
import { rm } from "node:fs/promises";

/**
 * Best-effort recursive delete of a temp dir.
 *
 * On macOS, parallel async writes can race the rm — the writeFile completes
 * AFTER rm deletes the temp dir, leaving stragglers that cause ENOTEMPTY on
 * the next rmdir. We retry up to 4 times with exponential backoff so the
 * cleanup still succeeds under heavy parallel I/O.
 *
 * Always succeeds or throws — never leaves the dir behind if the underlying
 * filesystem cooperates.
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      const code = err instanceof Error && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
      if (code !== "ENOTEMPTY" && code !== "EBUSY") throw err;
      await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
    }
  }
  // Final attempt: re-throw if we got here we genuinely can't clean up.
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}
