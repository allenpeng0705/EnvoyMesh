import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTEXT_MEMORY_SETTINGS,
  resolveContextMemorySettings,
} from "../src/context-memory.js";

describe("resolveContextMemorySettings", () => {
  it("defaults to disabled native", () => {
    expect(resolveContextMemorySettings(undefined)).toMatchObject({
      enabled: false,
      backend: "native",
    });
    expect(DEFAULT_CONTEXT_MEMORY_SETTINGS.enabled).toBe(false);
  });

  it("requires enabled === true", () => {
    expect(resolveContextMemorySettings({ enabled: true }).enabled).toBe(true);
    expect(resolveContextMemorySettings({ enabled: false }).enabled).toBe(false);
    expect(resolveContextMemorySettings({} as any).enabled).toBe(false);
  });

  it("accepts openviking backend and trims endpoint/apiKey", () => {
    const s = resolveContextMemorySettings({
      enabled: true,
      backend: "openviking",
      endpoint: "  http://127.0.0.1:1933/  ",
      apiKey: "  secret  ",
    });
    expect(s.backend).toBe("openviking");
    expect(s.endpoint).toBe("http://127.0.0.1:1933/");
    expect(s.apiKey).toBe("secret");
  });

  it("drops invalid namespace; keeps valid", () => {
    expect(resolveContextMemorySettings({ namespace: "../x" }).namespace).toBeUndefined();
    expect(resolveContextMemorySettings({ namespace: "Work" }).namespace).toBe("work");
  });

  it("normalizes memorySeededAtByNamespace", () => {
    const s = resolveContextMemorySettings({
      memorySeededAt: "2026-01-01T00:00:00.000Z",
      memorySeededAtByNamespace: {
        work: "2026-02-01T00:00:00.000Z",
        "../bad": "nope",
        "": "nope",
      },
    });
    expect(s.memorySeededAt).toBe("2026-01-01T00:00:00.000Z");
    expect(s.memorySeededAtByNamespace).toEqual({
      work: "2026-02-01T00:00:00.000Z",
    });
  });
});
