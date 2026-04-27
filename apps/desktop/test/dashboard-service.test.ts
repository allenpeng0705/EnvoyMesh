import {
  createApprovalRequest,
  createAuditEvent,
  createLocalTaskStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  exportPairingTimeline,
  getDashboardSnapshot,
  searchSharedVault,
  setTrustRecord,
  updateApprovalStatus,
} from "../src/main/dashboard-service.js";
import type { DashboardConfig } from "../src/shared/dashboard.js";

let rootDir: string;
let config: DashboardConfig;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "envoymesh-desktop-dashboard-"));
  config = {
    profileDir: join(rootDir, "profile"),
    vaultDir: join(rootDir, "shared_vault"),
  };
  await mkdir(config.vaultDir, { recursive: true });
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

describe("dashboard service", () => {
  it("builds a dashboard snapshot from local stores", async () => {
    const taskStore = createLocalTaskStore(config.profileDir);
    await taskStore.appendApprovalRequest(
      createApprovalRequest({
        approvalId: "approval-1",
        ownerId: "owner-1",
        taskId: "task-1",
        requestedAction: "purchase",
        reason: "Owner approval required.",
        createdAt: "2026-04-27T10:00:00.000Z",
      }),
    );
    await taskStore.appendAuditEvent(
      createAuditEvent({
        eventId: "audit-1",
        type: "message.verified",
        remotePeerId: "peer-a",
        outcome: "allow",
        summary: "Verified ping.",
        createdAt: "2026-04-27T10:01:00.000Z",
      }),
    );
    await createLocalTrustStore(config.profileDir).setTrustRecord({
      peerOwnerId: "envoy:owner:alice",
      level: "direct",
      now: "2026-04-27T10:02:00.000Z",
    });
    await writeFile(join(config.vaultDir, "notes.md"), "EnvoyMesh dashboard local vault search.");

    const snapshot = await getDashboardSnapshot(config);

    expect(snapshot.profile.owner.ownerId).toBeTruthy();
    expect(snapshot.approvals).toHaveLength(1);
    expect(snapshot.trustRecords).toHaveLength(1);
    expect(snapshot.observedPeers).toMatchObject([{ peerId: "peer-a", messageCount: 1 }]);
    expect(snapshot.vault).toMatchObject({ documentCount: 1, chunkCount: 1 });
  });

  it("updates approvals, trust records, and vault search through service methods", async () => {
    await createLocalTaskStore(config.profileDir).appendApprovalRequest(
      createApprovalRequest({
        approvalId: "approval-1",
        ownerId: "owner-1",
        taskId: "task-1",
        requestedAction: "purchase",
        reason: "Owner approval required.",
      }),
    );
    await writeFile(join(config.vaultDir, "notes.md"), "Private local dashboard search.");

    await expect(updateApprovalStatus(config, "approval-1", "approved")).resolves.toMatchObject({
      status: "approved",
    });
    await expect(
      setTrustRecord(config, {
        peerOwnerId: "envoy:owner:alice",
        level: "direct",
      }),
    ).resolves.toMatchObject({
      peerOwnerId: "envoy:owner:alice",
      level: "direct",
    });
    await expect(searchSharedVault(config, "dashboard")).resolves.toMatchObject([
      {
        relativePath: "notes.md",
      },
    ]);
  });

  it("keeps pairing approval pending when response delivery fails", async () => {
    const context = Buffer.from(
      JSON.stringify({
        requestId: "pair-1",
        requesterPeerId: "not-a-dialable-target",
        requesterOwnerId: "envoy:owner:peer",
        requesterDeviceId: "envoy:device:peer",
        requesterDevicePublicKeyPem: "peer-public-key",
        requestedDeviceProfile: "satellite",
        requestedCapabilities: ["ui.channel", "message.send"],
      }),
      "utf8",
    ).toString("base64url");

    await createLocalTaskStore(config.profileDir).appendApprovalRequest(
      createApprovalRequest({
        approvalId: "approval-pair-1",
        ownerId: "owner-1",
        taskId: "pairing:pair-1",
        requestedAction: "device.sync",
        reason: `Pairing request\nPAIRING_CONTEXT:${context}`,
      }),
    );

    await updateApprovalStatus(config, "approval-pair-1", "approved");
    const approvals = await createLocalTaskStore(config.profileDir).readApprovalRequests();
    const updated = approvals.find((approval) => approval.approvalId === "approval-pair-1");
    expect(updated?.status).toBe("pending");
  });

  it("exports pairing timeline json", async () => {
    const outputPath = join(rootDir, "pairing-timeline.json");
    const writtenPath = await exportPairingTimeline(config, outputPath);
    expect(writtenPath).toBe(outputPath);
  });
});
