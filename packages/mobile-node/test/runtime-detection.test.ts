import { describe, expect, it } from "vitest";
import { isBrowserDevMode, isCapacitorNative } from "../src/runtime-detection.js";

describe("runtime-detection", () => {
  it("returns false for isCapacitorNative in a vitest/jsdom environment", () => {
    // jsdom does not set window.Capacitor, so we should be in dev/browser mode.
    expect(isCapacitorNative()).toBe(false);
  });

  it("returns true for isBrowserDevMode when no Capacitor global is present", () => {
    expect(isBrowserDevMode()).toBe(true);
  });

  it("isCapacitorNative is false when window is undefined", () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    try {
      delete (globalThis as { window?: unknown }).window;
      expect(isCapacitorNative()).toBe(false);
    } finally {
      if (originalWindow !== undefined) {
        (globalThis as { window?: unknown }).window = originalWindow;
      }
    }
  });
});
