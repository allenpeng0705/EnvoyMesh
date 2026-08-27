/**
 * Phase G / 12b — Pi coding backend resolver.
 */

import { describe, expect, it } from "vitest";

import { resolvePiCodingBackend } from "../src/pi-coding-backend.js";

describe("resolvePiCodingBackend", () => {
  it("defaults to pi", () => {
    expect(resolvePiCodingBackend(undefined)).toBe("pi");
    expect(resolvePiCodingBackend({})).toBe("pi");
    expect(resolvePiCodingBackend({ codingBackend: "pi" })).toBe("pi");
  });

  it("honors envoy-harness", () => {
    expect(resolvePiCodingBackend({ codingBackend: "envoy-harness" })).toBe(
      "envoy-harness",
    );
  });
});
