/**
 * Local “two-node” smoke: runs integration tests — Trust-mode intro → bond flow
 * (`trust-mode-intro-bond-flow.test.ts`) and FS-B file-share bytes/hash e2e
 * (`file-share-e2e.test.ts`).
 *
 * Start from repo root: `npm run smoke:local`
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/** Repo root (`apps/node/src` → `../../../../`). */
const workspaceRoot = join(here, "..", "..", "..");
const relativeTests = [
  join("apps", "node", "test", "trust-mode-intro-bond-flow.test.ts"),
  join("apps", "node", "test", "file-share-e2e.test.ts"),
  join("apps", "node", "test", "agent-share-proposal-store.test.ts"),
];

console.log("[smoke:local-two-node] Running integration tests via vitest…\n");

const result = spawnSync("npx", ["vitest", "run", ...relativeTests], {
  cwd: workspaceRoot,
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
