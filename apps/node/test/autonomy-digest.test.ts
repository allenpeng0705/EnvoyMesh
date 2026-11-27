import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentActivityRecord } from "@envoymesh/api";
import {
  DigestGenerator,
  createDefaultDigestConfig,
} from "../src/digest-generator.js";
import {
  buildAutonomyDigest,
  summarizeAutonomyActivity,
} from "../src/autonomy-digest.js";
import { executeTool } from "../src/tool-registry.js";

describe("summarizeAutonomyActivity", () => {
  it("counts friend/social/doc kinds and keeps headlines", () => {
    const rows: AgentActivityRecord[] = [
      {
        activityId: "1",
        correlationId: "c1",
        domain: "social",
        kind: "social_proxy_transition",
        summary: "Found a Rust peer and said hello",
        createdAt: new Date().toISOString(),
      },
      {
        activityId: "2",
        correlationId: "c2",
        domain: "social",
        kind: "friend_autopilot_pass",
        summary: "Broadcast search completed",
        createdAt: new Date().toISOString(),
      },
      {
        activityId: "3",
        correlationId: "c3",
        domain: "knowledge",
        kind: "document_acq_stage",
        summary: "Looking in bonded libraries",
        createdAt: new Date().toISOString(),
      },
    ];
    const stats = summarizeAutonomyActivity(rows);
    expect(stats.socialProxyTransitionCount).toBe(1);
    expect(stats.friendAutopilotPassCount).toBe(1);
    expect(stats.documentAcqStageCount).toBe(1);
    expect(stats.headlines[0]).toContain("Rust");
  });
});

describe("buildAutonomyDigest + executeTool mesh.get-digest", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "envoymesh-autonomy-digest-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("builds digest from activity and executes via tool hook", async () => {
    const generator = new DigestGenerator(createDefaultDigestConfig(tempDir));
    const digest = await buildAutonomyDigest({
      generator,
      period: "daily",
      listActivity: async () => [
        {
          activityId: "1",
          correlationId: "c1",
          domain: "social",
          kind: "social_proxy_transition",
          summary: "Said hello to Alice",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    expect(digest.summaryText).toMatch(/Autonomy passes|Said hello|Mesh Activity/i);
    expect(digest.headlines.some((h) => h.includes("Alice"))).toBe(true);

    const result = await executeTool(
      "mesh.get-digest",
      { period: "daily" },
      {
        trustStore: {} as never,
        peerDirectoryStore: {} as never,
        taskStore: { appendAuditEvent: async () => {} } as never,
        agentIdentity: {} as never,
        ownerIdentity: { ownerId: "envoy:owner:test" },
        agentCredential: {} as never,
        getDigest: async ({ period }) => ({
          ok: true,
          period: period ?? "daily",
          summaryText: digest.summaryText,
          headlines: digest.headlines,
          digest,
        }),
      },
    );
    expect(result.ok).toBe(true);
    expect((result.result as { summaryText?: string })?.summaryText).toContain("Alice");
  });
});
