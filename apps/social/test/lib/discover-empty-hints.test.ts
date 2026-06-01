import { describe, expect, it } from "vitest";
import { translate } from "../../src/i18n/translate.js";
import { en } from "../../src/i18n/messages/en.js";
import {
  codeEmptyHint,
  nearbyEmptyHint,
  widerEmptyHint,
  widerTopicHint,
} from "../../src/lib/discover-empty-hints.js";

const t = (key: string) => translate(en, key);

describe("discover-empty-hints", () => {
  const base = {
    path: "nearby" as const,
    nodeStatus: "running",
    nodeConfig: { discoveryProfile: "lan-fast" as const, enableMdns: true },
    humanProfile: { profileVisibility: "private" as const },
  };

  it("nearby hints when node offline", () => {
    expect(nearbyEmptyHint({ ...base, nodeStatus: "offline" }, t)).toMatch(/connection is off/i);
  });

  it("nearby hints when local discovery disabled", () => {
    expect(
      nearbyEmptyHint(
        {
          ...base,
          nodeConfig: { discoveryProfile: "lan-fast", enableMdns: false },
        },
        t,
      ),
    ).toMatch(/Nearby discovery is turned off/i);
  });

  it("code hints suggest checking with friend", () => {
    expect(
      codeEmptyHint(
        {
          ...base,
          path: "code",
          nodeConfig: { discoveryProfile: "contacts-only" },
        },
        t,
      ),
    ).toMatch(/friend/i);
  });

  it("wider hints mention friends-only visibility for topic mode", () => {
    expect(
      widerEmptyHint(
        {
          ...base,
          path: "wider",
          widerMode: "topic",
        },
        t,
      ),
    ).toMatch(/friends-only/i);
  });

  it("wider topic banner for contacts-only", () => {
    expect(
      widerTopicHint(
        {
          ...base,
          path: "wider",
          nodeConfig: { discoveryProfile: "contacts-only" },
        },
        t,
      ),
    ).toMatch(/contacts-only/i);
  });
});
