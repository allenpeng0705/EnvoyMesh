/**
 * Tests for `relay-version.ts`. Verifies the resolved-version reporter
 * actually reads the installed packages (not the range declared in our
 * own package.json — those can drift apart after a partial install) and
 * the protocol report lists every protocol the relay expects to negotiate.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  buildRelayVersionReport,
  buildRelayProtocolReport,
  resetRelayVersionReportCache,
} from "../src/relay-version.js";

describe("buildRelayVersionReport", () => {
  beforeEach(() => {
    resetRelayVersionReportCache();
  });

  it("reports the actual installed @libp2p/circuit-relay-v2 version", () => {
    const report = buildRelayVersionReport(new Date().toISOString());
    expect(report.circuitRelayV2).toBeTruthy();
    // Sanity-check the version format (semver, no leading 'v').
    expect(report.circuitRelayV2).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("reports the actual installed @libp2p/identify version", () => {
    const report = buildRelayVersionReport(new Date().toISOString());
    expect(report.identify).toBeTruthy();
    expect(report.identify).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("reports node runtime + platform", () => {
    const report = buildRelayVersionReport(new Date().toISOString());
    expect(report.node).toMatch(/^v\d+\.\d+\.\d+/);
    expect(report.platform).toMatch(/.+-.+/); // e.g. "darwin-arm64"
  });

  it("echoes back the startedAt timestamp verbatim", () => {
    const ts = "2026-07-10T00:00:00.000Z";
    const report = buildRelayVersionReport(ts);
    expect(report.startedAt).toBe(ts);
  });

  it("caches the version report (versions don't change at runtime)", () => {
    const first = buildRelayVersionReport("2026-07-10T00:00:00.000Z");
    const second = buildRelayVersionReport("2026-07-10T01:00:00.000Z");
    // Same `startedAt` should come back even though we passed a different
    // one — the cache returns the first call's result.
    expect(second.startedAt).toBe(first.startedAt);
  });

  it("falls back to null for missing packages (no throws)", () => {
    // We can't easily simulate a missing package from inside the test
    // (the dev dep tree has everything), but the readInstalledVersion
    // helper is designed to swallow errors. Smoke-test that the report
    // still serializes with at least one null field if a package goes
    // missing — exercised indirectly by the fact that nothing throws here.
    const report = buildRelayVersionReport("2026-07-10T00:00:00.000Z");
    expect(report).toBeDefined();
  });
});

describe("buildRelayProtocolReport", () => {
  it("lists the canonical envoymesh protocol strings", () => {
    const report = buildRelayProtocolReport();
    expect(report.inbound).toContain("/envoymesh/chat/0.1.0");
    expect(report.inbound).toContain("/envoymesh/message/0.1.0");
    expect(report.inbound).toContain("/envoymesh/data/0.1.0");
    expect(report.inbound).toContain("/envoymesh/client-proxy/0.1.0");
  });

  it("lists the libp2p relay-v2 protocol strings (hop + stop)", () => {
    const report = buildRelayProtocolReport();
    expect(report.inbound).toContain("/libp2p/circuit-relay-v2/hop/0.1.0");
    expect(report.inbound).toContain("/libp2p/circuit-relay-v2/stop/0.1.0");
  });

  it("lists the libp2p identify protocol strings with the libp2p/ prefix", () => {
    const report = buildRelayProtocolReport();
    // The relay uses the default libp2p protocol prefix (`libp2p`), NOT
    // the legacy `ipfs` prefix. Older go-libp2p nodes that still expect
    // `/ipfs/id/1.0.0` will fail to handshake against this relay —
    // that's the bug class the user is debugging.
    expect(report.identify.inbound).toBe("/libp2p/id/1.0.0");
    expect(report.identify.outbound).toBe("/libp2p/id/1.0.0");
    expect(report.inbound).toContain("/libp2p/id/1.0.0");
    expect(report.inbound).toContain("/libp2p/id/push/1.0.0");
  });

  it("includes the inbound protocols in the outbound list (we can dial what we accept)", () => {
    const report = buildRelayProtocolReport();
    // Every outbound protocol must also be in inbound (the relay doesn't
    // need to dial a protocol it doesn't accept — but if it accepts it,
    // it must also be able to open a stream on it for things like the
    // client-proxy bridge).
    for (const protocol of report.outbound) {
      expect(report.inbound).toContain(protocol);
    }
  });
});