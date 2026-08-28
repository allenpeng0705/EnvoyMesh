import { describe, expect, it } from "vitest";
import { en } from "../../src/i18n/messages/en.js";
import { translate } from "../../src/i18n/translate.js";
import { getNetworkPresets, resolveNetworkPreset } from "../../src/lib/network-presets.js";

const t = (key: string) => translate(en, key);

describe("network presets", () => {
  it("maps lan-fast to same-wifi", () => {
    expect(resolveNetworkPreset("lan-fast", [])).toBe("same-wifi");
  });

  it("maps relay-only to friends-internet", () => {
    expect(resolveNetworkPreset("relay-only", ["cn-relay", "us-relay"])).toBe("friends-internet");
  });

  it("maps wan-default to explore-public", () => {
    expect(resolveNetworkPreset("wan-default", ["public-libp2p", "cn-relay", "us-relay"])).toBe("explore-public");
  });

  it("defines three user-facing presets", () => {
    expect(getNetworkPresets(t).map((p) => p.id)).toEqual(["same-wifi", "friends-internet", "explore-public"]);
  });

  it("localizes preset labels and descriptions", () => {
    const presets = getNetworkPresets(t);
    expect(presets[0]?.label).toBe("Same Wi‑Fi / home");
    expect(presets[1]?.description).toMatch(/relay/i);
  });
});
