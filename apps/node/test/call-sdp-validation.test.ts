/**
 * Phase 42A — call-inbound.ts defensive SDP / ICE-candidate validation tests.
 *
 * Verifies:
 *  - validateSdpString accepts valid SDP, rejects empty/oversize/non-string
 *  - validateIceCandidate accepts standard SDP candidate grammar, rejects junk
 */

import { describe, expect, it } from "vitest";

import {
  MAX_SDP_BYTES,
  validateIceCandidate,
  validateSdpString,
} from "../src/call-inbound.js";

describe("validateSdpString", () => {
  it("accepts a non-empty short SDP", () => {
    expect(validateSdpString("v=0\r\n...\r\n")).toBe(true);
  });

  it("accepts a realistically-sized SDP (32 KB)", () => {
    const sdp = "v=0\r\n" + "a=rtpmap:0 PCMU/8000\r\n".repeat(1500);
    expect(sdp.length).toBeGreaterThan(20_000);
    expect(sdp.length).toBeLessThan(MAX_SDP_BYTES);
    expect(validateSdpString(sdp)).toBe(true);
  });

  it("accepts an SDP at exactly the size cap", () => {
    const sdp = "v=0\r\n" + "x".repeat(MAX_SDP_BYTES - 5);
    expect(validateSdpString(sdp)).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(validateSdpString("")).toBe(false);
  });

  it("rejects a string at size-cap + 1", () => {
    const sdp = "v=0\r\n" + "x".repeat(MAX_SDP_BYTES);
    expect(validateSdpString(sdp)).toBe(false);
  });

  it("rejects a 1 MB SDP (DoS attempt)", () => {
    const sdp = "v=0\r\n" + "x".repeat(1024 * 1024);
    expect(validateSdpString(sdp)).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(validateSdpString(undefined)).toBe(false);
    expect(validateSdpString(null)).toBe(false);
    expect(validateSdpString(42)).toBe(false);
    expect(validateSdpString({})).toBe(false);
    expect(validateSdpString(["v=0\r\n"])).toBe(false);
  });
});

describe("validateIceCandidate", () => {
  it("accepts a standard SDP candidate", () => {
    expect(validateIceCandidate("candidate:1 1 UDP 2113929471 192.0.2.1 12345 typ host")).toBe(
      true,
    );
  });

  it("accepts a srflx candidate with raddr/rport", () => {
    expect(
      validateIceCandidate(
        "candidate:2 1 UDP 1677729535 198.51.100.7 23456 typ srflx raddr 192.0.2.1 rport 12345",
      ),
    ).toBe(true);
  });

  it("accepts a candidate with generation", () => {
    expect(
      validateIceCandidate(
        "candidate:1 1 UDP 2113929471 192.0.2.1 12345 typ host generation 0",
      ),
    ).toBe(true);
  });

  it("accepts a candidate with network-cost", () => {
    expect(
      validateIceCandidate(
        "candidate:1 1 UDP 2113929471 192.0.2.1 12345 typ host network-cost 10",
      ),
    ).toBe(true);
  });

  it("rejects an empty candidate", () => {
    expect(validateIceCandidate("")).toBe(false);
  });

  it("rejects a candidate that doesn't start with 'candidate:'", () => {
    expect(validateIceCandidate("1 1 UDP 2113929471 192.0.2.1 12345 typ host")).toBe(false);
  });

  it("rejects a candidate with a leading space", () => {
    expect(validateIceCandidate(" candidate:1 1 UDP 2113929471 192.0.2.1 12345 typ host")).toBe(
      false,
    );
  });

  it("rejects a candidate with arbitrary junk", () => {
    expect(validateIceCandidate("not-a-real-candidate")).toBe(false);
    expect(validateIceCandidate("candidate:!@#$%")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(validateIceCandidate(undefined)).toBe(false);
    expect(validateIceCandidate(null)).toBe(false);
    expect(validateIceCandidate({})).toBe(false);
    expect(validateIceCandidate(123)).toBe(false);
  });

  it("rejects candidates longer than 1024 bytes", () => {
    expect(validateIceCandidate("candidate:" + "x".repeat(1100))).toBe(false);
  });
});