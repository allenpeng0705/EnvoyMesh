/**
 * Local “two-node” smoke: runs integration tests — Trust-mode intro → bond flow
 * (`trust-mode-intro-bond-flow.test.ts`) and FS-B file-share bytes/hash e2e
 * (`file-share-e2e.test.ts`), plus broader document-agent and bridge coverage.
 *
 * Start from repo root: `npm run smoke:local` (nightly / full rehearsal).
 * For Phase 13-only PR signal use `npm run smoke:phase13`.
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
  join("apps", "node", "test", "library-import-e2e.test.ts"),
  join("apps", "node", "test", "share-inbox-e2e.test.ts"),
  join("apps", "node", "test", "two-node-file-share-e2e.test.ts"),
  join("apps", "node", "test", "document-agent-loop-integration.test.ts"),
  join("apps", "node", "test", "document-agent-e2e.test.ts"),
  join("apps", "node", "test", "document-agent-golden-path-e2e.test.ts"),
  join("apps", "node", "test", "document-agent-discovery-request.test.ts"),
  join("apps", "node", "test", "transfer-status-e2e.test.ts"),
  join("apps", "node", "test", "document-autonomy-enforcement.test.ts"),
  join("apps", "node", "test", "document-autonomy-libp2p-e2e.test.ts"),
  join("apps", "node", "test", "bridge-async-mesh-reply.test.ts"),
  join("apps", "node", "test", "bridge-execute-tool.test.ts"),
  join("apps", "node", "test", "bridge-discovery-async-e2e.test.ts"),
  join("apps", "node", "test", "discovery-search-agent-e2e.test.ts"),
  join("apps", "node", "test", "knowledge-query-agent-e2e.test.ts"),
  join("apps", "node", "test", "document-autonomy-referred-e2e.test.ts"),
  join("apps", "node", "test", "document-agent-publish-unpublish-e2e.test.ts"),
  join("apps", "node", "test", "bridge-knowledge-async-e2e.test.ts"),
  join("apps", "node", "test", "json-rpc-document-agent.test.ts"),
  join("apps", "node", "test", "agent-share-proposal-store.test.ts"),
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
  join("apps", "node", "test", "approval-executor.test.ts"),
  join("packages", "api", "test", "agent-interaction.test.ts"),
  join("packages", "mobile-node", "test", "document-agent-mobile-e2e.test.ts"),
  join("apps", "node", "test", "call-two-home-e2e.test.ts"),
  join("apps", "node", "test", "chain-three-home-smoke.test.ts"),
  join("apps", "node", "test", "webrtc-call-e2e.test.ts"),
  join("apps", "node", "test", "social-ui-e2e.test.ts"),
];

console.log("[smoke:local-two-node] Running integration tests via vitest…\n");

const result = spawnSync("npx", ["vitest", "run", ...relativeTests], {
  cwd: workspaceRoot,
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
