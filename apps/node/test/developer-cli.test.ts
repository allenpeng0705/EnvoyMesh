import { createTaskJournalEntry } from "@envoymesh/protocol";
import {
  createApprovalRequest,
  createAuditEvent,
  createLocalTaskStore,
} from "@envoymesh/local-store";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseDeveloperCliArgs, runDeveloperCli } from "../src/developer-cli.js";

let profileDir: string;
let vaultDir: string;

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "envoymesh-developer-cli-"));
  profileDir = join(root, "profile");
  vaultDir = join(root, "shared_vault");
  await mkdir(vaultDir, { recursive: true });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
  await rm(vaultDir, { recursive: true, force: true });
});

describe("developer CLI", () => {
  it("parses commands and shared options", () => {
    expect(
      parseDeveloperCliArgs([
        "vault-search",
        "--profile",
        "./data/alice",
        "--vault",
        "./shared_vault",
        "--query",
        "distributed systems",
        "--limit",
        "5",
      ]),
    ).toMatchObject({
      command: "vault-search",
      profileDir: "./data/alice",
      vaultDir: "./shared_vault",
      query: "distributed systems",
      limit: 5,
    });
  });

  it("shows a profile summary", async () => {
    const result = await runDeveloperCli(["profile", "--profile", profileDir]);

    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toBe("Profile");
    expect(result.lines.some((line) => line.startsWith("Owner ID:"))).toBe(true);
    expect(result.lines.some((line) => line.startsWith("Device ID:"))).toBe(true);
  });

  it("lists audit events and observed peers", async () => {
    const store = createLocalTaskStore(profileDir);
    await store.appendAuditEvent(
      createAuditEvent({
        eventId: "audit-1",
        type: "message.verified",
        intent: "system.ping",
        remotePeerId: "peer-a",
        outcome: "allow",
        summary: "Verified ping.",
        createdAt: "2026-04-27T10:00:00.000Z",
      }),
    );
    await store.appendAuditEvent(
      createAuditEvent({
        eventId: "audit-2",
        type: "message.rejected",
        intent: "task.propose",
        remotePeerId: "peer-a",
        outcome: "deny",
        summary: "Rejected task.",
        createdAt: "2026-04-27T10:01:00.000Z",
      }),
    );

    const audit = await runDeveloperCli(["audit", "--profile", profileDir]);
    const peers = await runDeveloperCli(["peer-list", "--profile", profileDir]);

    expect(audit.lines).toContain("Audit events (2)");
    expect(audit.lines.join("\n")).toContain("Rejected task.");
    expect(peers.lines).toContain("Observed peers (1)");
    expect(peers.lines.join("\n")).toContain("peer-a messages=2");
  });

  it("lists tasks and pending approvals", async () => {
    const store = createLocalTaskStore(profileDir);
    await store.appendTaskJournalEntry(
      createTaskJournalEntry({
        eventId: "event-1",
        taskId: "task-1",
        eventType: "proposed",
        state: "negotiating",
        summary: "Proposed a task.",
        createdAt: "2026-04-27T10:00:00.000Z",
      }),
    );
    await store.appendApprovalRequest(
      createApprovalRequest({
        approvalId: "approval-1",
        ownerId: "owner-1",
        taskId: "task-1",
        requestedAction: "purchase",
        reason: "Owner approval required.",
        status: "pending",
        createdAt: "2026-04-27T10:01:00.000Z",
      }),
    );

    const tasks = await runDeveloperCli(["tasks", "--profile", profileDir]);
    const approvals = await runDeveloperCli([
      "approvals",
      "--profile",
      profileDir,
      "--status",
      "pending",
    ]);

    expect(tasks.lines).toContain("Task journal entries (1)");
    expect(tasks.lines.join("\n")).toContain("task-1 proposed/negotiating");
    expect(approvals.lines).toContain("Approval requests (1)");
    expect(approvals.lines.join("\n")).toContain("approval-1 status=pending");

    const approved = await runDeveloperCli([
      "approvals",
      "approve",
      "approval-1",
      "--profile",
      profileDir,
    ]);

    expect(approved.lines).toContain("Approval approved");
    expect(approved.lines.join("\n")).toContain("approval-1 status=approved");
  });

  it("indexes and searches the shared vault", async () => {
    await writeFile(
      join(vaultDir, "notes.md"),
      "Distributed systems need secure peer discovery and local-first audit logs.",
    );

    const index = await runDeveloperCli(["vault-index", "--vault", vaultDir]);
    const search = await runDeveloperCli([
      "vault-search",
      "--vault",
      vaultDir,
      "--query",
      "peer discovery",
    ]);

    expect(index.lines).toContain("Documents: 1");
    expect(index.lines.join("\n")).toContain("notes.md");
    expect(search.lines).toContain("Vault search results (1)");
    expect(search.lines.join("\n")).toContain("notes.md#0");
  });

  it("sets, lists, and removes trust records", async () => {
    const saved = await runDeveloperCli([
      "trust",
      "set",
      "envoy:owner:alice",
      "--profile",
      profileDir,
      "--level",
      "direct",
      "--name",
      "Alice",
      "--note",
      "Met in local test.",
    ]);
    const listed = await runDeveloperCli(["trust", "list", "--profile", profileDir]);
    const removed = await runDeveloperCli([
      "trust",
      "remove",
      "envoy:owner:alice",
      "--profile",
      profileDir,
    ]);

    expect(saved.lines).toContain("Trust record saved");
    expect(saved.lines.join("\n")).toContain("level=direct");
    expect(listed.lines).toContain("Trust records (1)");
    expect(listed.lines.join("\n")).toContain("envoy:owner:alice");
    expect(removed.lines).toContain("Trust record removed");
  });
});
