/**
 * Phase 13 integration smoke — fast PR signal for actor disclosure, Activity, agent cards.
 *
 * Start from repo root: `npm run smoke:phase13`
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/** Repo root (`apps/node/src` → `../../../../`). */
const workspaceRoot = join(here, "..", "..", "..");
const relativeTests = [
  join("apps", "node", "test", "send-agent-chat-e2e.test.ts"),
  join("apps", "node", "test", "agent-card-a2e.test.ts"),
  join("apps", "node", "test", "approval-send-agent-chat-e2e.test.ts"),
  join("apps", "node", "test", "report-create-activity-e2e.test.ts"),
  join("apps", "node", "test", "task-activity-e2e.test.ts"),
  join("apps", "node", "test", "structured-preferred-e2e.test.ts"),
  join("apps", "node", "test", "json-rpc-phase13.test.ts"),
  join("apps", "node", "test", "agent-card-node-service-e2e.test.ts"),
  join("apps", "node", "test", "agent-card-a2e-full-daemon.test.ts"),
  join("apps", "node", "test", "daemon-agent-card-inbound.test.ts"),
  join("apps", "node", "test", "a2a-chat-notifications.test.ts"),
  join("apps", "node", "test", "agent-visibility-ws.test.ts"),
  join("apps", "node", "test", "approval-executor.test.ts"),
  join("packages", "api", "test", "agent-interaction.test.ts"),
];

console.log("[smoke:phase13-two-node] Running Phase 13 integration tests via vitest…\n");

const result = spawnSync("npx", ["vitest", "run", ...relativeTests], {
  cwd: workspaceRoot,
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
