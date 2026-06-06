/**
 * node-pty prebuilds ship spawn-helper without the executable bit on some npm installs.
 * Without +x, PTY spawn fails with "posix_spawnp failed."
 */
import { chmodSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

let nodePtyRoot;
try {
  nodePtyRoot = dirname(require.resolve("node-pty/package.json"));
} catch {
  process.exit(0);
}

function ensureExecutable(filePath) {
  if (!existsSync(filePath)) return;
  chmodSync(filePath, 0o755);
}

ensureExecutable(join(nodePtyRoot, "build", "Release", "spawn-helper"));
ensureExecutable(join(nodePtyRoot, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"));

const prebuildsRoot = join(nodePtyRoot, "prebuilds");
if (existsSync(prebuildsRoot)) {
  for (const dir of readdirSync(prebuildsRoot, { withFileTypes: true })) {
    if (dir.isDirectory()) {
      ensureExecutable(join(prebuildsRoot, dir.name, "spawn-helper"));
    }
  }
}
