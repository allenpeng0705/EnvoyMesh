/**
 * Cost rollup store tests.
 *
 * Verifies:
 * - Empty file → empty list / zero summary
 * - recordCall merges into an existing (day, provider, model, task) row
 *   rather than appending a new line
 * - Cross-day / cross-provider / cross-task calls land in separate rows
 * - summarize aggregates by provider and period
 * - Filtering by since/until/providerId/taskType
 * - runRetention collapses old daily rows into monthly rows and drops
 *   very old monthly rows
 * - Persistence across store instances
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  COST_ROLLUP_DAILY_RETENTION_MS,
  COST_ROLLUP_MONTHLY_RETENTION_MS,
  createCostRollupStore,
  type CostRollupStore,
} from "@envoymesh/local-store";

const DAY_MS = 24 * 60 * 60 * 1000;
// Anchor "today" far enough in the future that 30-day-old data falls under GC.
const NOW = new Date("2026-08-15T12:00:00.000Z");

describe("createCostRollupStore", () => {
  let profileDir: string;
  let store: CostRollupStore;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-cost-"));
    store = createCostRollupStore(profileDir);
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("returns an empty summary when no calls have been recorded", async () => {
    const summary = await store.summarize();
    expect(summary).toEqual({
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      byProvider: [],
      byPeriod: [],
    });
  });

  it("merges two calls on the same day+provider+model+task into one row", async () => {
    const createdAt = "2026-08-15T10:00:00.000Z";
    await store.recordCall({
      createdAt,
      providerId: "cloud.anthropic",
      modelName: "claude-sonnet-4-20250514",
      taskType: "knowledge.query",
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
    });
    await store.recordCall({
      createdAt: "2026-08-15T11:30:00.000Z",
      providerId: "cloud.anthropic",
      modelName: "claude-sonnet-4-20250514",
      taskType: "knowledge.query",
      inputTokens: 200,
      outputTokens: 100,
      costUsd: 0.002,
    });

    const entries = await store.listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      period: "2026-08-15",
      granularity: "day",
      providerId: "cloud.anthropic",
      calls: 2,
      inputTokens: 300,
      outputTokens: 150,
      costUsd: 0.003,
    });
  });

  it("creates separate rows for different providers/models/tasks", async () => {
    const createdAt = "2026-08-15T10:00:00.000Z";
    await store.recordCall({
      createdAt,
      providerId: "cloud.anthropic",
      modelName: "claude-sonnet-4-20250514",
      taskType: "knowledge.query",
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
    });
    await store.recordCall({
      createdAt,
      providerId: "cloud.openai-compatible",
      modelName: "gpt-4o-mini",
      taskType: "chat.draft",
      inputTokens: 80,
      outputTokens: 40,
      costUsd: 0.0005,
    });

    const entries = await store.listEntries();
    expect(entries).toHaveLength(2);
  });

  it("aggregates summarize by provider (sorted by cost desc) and period", async () => {
    await store.recordCall({
      createdAt: "2026-08-14T10:00:00.000Z",
      providerId: "cloud.openai-compatible",
      modelName: "gpt-4o-mini",
      taskType: "chat.draft",
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.01,
    });
    await store.recordCall({
      createdAt: "2026-08-15T10:00:00.000Z",
      providerId: "cloud.anthropic",
      modelName: "claude-sonnet-4-20250514",
      taskType: "knowledge.query",
      inputTokens: 200,
      outputTokens: 100,
      costUsd: 0.05,
    });
    await store.recordCall({
      createdAt: "2026-08-15T11:00:00.000Z",
      providerId: "cloud.anthropic",
      modelName: "claude-sonnet-4-20250514",
      taskType: "knowledge.query",
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.02,
    });

    const summary = await store.summarize();
    expect(summary.totalCalls).toBe(3);
    expect(summary.totalCostUsd).toBeCloseTo(0.08, 5);
    expect(summary.byProvider[0]).toEqual({
      providerId: "cloud.anthropic",
      calls: 2,
      costUsd: 0.07,
    });
    expect(summary.byProvider[1]).toEqual({
      providerId: "cloud.openai-compatible",
      calls: 1,
      costUsd: 0.01,
    });
    // Periods sorted ascending.
    expect(summary.byPeriod.map((p) => p.period)).toEqual([
      "2026-08-14",
      "2026-08-15",
    ]);
  });

  it("filters by since/until against period string", async () => {
    await store.recordCall({
      createdAt: "2026-08-13T10:00:00.000Z",
      providerId: "p",
      modelName: "m",
      taskType: "t",
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0.01,
    });
    await store.recordCall({
      createdAt: "2026-08-15T10:00:00.000Z",
      providerId: "p",
      modelName: "m",
      taskType: "t",
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0.02,
    });

    const sinceFiltered = await store.summarize({ since: "2026-08-15T00:00:00.000Z" });
    expect(sinceFiltered.totalCalls).toBe(1);

    const untilFiltered = await store.summarize({ until: "2026-08-15T00:00:00.000Z" });
    expect(untilFiltered.totalCalls).toBe(1);
  });

  it("filters by providerId and taskType", async () => {
    await store.recordCall({
      createdAt: "2026-08-15T10:00:00.000Z",
      providerId: "cloud.openai",
      modelName: "gpt-4o-mini",
      taskType: "chat.draft",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });
    await store.recordCall({
      createdAt: "2026-08-15T11:00:00.000Z",
      providerId: "cloud.anthropic",
      modelName: "claude-sonnet-4-20250514",
      taskType: "knowledge.query",
      inputTokens: 20,
      outputTokens: 10,
      costUsd: 0.002,
    });

    const onlyAnthropic = await store.summarize({ providerId: "cloud.anthropic" });
    expect(onlyAnthropic.totalCalls).toBe(1);

    const onlyDraft = await store.summarize({ taskType: "chat.draft" });
    expect(onlyDraft.totalCalls).toBe(1);
  });

  it("persists across store instances (atomic write)", async () => {
    await store.recordCall({
      createdAt: "2026-08-15T10:00:00.000Z",
      providerId: "cloud.anthropic",
      modelName: "claude-sonnet-4-20250514",
      taskType: "knowledge.query",
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
    });

    const reopened = createCostRollupStore(profileDir);
    const summary = await reopened.summarize();
    expect(summary.totalCalls).toBe(1);
  });

  describe("runRetention", () => {
    it("collapses daily rows older than 30 days into monthly rows", async () => {
      // 40 days ago — past the 30-day daily retention.
      const oldDate = new Date(NOW.getTime() - 40 * DAY_MS);
      await store.recordCall({
        createdAt: oldDate.toISOString(),
        providerId: "cloud.anthropic",
        modelName: "claude-sonnet-4-20250514",
        taskType: "knowledge.query",
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      });
      await store.recordCall({
        createdAt: new Date(oldDate.getTime() + DAY_MS).toISOString(),
        providerId: "cloud.anthropic",
        modelName: "claude-sonnet-4-20250514",
        taskType: "knowledge.query",
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      });

      const result = await store.runRetention(NOW);
      expect(result.collapsed).toBe(1); // two daily rows → one monthly bucket

      const entries = await store.listEntries();
      const monthly = entries.filter((e) => e.granularity === "month");
      const daily = entries.filter((e) => e.granularity === "day");
      expect(monthly).toHaveLength(1);
      expect(monthly[0].calls).toBe(2);
      expect(monthly[0].costUsd).toBeCloseTo(0.02, 5);
      expect(daily).toHaveLength(0);
    });

    it("drops monthly rows older than 12 months", async () => {
      // 400 days ago — past the 12-month monthly retention.
      const veryOldDate = new Date(NOW.getTime() - 400 * DAY_MS);
      await store.recordCall({
        createdAt: veryOldDate.toISOString(),
        providerId: "cloud.anthropic",
        modelName: "claude-sonnet-4-20250514",
        taskType: "knowledge.query",
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      });

      // First run collapses it to monthly.
      await store.runRetention(NOW);
      // Second run should drop the monthly row.
      const result = await store.runRetention(NOW);
      expect(result.dropped).toBe(1);

      const entries = await store.listEntries();
      expect(entries).toHaveLength(0);
    });

    it("preserves recent daily rows untouched", async () => {
      // 5 days ago — well within retention.
      await store.recordCall({
        createdAt: new Date(NOW.getTime() - 5 * DAY_MS).toISOString(),
        providerId: "cloud.anthropic",
        modelName: "claude-sonnet-4-20250514",
        taskType: "knowledge.query",
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      });

      const result = await store.runRetention(NOW);
      expect(result.collapsed).toBe(0);
      expect(result.dropped).toBe(0);

      const entries = await store.listEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].granularity).toBe("day");
    });

    it("exposes retention constants with expected magnitudes", () => {
      expect(COST_ROLLUP_DAILY_RETENTION_MS).toBe(30 * DAY_MS);
      expect(COST_ROLLUP_MONTHLY_RETENTION_MS).toBe(365 * DAY_MS);
    });
  });
});
