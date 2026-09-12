import { describe, expect, it } from "vitest";
import {
  codingHarnessSessionKey,
  isCodingHarnessSessionKey,
  parseAskCodingHarnessParams,
  parseClearCodingHarnessRuntimeParams,
  parseSetCodingHarnessRuntimeParams,
} from "../src/coding-harness-runtime.js";

describe("coding-harness-runtime", () => {
  it("builds coding session keys", () => {
    expect(codingHarnessSessionKey("ext:cursor:1")).toBe("coding:ext:cursor:1");
    expect(isCodingHarnessSessionKey("coding:x")).toBe(true);
    expect(isCodingHarnessSessionKey("owner:x")).toBe(false);
  });

  it("parses askCodingHarness params", () => {
    expect(
      parseAskCodingHarnessParams({
        codingSessionId: " sess-1 ",
        harness: "cursor",
        prompt: " hi ",
        cwd: " /tmp/p ",
        runtime: {
          model: " gpt-5 ",
          providerKind: "openai-compatible",
          endpoint: " https://x ",
          apiKey: "sk-should-not-appear",
        },
      }),
    ).toEqual({
      codingSessionId: "sess-1",
      harness: "cursor",
      prompt: "hi",
      cwd: "/tmp/p",
      runtime: {
        model: "gpt-5",
        providerKind: "openai-compatible",
        endpoint: "https://x",
      },
    });
  });

  it("rejects Tier A harnesses", () => {
    expect(() =>
      parseAskCodingHarnessParams({
        codingSessionId: "s",
        harness: "pi",
        prompt: "x",
        cwd: "/tmp",
      }),
    ).toThrow(/Tier B/);
  });

  it("parses set/clear runtime", () => {
    expect(
      parseSetCodingHarnessRuntimeParams({
        codingSessionId: "s1",
        cwd: "/proj",
        runtime: { apiKey: " sk ", model: "m" },
      }),
    ).toEqual({
      codingSessionId: "s1",
      cwd: "/proj",
      runtime: { apiKey: "sk", model: "m" },
    });
    expect(parseClearCodingHarnessRuntimeParams({ codingSessionId: "s1" })).toEqual({
      codingSessionId: "s1",
    });
  });
});
