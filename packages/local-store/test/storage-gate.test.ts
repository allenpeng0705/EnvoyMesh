import { describe, expect, it } from "vitest";
import {
  evaluateSqliteTriggersFromMetrics,
  SQLITE_TRIGGER_AUDIT_BYTES,
  SQLITE_TRIGGER_QUERY_MS,
} from "../src/storage-gate.js";

describe("storage-gate", () => {
  it("evaluateSqliteTriggersFromMetrics stays false below thresholds", () => {
    const result = evaluateSqliteTriggersFromMetrics({
      auditBytes: SQLITE_TRIGGER_AUDIT_BYTES - 1,
      fullAuditReadMs: SQLITE_TRIGGER_QUERY_MS - 1,
    });
    expect(result.met).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it("evaluateSqliteTriggersFromMetrics fires on size or latency", () => {
    expect(
      evaluateSqliteTriggersFromMetrics({
        auditBytes: SQLITE_TRIGGER_AUDIT_BYTES,
        fullAuditReadMs: 1,
      }).met,
    ).toBe(true);

    expect(
      evaluateSqliteTriggersFromMetrics({
        auditBytes: 1,
        fullAuditReadMs: SQLITE_TRIGGER_QUERY_MS,
      }).met,
    ).toBe(true);
  });
});
