import { describe, expect, it, vi } from "vitest";
import {
  harnessNeedsResolve,
  harnessProbeLabelKey,
  probeCodingHarness,
  readyCodingHarnesses,
} from "../../src/lib/coding-harness-probe.js";

describe("coding-harness-probe", () => {
  it("collapses install/unknown to not-ready for display", () => {
    expect(harnessProbeLabelKey("ready")).toBe("ready");
    expect(harnessProbeLabelKey("checking")).toBe("checking");
    expect(harnessProbeLabelKey("install")).toBe("not-ready");
    expect(harnessProbeLabelKey("unknown")).toBe("not-ready");
    expect(harnessProbeLabelKey("not-ready")).toBe("not-ready");
  });

  it("treats pi stopped/starting as ready", async () => {
    const client = {
      getPiStatus: vi.fn(async () => ({ state: "stopped" })),
    };
    const r = await probeCodingHarness(client, "pi");
    expect(r.badge).toBe("ready");
  });

  it("marks ext agent not-installed as not-ready with command", async () => {
    const client = {
      probeExtAgent: vi.fn(async () => ({
        installState: "not-installed",
        reachable: false,
        installGuide: {
          installed: false,
          installCommand: "npm i -g @openai/codex",
          startHint: "Install Codex",
        },
      })),
    };
    const r = await probeCodingHarness(client, "codex");
    expect(r.badge).toBe("not-ready");
    expect(r.installCommand).toContain("codex");
    expect(harnessNeedsResolve(r.badge)).toBe(true);
  });

  it("readyCodingHarnesses keeps only ready ids", () => {
    expect(
      readyCodingHarnesses(
        {
          "envoy-harness": "ready",
          pi: "checking",
          codex: "install",
          cursor: "ready",
        },
        ["envoy-harness", "pi", "codex", "cursor"],
      ),
    ).toEqual(["envoy-harness", "cursor"]);
  });
});
