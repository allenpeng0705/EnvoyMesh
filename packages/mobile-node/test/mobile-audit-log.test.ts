/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { appendMobileAuditEvent, createMobileAuditRecord } from "../src/mobile-audit-log.js";

describe("mobile IPFS audit log", () => {
  it("appendMobileAuditEvent persists JSONL to localStorage fallback", async () => {
    const record = createMobileAuditRecord({
      type: "vault.ipfs_export.started",
      direction: "local",
      outcome: "record",
      summary: "test audit row",
    });
    await appendMobileAuditEvent("/audit-profile", record);
    const raw = localStorage.getItem("envoymesh_mobile_audit:/audit-profile");
    expect(raw).toContain("vault.ipfs_export.started");
    expect(raw).toContain("test audit row");
  });
});
