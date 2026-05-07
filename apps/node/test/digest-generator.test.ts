import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  DigestGenerator,
  createDefaultDigestConfig,
  getDigestPeriodDates,
  generateSummaryText,
  buildGetDigestTool,
  buildSetDigestScheduleTool,
  buildGetDigestConfigTool,
  type DigestSummary,
} from "../src/digest-generator.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "envoymesh-digest-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("createDefaultDigestConfig", () => {
  it("creates config with defaults", () => {
    const config = createDefaultDigestConfig("/test/path");
    expect(config.frequency).toBe("daily");
    expect(config.outputDir).toBe("/test/path");
    expect(config.includeExternalAgentCalls).toBe(true);
    expect(config.includeDiscoveryQueries).toBe(true);
    expect(config.includePendingItems).toBe(true);
  });
});

describe("getDigestPeriodDates", () => {
  it("returns today for daily period", () => {
    const { start, end } = getDigestPeriodDates("daily");
    const now = new Date();

    expect(start.getDate()).toBe(now.getDate());
    expect(end.getDate()).toBe(now.getDate());
  });

  it("returns last 7 days for weekly period", () => {
    const { start, end } = getDigestPeriodDates("weekly");
    const diff = end.getTime() - start.getTime();
    const days = diff / (1000 * 60 * 60 * 24);

    // Should be between 6 and 7 days (depending on time of day)
    expect(days).toBeGreaterThan(6);
    expect(days).toBeLessThan(8);
  });
});

describe("generateSummaryText", () => {
  it("generates summary with all sections", () => {
    const digest: DigestSummary = {
      id: "test-1",
      period: "daily",
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      totalActions: 10,
      actionsByType: [
        { type: "chat.sent", count: 5, examples: ["Hello!"] },
        { type: "knowledge.queried", count: 3, examples: [] },
      ],
      contactsInteracted: [
        {
          contactOwnerId: "alice",
          contactDisplayName: "Alice",
          messageCount: 5,
          lastInteractionAt: new Date().toISOString(),
          escalated: false,
          pendingApproval: false,
        },
      ],
      newBonds: 2,
      bondsRevoked: 0,
      externalAgentActivity: [
        {
          agentId: "agent-1",
          agentName: "OpenClaw",
          actionCount: 3,
          lastActivityAt: new Date().toISOString(),
          actions: ["find_knowledge"],
        },
      ],
      proactiveActionsTriggered: [
        {
          triggerName: "Morning check-in",
          triggerType: "time",
          firedAt: new Date().toISOString(),
          actionTaken: "send_chat",
          success: true,
        },
      ],
      pendingApprovals: [
        {
          id: "approval-1",
          type: "send_chat",
          title: "Send message to Bob",
          priority: "normal",
          requestedAt: new Date().toISOString(),
        },
      ],
      pendingEscalations: [],
      modeTransitions: [
        { from: "reactive", to: "proactive", reason: "owner_disconnect", count: 1 },
      ],
      styleAdaptationsApplied: 2,
      summaryText: "",
    };

    const text = generateSummaryText(digest);

    expect(text).toContain("Daily Digest");
    expect(text).toContain("Total actions: 10");
    expect(text).toContain("Contacts interacted: 1");
    expect(text).toContain("New bonds established: 2");
    expect(text).toContain("OpenClaw: 3 actions");
    expect(text).toContain("Proactive Actions");
    expect(text).toContain("1 triggered");
    expect(text).toContain("Pending Approvals");
    expect(text).toContain("reactive → proactive");
  });

  it("handles empty digest", () => {
    const digest: DigestSummary = {
      id: "test-1",
      period: "daily",
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      totalActions: 0,
      actionsByType: [],
      contactsInteracted: [],
      newBonds: 0,
      bondsRevoked: 0,
      externalAgentActivity: [],
      proactiveActionsTriggered: [],
      pendingApprovals: [],
      pendingEscalations: [],
      modeTransitions: [],
      styleAdaptationsApplied: 0,
      summaryText: "",
    };

    const text = generateSummaryText(digest);

    expect(text).toContain("Total actions: 0");
    expect(text).not.toContain("External Agents");
    expect(text).not.toContain("Pending Approvals");
  });
});

describe("DigestGenerator", () => {
  describe("constructor and config", () => {
    it("creates generator with config", () => {
      const generator = new DigestGenerator(createDefaultDigestConfig(tempDir));
      const config = generator.getConfig();

      expect(config.frequency).toBe("daily");
      expect(config.outputDir).toBe(tempDir);
    });
  });

  describe("updateConfig", () => {
    it("updates frequency", () => {
      const generator = new DigestGenerator(createDefaultDigestConfig(tempDir));
      generator.updateConfig({ frequency: "weekly" });

      expect(generator.getConfig().frequency).toBe("weekly");
    });

    it("preserves existing values", () => {
      const generator = new DigestGenerator(createDefaultDigestConfig(tempDir));
      generator.updateConfig({ frequency: "weekly" });

      expect(generator.getConfig().outputDir).toBe(tempDir);
    });
  });

  describe("generateDigest", () => {
    it("generates digest with provided data", async () => {
      const generator = new DigestGenerator(createDefaultDigestConfig(tempDir));

      const digest = await generator.generateDigest("daily", {
        actionCounts: { "chat.sent": 5, "knowledge.queried": 3 },
        contactActivity: [
          {
            contactOwnerId: "alice",
            contactDisplayName: "Alice",
            messageCount: 5,
            lastInteractionAt: new Date().toISOString(),
            escalated: false,
            pendingApproval: false,
          },
        ],
        newBonds: 1,
        proactiveActions: [
          {
            triggerName: "Morning",
            triggerType: "time",
            firedAt: new Date().toISOString(),
            actionTaken: "send_chat",
            success: true,
          },
        ],
      });

      expect(digest.totalActions).toBe(8);
      expect(digest.contactsInteracted).toHaveLength(1);
      expect(digest.newBonds).toBe(1);
      expect(digest.proactiveActionsTriggered).toHaveLength(1);
      expect(digest.period).toBe("daily");
    });

    it("generates weekly digest", async () => {
      const generator = new DigestGenerator(createDefaultDigestConfig(tempDir));

      const digest = await generator.generateDigest("weekly", {});

      expect(digest.period).toBe("weekly");
    });
  });

  describe("saveDigest", () => {
    it("saves digest to file", async () => {
      const generator = new DigestGenerator(createDefaultDigestConfig(tempDir));
      const digest = await generator.generateDigest("daily", {});

      const filepath = await generator.saveDigest(digest);

      expect(filepath).toContain(tempDir);
      expect(filepath).toContain("daily_");
    });
  });

  describe("getNextScheduledTime", () => {
    it("returns null when frequency is off", () => {
      const generator = new DigestGenerator(createDefaultDigestConfig(tempDir));
      generator.updateConfig({ frequency: "off" });

      expect(generator.getNextScheduledTime()).toBeNull();
    });

    it("returns next day for daily", () => {
      const generator = new DigestGenerator(createDefaultDigestConfig(tempDir));
      generator.updateConfig({ frequency: "daily" });

      const next = generator.getNextScheduledTime();
      expect(next).not.toBeNull();
      expect(next!.getHours()).toBe(9);
    });

    it("returns next Monday for weekly", () => {
      const generator = new DigestGenerator(createDefaultDigestConfig(tempDir));
      generator.updateConfig({ frequency: "weekly" });

      const next = generator.getNextScheduledTime();
      expect(next).not.toBeNull();
      expect(next!.getHours()).toBe(9);
    });
  });
});

describe("buildGetDigestTool", () => {
  it("generates digest", async () => {
    const generator = new DigestGenerator(createDefaultDigestConfig(tempDir));
    const tool = buildGetDigestTool(generator);

    const result = await tool({});

    expect(result.ok).toBe(true);
    expect(result.digest).toBeDefined();
    expect(result.period).toBe("daily");
  });

  it("accepts period parameter", async () => {
    const generator = new DigestGenerator(createDefaultDigestConfig(tempDir));
    const tool = buildGetDigestTool(generator);

    const result = await tool({ period: "weekly" });

    expect(result.ok).toBe(true);
    expect(result.digest?.period).toBe("weekly");
  });

  it("returns error for invalid period", async () => {
    const generator = new DigestGenerator(createDefaultDigestConfig(tempDir));
    const tool = buildGetDigestTool(generator);

    const result = await tool({ period: "monthly" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Period");
  });
});

describe("buildSetDigestScheduleTool", () => {
  it("sets frequency", async () => {
    const generator = new DigestGenerator(createDefaultDigestConfig(tempDir));
    const tool = buildSetDigestScheduleTool(generator);

    const result = await tool({ frequency: "weekly" });

    expect(result.ok).toBe(true);
    expect(result.config?.frequency).toBe("weekly");
  });

  it("returns error for invalid frequency", async () => {
    const generator = new DigestGenerator(createDefaultDigestConfig(tempDir));
    const tool = buildSetDigestScheduleTool(generator);

    const result = await tool({ frequency: "invalid" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Frequency");
  });
});

describe("buildGetDigestConfigTool", () => {
  it("returns current config", async () => {
    const generator = new DigestGenerator(createDefaultDigestConfig(tempDir));
    generator.updateConfig({ frequency: "weekly" });
    const tool = buildGetDigestConfigTool(generator);

    const result = await tool({});

    expect(result.ok).toBe(true);
    expect(result.config.frequency).toBe("weekly");
    expect(result.nextScheduledAt).toBeDefined();
  });
});
