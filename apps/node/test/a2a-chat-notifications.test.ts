/**
 * Integration: a2aChatNotifications posts local system lines in contact chat threads.
 */
import { createAgentCard, createReport } from "@envoymesh/protocol";
import type { ChatMessage } from "@envoymesh/api";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPhase13Harness,
  createPhase13TestNode,
  registerBondedPeer,
  waitForPhase13,
} from "./phase13-e2e-harness.js";

afterEach(async () => {
  await cleanupPhase13Harness();
});

function isSystemLine(msg: ChatMessage): boolean {
  return msg.sender.actorRole === "system" || msg.content?.text?.startsWith("Agent activity:");
}

describe("a2aChatNotifications (Phase 13E)", () => {
  it("milestones_only posts system chat line for report_received, not task_progress", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    await registerBondedPeer(alice, bob, "Bob");

    await alice.service.updateNodeConfig({
      a2aChatNotifications: "milestones_only",
    });

    const chatLines: ChatMessage[] = [];
    alice.service.on("chat:message", (msg) => {
      chatLines.push(msg);
    });

    const bobOwnerId = bob.profile.owner.ownerId;
    await alice.service.emitLocalOwnerReport(
      createReport({
        ownerId: alice.profile.owner.ownerId,
        taskId: "task-chat-notify-1",
        status: "completed",
        mode: "brief",
        summary: "Task finished with Bob's agent",
      }),
      { contactOwnerId: bobOwnerId },
    );

    await waitForPhase13(async () => chatLines.some(isSystemLine), 3000);
    expect(chatLines.some((msg) => msg.content?.text?.includes("Task finished"))).toBe(true);
    expect(chatLines.find(isSystemLine)?.recipient.ownerId).toBe(bobOwnerId);

    const beforeProgress = chatLines.length;
    await alice.service.recordAgentCardCached(
      bobOwnerId,
      createAgentCard({
        ownerId: bobOwnerId,
        displayName: "Bob Agent",
        nodeProfile: "primary",
        membership: ["task.execute"],
      }),
    );

    await waitForPhase13(async () => chatLines.length === beforeProgress, 500);
    expect(chatLines.length).toBe(beforeProgress);
  });

  it("off mode never posts system chat lines", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    await registerBondedPeer(alice, bob, "Bob");

    await alice.service.updateNodeConfig({ a2aChatNotifications: "off" });

    const chatLines: ChatMessage[] = [];
    alice.service.on("chat:message", (msg) => {
      chatLines.push(msg);
    });

    await alice.service.emitLocalOwnerReport(
      createReport({
        ownerId: alice.profile.owner.ownerId,
        taskId: "task-chat-off-1",
        status: "completed",
        mode: "brief",
        summary: "Should not appear in chat",
      }),
      { contactOwnerId: bob.profile.owner.ownerId },
    );

    await waitForPhase13(async () => (await alice.service.listAgentActivity({ limit: 5 })).length > 0);
    expect(chatLines.filter(isSystemLine)).toHaveLength(0);
  });
});
