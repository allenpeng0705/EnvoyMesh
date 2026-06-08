import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ApprovalQueue, createApprovalItem } from "@envoymesh/api";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const onDataHandlers: Array<(data: string) => void> = [];

const mockPty = {
  cols: 80,
  rows: 24,
  onData: vi.fn((cb: (data: string) => void) => {
    onDataHandlers.push(cb);
    return { dispose: vi.fn() };
  }),
  onExit: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
};

vi.mock("node-pty", () => ({
  spawn: vi.fn(() => mockPty),
}));

import { routeRpcMethod } from "../src/json-rpc-router.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { TerminalManager } from "../src/terminal-manager.js";

function emitPtyOutput(text: string): void {
  for (const handler of onDataHandlers) {
    handler(text);
  }
}

describe("NodeServiceImpl terminal session enrichment", () => {
  let profileDir: string;
  let node: NodeServiceImpl;
  let manager: TerminalManager;

  beforeEach(async () => {
    onDataHandlers.length = 0;
    profileDir = await mkdtemp(join(tmpdir(), "envoy-term-enrich-node-"));
    node = new NodeServiceImpl(
      undefined,
      createLocalTrustStore(profileDir),
      createLocalPeerDirectoryStore(profileDir),
      createHumanProfileStore(profileDir),
      profileDir,
    );
    manager = new TerminalManager({ profileDir });
    await manager.waitUntilReady();
    node.setTerminalManager(manager);

    const queue = new ApprovalQueue();
    node.bindApprovalQueue(queue);
    queue.add(
      createApprovalItem(
        "send_chat",
        "Approve draft",
        "Agent wants to send",
        "Hello",
        { contactOwnerId: "envoy:owner:peer", contactDisplayName: "Peer" },
      ),
    );
  });

  afterEach(async () => {
    const sessions = manager.listTerminalSessions();
    for (const session of sessions) {
      if (session.state === "running") {
        await manager.closeTerminalSession({ sessionId: session.sessionId });
      }
    }
    await rm(profileDir, { recursive: true, force: true });
  });

  it("listTerminalSessions enriches blocked badge from real approval queue", async () => {
    const created = await node.createTerminalSession({ title: "Agent shell" });
    emitPtyOutput("$ npm test\n");

    const sessions = await node.listTerminalSessions();
    const row = sessions.find((s) => s.sessionId === created.sessionId);
    expect(row?.activityBadge).toBe("blocked");
    expect(row?.foregroundHint).toBe("npm");
  });

  it("listTerminalSessions enriches working badge during OpenClaw ask", async () => {
    node.bindApprovalQueue(new ApprovalQueue());
    await node.createTerminalSession({ title: "Build" });
    (node as unknown as { _openClawAskInFlight: number })._openClawAskInFlight = 1;

    const sessions = await node.listTerminalSessions();
    expect(sessions.some((s) => s.activityBadge === "working")).toBe(true);

    (node as unknown as { _openClawAskInFlight: number })._openClawAskInFlight = 0;
  });

  it("routes listTerminalSessions enrichment through json-rpc router", async () => {
    await node.createTerminalSession({});
    const sessions = (await routeRpcMethod(node, "listTerminalSessions", {})) as Array<{
      activityBadge?: string;
    }>;
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0]?.activityBadge).toBe("blocked");
  });

  it("terminalGetHerdrExportHint writes scrollback export for running session", async () => {
    const created = await node.createTerminalSession({ title: "Export me" });
    manager.writeStdin(created.sessionId, Buffer.from("echo hi\n", "utf8"));
    emitPtyOutput("hi from shell\n");

    const hint = await node.terminalGetHerdrExportHint({ sessionId: created.sessionId });
    expect(hint.exportPath).toContain("herdr-export");
    expect(hint.preview).toContain("hi from shell");

    const raw = await readFile(hint.exportPath, "utf8");
    expect(raw).toContain("Export me");
  });

  it("terminalGetHerdrExportHint rejects exited sessions", async () => {
    const created = await node.createTerminalSession({});
    await node.closeTerminalSession({ sessionId: created.sessionId });
    // closeTerminalSession removes the session entirely, so the lookup
    // raises sessionNotFound. The contract is "rejects" — exact error
    // string tracks the manager implementation.
    await expect(node.terminalGetHerdrExportHint({ sessionId: created.sessionId })).rejects.toThrow(
      "terminal.sessionNotFound",
    );
  });
});
