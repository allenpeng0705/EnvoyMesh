import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type {
  AgentActivityRecord,
  AuditEventSummary,
  CachedAgentCardSummary,
  NodeService,
  PendingApprovalSummary,
  TaskJournalSummary,
} from "@envoymesh/api";
import { ApprovalQueue, createApprovalItem } from "@envoymesh/api";
import {
  createDeviceCertificate,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { createReport } from "@envoymesh/protocol";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routeRpcMethod } from "../src/json-rpc-router.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";

describe("routeRpcMethod — Phase 13 RPC routing", () => {
  it("routes sendAgentChat", async () => {
    const sendAgentChat = vi.fn().mockResolvedValue({ messageId: "msg-agent-1" });
    const ns = { sendAgentChat } as unknown as NodeService;

    const result = await routeRpcMethod(ns, "sendAgentChat", {
      targetOwnerId: "envoy:owner:bob",
      text: "Hello from my agent",
    });

    expect(sendAgentChat).toHaveBeenCalledWith("envoy:owner:bob", "Hello from my agent");
    expect(result).toEqual({ messageId: "msg-agent-1" });
  });

  it("routes listAgentActivity with filters", async () => {
    const rows: AgentActivityRecord[] = [
      {
        activityId: "act-1",
        domain: "social",
        kind: "report_received",
        summary: "Peer report",
        createdAt: new Date().toISOString(),
      },
    ];
    const listAgentActivity = vi.fn().mockResolvedValue(rows);
    const ns = { listAgentActivity } as unknown as NodeService;

    const result = await routeRpcMethod(ns, "listAgentActivity", {
      limit: 50,
      domain: "social",
      correlationId: "corr-1",
    });

    expect(listAgentActivity).toHaveBeenCalledWith({
      since: undefined,
      until: undefined,
      limit: 50,
      correlationId: "corr-1",
      domain: "social",
      remoteOwnerId: undefined,
    });
    expect(result).toEqual(rows);
  });

  it("routes listAuditEvents and listTaskJournalEntries", async () => {
    const audits: AuditEventSummary[] = [
      {
        eventId: "audit-1",
        type: "message.verified",
        createdAt: new Date().toISOString(),
        outcome: "allow",
        summary: "Verified task.propose",
        taskId: "task-1",
        correlationId: "corr-1",
      },
    ];
    const journal: TaskJournalSummary[] = [
      {
        eventId: "journal-1",
        taskId: "task-1",
        eventType: "proposed",
        summary: "Task proposed",
        createdAt: new Date().toISOString(),
      },
    ];
    const listAuditEvents = vi.fn().mockResolvedValue(audits);
    const listTaskJournalEntries = vi.fn().mockResolvedValue(journal);
    const ns = { listAuditEvents, listTaskJournalEntries } as unknown as NodeService;

    expect(await routeRpcMethod(ns, "listAuditEvents", { taskId: "task-1", limit: 25 })).toEqual(audits);
    expect(listAuditEvents).toHaveBeenCalledWith({
      correlationId: undefined,
      taskId: "task-1",
      limit: 25,
    });

    expect(await routeRpcMethod(ns, "listTaskJournalEntries", { taskId: "task-1" })).toEqual(journal);
    expect(listTaskJournalEntries).toHaveBeenCalledWith({ taskId: "task-1", limit: undefined });
  });

  it("routes listAgentCards, getAgentCard, and requestAgentCard", async () => {
    const cards: CachedAgentCardSummary[] = [
      {
        ownerId: "envoy:owner:bob",
        displayName: "Bob's agent",
        capabilities: ["task.execute"],
        cachedAt: new Date().toISOString(),
      },
    ];
    const listAgentCards = vi.fn().mockResolvedValue(cards);
    const getAgentCard = vi.fn().mockResolvedValue(cards[0]);
    const requestAgentCard = vi.fn().mockResolvedValue({ ok: true });
    const ns = { listAgentCards, getAgentCard, requestAgentCard } as unknown as NodeService;

    expect(await routeRpcMethod(ns, "listAgentCards", {})).toEqual(cards);
    expect(await routeRpcMethod(ns, "getAgentCard", { ownerId: "envoy:owner:bob" })).toEqual(cards[0]);
    expect(getAgentCard).toHaveBeenCalledWith("envoy:owner:bob");

    expect(await routeRpcMethod(ns, "requestAgentCard", { targetOwnerId: "envoy:owner:bob" })).toEqual({
      ok: true,
    });
    expect(requestAgentCard).toHaveBeenCalledWith("envoy:owner:bob");
  });

  it("routes listPendingApprovals, approvePendingApproval, and rejectPendingApproval", async () => {
    const pending: PendingApprovalSummary[] = [
      {
        id: "approval-1",
        actionType: "send_chat",
        title: "Reply to Bob",
        description: "Draft ready",
        draftContent: "Hi Bob",
        contactOwnerId: "envoy:owner:bob",
        priority: "normal",
        requestedAt: new Date().toISOString(),
      },
    ];
    const listPendingApprovals = vi.fn().mockResolvedValue(pending);
    const approvePendingApproval = vi.fn().mockResolvedValue({ ok: true, messageId: "msg-1" });
    const rejectPendingApproval = vi.fn().mockResolvedValue({ ok: true });
    const ns = { listPendingApprovals, approvePendingApproval, rejectPendingApproval } as unknown as NodeService;

    expect(await routeRpcMethod(ns, "listPendingApprovals", {})).toEqual(pending);
    expect(await routeRpcMethod(ns, "approvePendingApproval", { itemId: "approval-1", notes: "ok" })).toEqual({
      ok: true,
      messageId: "msg-1",
    });
    expect(approvePendingApproval).toHaveBeenCalledWith("approval-1", "ok");

    expect(await routeRpcMethod(ns, "rejectPendingApproval", { itemId: "approval-1" })).toEqual({ ok: true });
    expect(rejectPendingApproval).toHaveBeenCalledWith("approval-1", undefined);
  });
});

describe("routeRpcMethod — Phase 13 NodeServiceImpl integration", () => {
  let profileDir: string;
  let vaultDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-json-rpc-p13-"));
    vaultDir = join(profileDir, "vault");
    await mkdir(vaultDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  function createNode(): NodeServiceImpl {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const profile = {
      owner,
      device,
      deviceCertificate: createDeviceCertificate({
        owner,
        device,
        deviceProfile: "primary",
        capabilities: ["mesh.listen", "message.send"],
      }),
    };
    const node = new NodeServiceImpl(
      { peerId: "local-peer" } as never,
      createLocalTrustStore(profileDir),
      createLocalPeerDirectoryStore(profileDir),
      createHumanProfileStore(profileDir),
      profileDir,
      profile,
      vaultDir,
    );
    node.bindCliTaskStore(createLocalTaskStore(profileDir));
    return node;
  }

  it("getOwnerDidPresentation returns did:key linked to owner id", async () => {
    const node = createNode();
    const profile = await node.getProfile();
    const presentation = (await routeRpcMethod(node, "getOwnerDidPresentation", {})) as {
      did: string;
      ownerId: string;
    };
    expect(presentation.ownerId).toBe(profile.owner.ownerId);
    expect(presentation.did).toMatch(/^did:key:z/);
  });

  it("resolveDidImport resolves owner did:key presentation", async () => {
    const node = createNode();
    const presentation = (await routeRpcMethod(node, "getOwnerDidPresentation", {})) as {
      did: string;
      ownerId: string;
    };
    const resolved = (await routeRpcMethod(node, "resolveDidImport", {
      input: presentation.did,
    })) as { ok: boolean; resolved?: { ownerId: string } };
    expect(resolved.ok).toBe(true);
    expect(resolved.resolved?.ownerId).toBe(presentation.ownerId);
  });

  it("getPeerReputationSummary returns local and anchor attestations shape", async () => {
    const node = createNode();
    const profile = await node.getProfile();
    const summary = (await routeRpcMethod(node, "getPeerReputationSummary", {
      peerOwnerId: profile.owner.ownerId,
    })) as { peerOwnerId: string; attestations: unknown[] };
    expect(summary.peerOwnerId).toBe(profile.owner.ownerId);
    expect(Array.isArray(summary.attestations)).toBe(true);
  });

  it("listAgentActivity returns rows after emitLocalOwnerReport via router", async () => {
    const node = createNode();
    const profile = await node.getProfile();
    const report = createReport({
      ownerId: profile.owner.ownerId,
      taskId: "task-rpc-1",
      status: "completed",
      mode: "brief",
      summary: "Finished knowledge search with Bob's agent",
    });

    await node.emitLocalOwnerReport(report);

    const rows = (await routeRpcMethod(node, "listAgentActivity", { limit: 10 })) as AgentActivityRecord[];
    expect(rows.some((row) => row.kind === "report_received")).toBe(true);
    expect(rows[0]?.summary).toContain("knowledge search");
  });

  it("listPendingApprovals and rejectPendingApproval round-trip through router", async () => {
    const node = createNode();
    const queue = new ApprovalQueue();
    node.bindApprovalQueue(queue);
    queue.add(
      createApprovalItem(
        "send_chat",
        "Reply",
        "Approve draft",
        "Hello from agent",
        { contactOwnerId: "envoy:owner:peer", contactDisplayName: "Peer" },
      ),
    );

    const pending = (await routeRpcMethod(node, "listPendingApprovals", {})) as PendingApprovalSummary[];
    expect(pending).toHaveLength(1);
    expect(pending[0]?.draftContent).toBe("Hello from agent");

    const rejected = await routeRpcMethod(node, "rejectPendingApproval", { itemId: pending[0]!.id });
    expect(rejected).toEqual({ ok: true });

    const after = (await routeRpcMethod(node, "listPendingApprovals", {})) as PendingApprovalSummary[];
    expect(after).toHaveLength(0);
  });
});
