import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuditEvent, createLocalTaskStore } from "../src/index.js";

describe("JSONL resilience", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  afterEach(() => {
    warnSpy.mockClear();
  });

  it("readAuditEvents skips invalid lines and keeps valid rows", async () => {
    const dir = mkdtempSync(join(tmpdir(), "envoymesh-jsonl-"));
    const path = join(dir, "audit-events.jsonl");
    writeFileSync(
      path,
      [
        JSON.stringify(
          createAuditEvent({
            type: "p2p.trace",
            protocol: "relay.ping",
            outcome: "record",
            summary: "ok",
            eventId: "e1",
          }),
        ),
        "not-json{",
        JSON.stringify(
          createAuditEvent({
            type: "p2p.trace",
            protocol: "relay.pong",
            outcome: "record",
            summary: "ok2",
            eventId: "e2",
          }),
        ),
      ].join("\n") + "\n",
      "utf8",
    );

    const store = createLocalTaskStore(dir);
    const events = await store.readAuditEvents();
    expect(events).toHaveLength(2);
    expect(events[0]!.protocol).toBe("relay.ping");
    expect(events[1]!.protocol).toBe("relay.pong");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/skipped 1 invalid JSON/));
  });

  it("appendAuditEvent serializes concurrent writes without interleaving", async () => {
    const dir = mkdtempSync(join(tmpdir(), "envoymesh-jsonl-"));
    const store = createLocalTaskStore(dir);
    await Promise.all([
      store.appendAuditEvent(
        createAuditEvent({
          type: "p2p.trace",
          protocol: "a",
          outcome: "record",
          summary: "1",
          eventId: "id-1",
        }),
      ),
      store.appendAuditEvent(
        createAuditEvent({
          type: "p2p.trace",
          protocol: "b",
          outcome: "record",
          summary: "2",
          eventId: "id-2",
        }),
      ),
      store.appendAuditEvent(
        createAuditEvent({
          type: "p2p.trace",
          protocol: "c",
          outcome: "record",
          summary: "3",
          eventId: "id-3",
        }),
      ),
    ]);
    const raw = readFileSync(join(dir, "audit-events.jsonl"), "utf8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
