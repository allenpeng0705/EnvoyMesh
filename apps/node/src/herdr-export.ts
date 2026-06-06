import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { TerminalHerdrExportHintResult } from "@envoymesh/api";

/**
 * Writes scrollback to a profile-local export file for manual herdr import.
 * Programmatic herdr socket injection is not wired in v1 — see socketNote.
 */
export async function writeHerdrExportFile(
  profileDir: string,
  sessionId: string,
  title: string,
  scrollback: string,
): Promise<TerminalHerdrExportHintResult> {
  const dir = join(profileDir, "terminals", "herdr-export");
  await mkdir(dir, { recursive: true });
  const exportPath = join(dir, `${sessionId}.txt`);
  const header = `# EnvoyMesh terminal export — ${title}\n# sessionId=${sessionId}\n\n`;
  await writeFile(exportPath, header + scrollback, { mode: 0o600 });

  const herdrSocket = process.env.HERDR_SOCKET?.trim();
  const socketNote = herdrSocket
    ? `HERDR_SOCKET=${herdrSocket} is set. Upstream herdr socket API may accept pane content programmatically — evaluate against your herdr version before automating (not shipped in EnvoyMesh v1).`
    : "Optional: set HERDR_SOCKET to your herdr control socket and evaluate upstream socket API for programmatic pane import. EnvoyMesh v1 ships file export only.";

  return {
    exportPath,
    preview: scrollback.slice(-500),
    socketNote,
  };
}
